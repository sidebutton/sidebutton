#!/bin/sh
# Entrypoint for the `browser` container profile: Xvfb + Chromium + the MCP
# server, all in one container, so that all 28 tools work without a host.
#
# Three things here are load-bearing and easy to get wrong:
#
# 1. The MCP server must be exec'd LAST. It owns PID 1's stdin/stdout, which is
#    the MCP channel — anything else writing to stdout corrupts the protocol.
#    Every diagnostic in this script therefore goes to stderr.
#
# 2. Chromium must open a REGULAR http(s) page. The extension refuses to attach
#    its debugger to restricted URLs (`about:`, `chrome:`, `devtools:` … see
#    RESTRICTED_URL_PREFIXES in the extension's background script). An
#    about:blank start page leaves the WebSocket connected but no tab attached,
#    which surfaces as `browser_connected: false` and looks like a broken build.
#
# 3. The extension is force-installed from the Chrome Web Store by the managed
#    policy baked into the image, so first launch needs egress to
#    clients2.google.com. That fetch can fail transiently — the agent fleet's
#    documented remedy is to restart Chrome and let the policy retry
#    (docs/agents/sidebutton/deployment.md). A container has no service manager
#    to do that, so this script owns the retry loop itself.

set -e

log() { echo "[sidebutton-browser] $*" >&2; }

DISPLAY="${DISPLAY:-:99}"
export DISPLAY
CHROME_USER_DATA_DIR="${CHROME_USER_DATA_DIR:-/home/node/.chrome-profile}"
START_URL="${SIDEBUTTON_START_URL:-https://sidebutton.com}"
EXTENSION_ID=odaefhmdmgijnhdbkfagnlnmobphgkij

# The extension port is a CLI option (`-p, --port`, cli.ts), not an environment
# variable, so it has to be read from the arguments we are about to pass on —
# both to poll the right health URL and to notice the case below.
#
# The extension dials a HARDCODED ws://localhost:9876/ws (extension/background.js),
# so the browser tools only ever work on 9876. Running the server on another port
# is legitimate, but Chromium then has nothing to connect to: launching it would
# burn three attach attempts and several minutes to arrive at a browser that can
# never attach. EXTENSION_PORT records that constraint.
detect_port() {
    _port=9876
    _want_value=""
    for _arg in "$@"; do
        if [ -n "$_want_value" ]; then
            _port="$_arg"
            _want_value=""
            continue
        fi
        case "$_arg" in
            --port=*) _port="${_arg#--port=}" ;;
            --port | -p) _want_value=1 ;;
        esac
    done
    # A non-numeric value means we misread the arguments; the default is safer
    # than a URL that can never resolve.
    case "$_port" in
        '' | *[!0-9]*) _port=9876 ;;
    esac
    printf '%s' "$_port"
}

EXTENSION_PORT=9876
PORT=$(detect_port "$@")
READY_URL="http://127.0.0.1:${PORT}/health"
# How long to give one Chromium attempt to install the extension and attach,
# and how many times to restart Chromium before giving up and running browserless.
ATTACH_TIMEOUT="${SIDEBUTTON_ATTACH_TIMEOUT:-60}"
ATTACH_RETRIES="${SIDEBUTTON_ATTACH_RETRIES:-3}"

log "starting Xvfb on ${DISPLAY}"
Xvfb "${DISPLAY}" -screen 0 1920x1080x24 -nolisten tcp >/dev/null 2>&1 &

i=0
while [ ! -e "/tmp/.X11-unix/X${DISPLAY#:}" ] && [ $i -lt 100 ]; do
    i=$((i + 1))
    sleep 0.1
done
[ -e "/tmp/.X11-unix/X${DISPLAY#:}" ] || log "WARNING: Xvfb socket never appeared; continuing anyway"

browser_connected() {
    curl -sf --max-time 2 "$READY_URL" 2>/dev/null | grep -q '"browser_connected":true'
}

