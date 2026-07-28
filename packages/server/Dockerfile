# syntax=docker/dockerfile:1
#
# SideButton MCP server — the image published to the Docker MCP Catalog.
#
# Build from the REPOSITORY ROOT. @sidebutton/server depends on @sidebutton/core
# through `workspace:*`, so the pnpm workspace has to stay intact and the build
# context cannot be narrowed to packages/server:
#
#   docker build -f packages/server/Dockerfile -t mcp/sidebutton .
#
# Speak MCP over stdio, the way an MCP client starts it:
#
#   docker run -i --rm mcp/sidebutton
#
# Two profiles, selected with --target:
#
#   browser (default, all 28 tools) — bundles Chromium and force-installs the
#     published extension from the Chrome Web Store, so the browser tools work
#     with no host involvement. ~1.6 GB.
#
#   runner (7 tools, ~580 MB) — server only. Workflow, run-log, artifact and
#     browser-status tools plus all skill:// knowledge packs. The 21 browser
#     tools report "browser not connected": the extension dials 127.0.0.1:9876,
#     and in stdio mode that port is container-local by design, so a browser on
#     the *host* can never reach it.
#
#     docker build -f packages/server/Dockerfile --target runner -t sidebutton .
#
# See packages/server/README.md § Run with Docker.

FROM node:22-slim AS base
# pnpm is pinned to the root package.json `packageManager` version. Installed
# via npm rather than corepack: same pinning, without corepack's signature
# checks and download prompt, which are a recurring source of build breakage.
RUN npm install -g pnpm@9.15.1
# The repo's root .npmrc sets node-linker=hoisted, which flattens EVERY
# workspace's dependencies into one tree — 1.1 GB of website/desktop packages
# for a server that needs 97 MB. It is deliberately never copied into any
# stage, so pnpm's default isolated linker honours the --filter below.
WORKDIR /app

# ---------------------------------------------------------------------------
# deps — production dependencies only, resolved from the committed lockfile
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
# --frozen-lockfile keeps nightly rebuilds of a pinned commit reproducible.
# confirmModulesPurge=false: pnpm otherwise prompts before replacing an existing
# node_modules, which has no answer in a non-interactive build.
RUN pnpm install --frozen-lockfile --config.confirmModulesPurge=false \
    --prod --filter "@sidebutton/server..."

# ---------------------------------------------------------------------------
# builder — dev dependencies + TypeScript build
# ---------------------------------------------------------------------------
FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --config.confirmModulesPurge=false \
    --filter "@sidebutton/server..."
# Sources are copied by explicit path: a `COPY packages/server/ .` would carry a
# developer's untracked packages/server/.env into the image, and cli.ts does
# `import 'dotenv/config'` from the working directory.
COPY packages/core/tsconfig.json packages/core/tsup.config.ts packages/core/
COPY packages/core/src packages/core/src
COPY packages/server/tsconfig.json packages/server/tsup.config.ts packages/server/
COPY packages/server/src packages/server/src
# build:server is tsup alone. The full `build` also builds the browser dashboard,
# which an MCP client never loads; server.ts serves it only if the directory is
# present, so leaving it out is a supported configuration.
RUN pnpm --filter @sidebutton/core build \
    && pnpm --filter @sidebutton/server build:server

# ---------------------------------------------------------------------------
# runner
# ---------------------------------------------------------------------------
FROM node:22-slim AS runner
# git: knowledge-pack registries are git clones (packages/server/src/registry.ts).
# ca-certificates: HTTPS to those registries and to the portal API.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# node:22-slim ships an unprivileged `node` user (uid 1000); HOME is set
# explicitly because the config directory is resolved from $HOME and falls back
# to the working directory when it is unset.
ENV HOME=/home/node \
    NODE_ENV=production \
    SIDEBUTTON_CONTAINER=1

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=deps --chown=node:node /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps --chown=node:node /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=builder --chown=node:node /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=node:node /app/packages/server/dist ./packages/server/dist
COPY --chown=node:node packages/core/package.json ./packages/core/
COPY --chown=node:node packages/server/package.json ./packages/server/
COPY --chown=node:node packages/server/bin ./packages/server/bin
COPY --chown=node:node packages/server/defaults ./packages/server/defaults

USER node

# Dashboard/REST port, used only when the command is overridden to `serve`.
# Under stdio (the default) nothing is published: see the scope note above.
EXPOSE 9876

# First run seeds $HOME/.sidebutton from packages/server/defaults. Mount a
# volume there to keep workflows, run logs and installed packs across restarts.
ENTRYPOINT ["node", "/app/packages/server/bin/sidebutton.js"]
CMD ["serve", "--stdio"]

# ---------------------------------------------------------------------------
# browser — runner + Chromium + the extension, so all 28 tools work in-container
#
# The extension is NOT copied in. It is FSL-1.1-Apache-2.0 and ships only
# through the Chrome Web Store (sync-oss.sh keeps extension/ out of the public
# mirror), so a source copy could neither be built from the public repository
# nor redistributed. Instead a managed policy force-installs the published
# extension at first launch — the same mechanism the agent fleet uses. The image
# therefore carries four lines of JSON and no third-party code.
#
# Chromium, not Google Chrome: it is open source, honours the same
# ExtensionInstallForcelist policy (verified), and keeps a proprietary browser
# out of an image published and signed by Docker.
#
# This is the LAST stage, so it is what a plain `docker build` produces.
# ---------------------------------------------------------------------------
FROM runner AS browser

USER root

# chromium — the browser the extension drives.
# xvfb    — Chromium needs a display; the extension's service worker and the
#           debugger API are unreliable under headless for this workload.
# fonts   — without them every rendered page is tofu boxes, which silently
#           corrupts screenshots and text extraction.
# curl    — the entrypoint polls /health to detect the extension handshake.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium xvfb fonts-liberation fonts-dejavu-core curl \
    && rm -rf /var/lib/apt/lists/*

# Force-installs the published extension from the Web Store on first launch.
# See packages/server/chrome-policy/README.md.
COPY packages/server/chrome-policy/sidebutton.json /etc/chromium/policies/managed/sidebutton.json

COPY packages/server/scripts/docker-browser-entrypoint.sh /usr/local/bin/sidebutton-browser-entrypoint.sh
RUN chmod +x /usr/local/bin/sidebutton-browser-entrypoint.sh

# SIDEBUTTON_START_URL must stay a regular http(s) URL — see the entrypoint.
# Point it at http://127.0.0.1:9876/health on a network without Web Store
# access, though the extension will not install there either.
ENV DISPLAY=:99 \
    CHROME_USER_DATA_DIR=/home/node/.chrome-profile \
    SIDEBUTTON_START_URL=https://sidebutton.com

USER node
RUN mkdir -p /home/node/.chrome-profile

ENTRYPOINT ["/usr/local/bin/sidebutton-browser-entrypoint.sh"]
CMD ["serve", "--stdio"]