launch_chromium() {
    # --no-sandbox: Chromium's setuid sandbox needs privileges a default
    # container does not grant. The container itself is the isolation boundary.
    # --disable-dev-shm-usage: routes shared memory to /tmp, so the caller never
    # has to remember --shm-size. The Toolkit gateway picks the run flags, not us.
    # No --load-extension / --disable-extensions-except here: those would block
    # the policy-installed extension.
    #
    # setsid puts Chromium in its own process group, so a retry can signal the
    # whole tree. Killing the parent alone reparents every renderer and crashpad
    # helper to PID 1, which does not reap them — they pile up as zombies.
    setsid chromium \
        --no-sandbox \
        --disable-dev-shm-usage \
        --disable-gpu \
        --no-first-run \
        --no-default-browser-check \
        --disable-background-timer-throttling \
        --disable-renderer-backgrounding \
        --disable-backgrounding-occluded-windows \
        --user-data-dir="${CHROME_USER_DATA_DIR}" \
        --homepage="${START_URL}" \
        "${START_URL}" \
        >/dev/null 2>&1 &
    CHROMIUM_PID=$!
}

supervise_browser() {
    # Wait for the server to bind before opening the start page, so the
    # extension has something to dial the moment it wakes.
    j=0
    while ! curl -sf --max-time 1 "$READY_URL" >/dev/null 2>&1; do
        j=$((j + 1))
        if [ $j -ge 120 ]; then
            log "server never bound ${READY_URL}; browser tools will be unavailable"
            return 1
        fi
        sleep 0.5
    done

    if [ "$PORT" != "$EXTENSION_PORT" ]; then
        log "server is on port ${PORT}, but the extension only ever dials ${EXTENSION_PORT} —"
        log "  skipping Chromium: it could not attach. Browser tools are unavailable;"
        log "  workflow, run-log, artifact and knowledge-pack tools work as normal."
        log "  Drop the --port override to enable browser automation."
        return 0
    fi

    attempt=1
    attached=""
    while [ "$attempt" -le "$ATTACH_RETRIES" ]; do
        log "launching chromium (attempt ${attempt}/${ATTACH_RETRIES}) at ${START_URL}"
        launch_chromium

        waited=0
        while [ "$waited" -lt "$ATTACH_TIMEOUT" ]; do
            if browser_connected; then
                log "extension attached after ${waited}s — all browser tools available"
                attached=1
                break
            fi
            sleep 2
            waited=$((waited + 2))
        done
        # Explicit `if` rather than `[ … ] && break`: under `set -e` a failing
        # AND-list is a portability trap between shells.
        if [ -n "$attached" ]; then
            break
        fi

        if [ -d "${CHROME_USER_DATA_DIR}/Default/Extensions/${EXTENSION_ID}" ]; then
            log "extension is installed but did not attach within ${ATTACH_TIMEOUT}s"
        else
            log "extension not installed — the Web Store fetch failed. Check egress to clients2.google.com"
        fi

        if [ "$attempt" -lt "$ATTACH_RETRIES" ]; then
            # Negative PID = the whole process group setsid created, so the
            # renderers go with the parent instead of becoming zombies.
            kill -- "-${CHROMIUM_PID}" 2>/dev/null || kill "$CHROMIUM_PID" 2>/dev/null || true
            wait "$CHROMIUM_PID" 2>/dev/null || true
        else
            # Last attempt: leave Chromium up rather than killing it. A slow Web
            # Store fetch can still land, and the tools recover on their own.
            log "giving up after ${ATTACH_RETRIES} attempts; browserless tools still work"
        fi
        attempt=$((attempt + 1))
    done

    # Stay alive as Chromium's parent for the life of the container. Without
    # this the subshell exits, node (PID 1) never reaps it, and it lingers as a
    # zombie — and any Chromium that later exits is reparented to PID 1 and does
    # the same. Waiting here also lets us say plainly when the browser dies,
    # instead of leaving every browser tool to fail with no explanation.
    wait "$CHROMIUM_PID" 2>/dev/null || true
    log "chromium exited — browser tools are no longer available"
}

supervise_browser &

log "handing stdio to the MCP server"
exec node /app/packages/server/bin/sidebutton.js "$@"
