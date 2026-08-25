/**
 * Terminal-window watcher: make closing a job's desktop terminal window kill the
 * Claude session it renders, and resolve the job that session was running.
 *
 * WHY: a dispatched job runs Claude interactively under tmux inside an
 * xfce4-terminal window (steps/shell.ts buildTerminalLaunch). tmux deliberately
 * decouples session life from window life — closing the window only detaches the
 * tmux client, so the session (and its claude) runs on invisibly. Operators read
 * "I closed the terminal" as "I stopped the job"; what they actually got was a
 * headless session the desktop no longer shows, a job the portal keeps calling
 * running, and an agent held busy for the full 24h workflow timeout (RCA
 * 2026-08-16, fleet auth wedge). This watcher restores the intended semantic:
 * an operator closing the window is a deliberate stop.
 *
 * DETECTION (verified empirically on a fleet VM, 2026-08-16):
 *   - operator close (WM_DELETE via the window ✕) → xfce4-terminal exits 0
 *   - X server death                              → xfce4-terminal exits 1
 *   - systemd cgroup sweep (service restart)      → killed by signal
 * so `code === 0` is the operator's close, gated further on: the X display still
 * being up (an X hiccup must never read as intent), the tmux session still
 * EXISTING (normal completion tears the session down first and the window then
 * closes itself with code 0 — that must stay a no-op), and this window being the
 * session's LAST viewer (`tmux list-clients` — when a duplicate window from a
 * fire-timeout re-dispatch, or an operator's own `tmux attach` elsewhere, still
 * shows the session, closing one viewer must not kill the work).
 *
 * ORDER OF OPERATIONS on a confirmed close — grace, then report, then kill —
 * every step of which is load-bearing:
 *   1. GRACE with the session still alive: the fleet health sweep polls on a
 *      ~15s cadence and fails steps whose recorded job_pid vanished ("PID gone"),
 *      which the playbook gate treats as retryable infra and re-dispatches — an
 *      operator stop must never be relabeled a crash, so claude keeps existing
 *      until the step is resolved. The same grace lets a Stop hook racing at
 *      natural job completion (its completion POST runs in the FOREGROUND of the
 *      hook, agent-runners base/14, typically a few seconds) record genuine
 *      success first — our report then lands as the endpoint's "Step already
 *      resolved" no-op, which is surfaced honestly as a tidy, not a stop. A
 *      pathologically slow hook (its usage POST budgets up to ~90s against a
 *      slow portal) can still lose this race; that tail is logged, not hidden.
 *   2. REPORT via the portal's existing POST /api/jobs/step-complete
 *      (session_id key): fails the step, frees the agent, resolves the job.
 *      Reported as 'failed' — job_steps has no cancelled state; the exported
 *      OPERATOR_CLOSE_REASON string is the single marker downstream consumers
 *      can key on until a first-class operator-cancel lane exists.
 *   3. KILL the tmux session (with one retry). Kill-last keeps the PID alive
 *      through the report so the sweep window above stays closed. A kill that
 *      still fails after the retry leaves a zombie session on a resolved step —
 *      logged as an error; operator intent (stop the job) already won.
 *
 * DECIDED SEMANTICS (documented, not bugs):
 *   - Detaching (Ctrl+B, D) inside the JOB'S OWN window is indistinguishable
 *     from closing it (the tmux client exits 0 either way) and therefore kills
 *     the job. To inspect and leave a job running, attach from a separate
 *     terminal (`tmux attach -t sbjob-<id>`) — that client isn't watched, and
 *     while it stays attached even closing the original window won't kill.
 *   - Closing the idle window of an already-completed job destroys that session
 *     (the step no-ops as already resolved) — the portal's recover / session
 *     chat affordance for it is deliberately gone: the operator said close.
 *   - A computer-use job automating this same desktop can close its own window
 *     programmatically (wmctrl/xdotool WM_DELETE is byte-identical to a human
 *     click) — packs driving the desktop must leave the job terminal alone.
 *
 * Everything here is defensive: listeners never throw, every branch logs its
 * decision, and tmux/portal probe failures choose the operator's intent over
 * silence — except the display probe, where a kill on a possibly-down X would
 * reintroduce the X-restart false positive this gate exists to prevent.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ChildProcess } from 'node:child_process';
import { portalBase, agentToken } from './tracker-session-env.js';

const execFileAsync = promisify(execFile);

/**
 * Grace between detecting the close and resolving the step, with the session
 * deliberately still alive throughout (see ORDER OF OPERATIONS above): keeps
 * the ~15s fleet PID sweep from relabeling the stop as retryable infra, and
 * gives a Stop hook racing at natural completion time to record success.
 */
export const WINDOW_CLOSE_RESOLVE_GRACE_MS = 10_000;

/** One kill retry after this pause before declaring a zombie. */
export const KILL_RETRY_DELAY_MS = 2_000;

/**
 * How long to wait for the spawned window's tmux client to create the session
 * before concluding the terminal failed pre-create and launching the job
 * headless instead. `tmux new-session -A` makes the recovery race-free: if the
 * slow window's client arrives after the fallback, it attaches to the fallback
 * session rather than starting a duplicate run.
 */
export const SESSION_CREATE_VERIFY_ATTEMPTS = 10;
export const SESSION_CREATE_VERIFY_INTERVAL_MS = 1_000;

/** Post-fallback confirmation that the headless spawn actually produced the session. */
export const FALLBACK_VERIFY_ATTEMPTS = 5;

/**
 * The single marker for an operator-close step failure. Owned here; downstream
 * consumers (gates, metrics, UI) key on this exact string until step-complete
 * grows a first-class operator-cancel status.
 */
export const OPERATOR_CLOSE_REASON = 'terminal window closed by operator';

const REPORT_TIMEOUT_MS = 10_000;
const TMUX_TIMEOUT_MS = 5_000;

/** What the exit handler concluded — one log/test-friendly word per outcome. */
export type WindowExitVerdict =
  /** Non-zero/signal exit: X died or the terminal crashed — session runs on headless. */
  | 'window_died_headless_continue'
  /** Clean exit but the display probe failed: possible X restart, never intent. */
  | 'display_down_leave'
  /** Clean exit, session already gone: normal post-completion teardown. */
  | 'teardown_noop'
  /** Clean exit before the session ever existed: job never started; step resolved so it can't wedge. */
  | 'closed_before_start'
  /** Another tmux client still shows the session — closing one viewer is not a stop. */
  | 'other_viewer_attached'
  /** Operator close: step failed via the report, session killed. */
  | 'killed_reported'
  /** Operator close of an already-resolved step (tidy): session killed, report no-oped. */
  | 'killed_already_resolved'
  /** Operator close on a session with no portal-assigned id: killed, nothing to report. */
  | 'killed_unreported'
  /** Operator close: session killed but the portal could not be told (logged). */
  | 'killed_report_failed'
  /** The handler itself failed; logged, session left as found. */
  | 'watch_error';

/** 'unknown' = the probe itself failed (timeout, no tmux) — distinct from a definitive no. */
export type SessionPresence = 'yes' | 'no' | 'unknown';

export type ReportOutcome = 'reported' | 'already_resolved' | 'failed';

export interface WindowWatchDeps {
  /** X liveness at decision time (steps/shell.ts probeX11Display). */
  probeDisplay(): Promise<boolean>;
  hasSession(sessionName: string): Promise<SessionPresence>;
  /** Attached client count for the session; 0 on any probe failure (proceed). */
  countClients(sessionName: string): Promise<number>;
  /** kill-session; resolves false (never throws) when the kill did not land. */
  killSession(sessionName: string): Promise<boolean>;
  /** POST step-complete for the closed session. Never throws. */
  reportClosed(sessionId: string): Promise<ReportOutcome>;
  delay(ms: number): Promise<void>;
  log(level: 'info' | 'warn' | 'error', message: string): void;
}

/**
 * State shared between the exit handler and the session-create verify poll, so
 * a window that already exited cleanly can never trigger the headless fallback
 * — resurrecting a job the operator just stopped (or re-running a fast script
 * after normal teardown) is the one thing the fallback must never do.
 */
export interface WindowWatchState {
  /** The sbjob session was seen to exist at least once. */
  observed: boolean;
  windowExited: boolean;
  windowExitCode: number | null;
}

export function createWindowWatchState(): WindowWatchState {
  return { observed: false, windowExited: false, windowExitCode: null };
}

/**
 * Request descriptor for the operator-close report. Pure so tests can pin the
 * exact wire shape. Targets POST /api/jobs/step-complete — session_id is one of
 * its accepted step keys and any non-success status maps to a failed step.
 * Caveat it inherits from the endpoint: only 'running' steps resolve; a
 * session-carrying step parked in another state answers 200 without changes.
 */
export function buildSessionClosedRequest(
  portalBaseUrl: string,
  token: string,
  sessionId: string,
): { url: string; init: RequestInit } {
  return {
    url: `${portalBaseUrl.replace(/\/+$/, '')}/api/jobs/step-complete`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        session_id: sessionId,
        status: 'failed',
        error: OPERATOR_CLOSE_REASON,
      }),
    },
  };
}

async function tmuxHasSession(sessionName: string): Promise<SessionPresence> {
  try {
    await execFileAsync('tmux', ['has-session', '-t', sessionName], { timeout: TMUX_TIMEOUT_MS });
    return 'yes';
  } catch (err) {
    // Exit 1 without a kill signal is tmux's definitive "no such session";
    // anything else (timeout SIGTERM, ENOENT, hung server) is an unknown, and
    // unknowns must not silently swallow an operator's close.
    const e = err as { code?: unknown; killed?: boolean };
    if (typeof e.code === 'number' && e.code === 1 && !e.killed) return 'no';
    return 'unknown';
  }
}

async function tmuxCountClients(sessionName: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      'tmux',
      ['list-clients', '-t', sessionName, '-F', 'x'],
      { timeout: TMUX_TIMEOUT_MS },
    );
    return stdout.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function tmuxKillSession(sessionName: string): Promise<boolean> {
  try {
    await execFileAsync('tmux', ['kill-session', '-t', sessionName], { timeout: TMUX_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

async function reportClosedToPortal(sessionId: string, log: WindowWatchDeps['log']): Promise<ReportOutcome> {
  const token = agentToken();
  if (!token) {
    log('warn', 'window-watch: no agent token in env — cannot report the closed session to the portal');
    return 'failed';
  }
  const { url, init } = buildSessionClosedRequest(portalBase(), token, sessionId);
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REPORT_TIMEOUT_MS) });
    if (!res.ok) {
      log('warn', `window-watch: step-complete answered HTTP ${res.status} for session ${sessionId}`);
      return 'failed';
    }
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    if (body?.message === 'Step already resolved') return 'already_resolved';
    return 'reported';
  } catch (err) {
    log('warn', `window-watch: step-complete POST failed for session ${sessionId}: ${err}`);
    return 'failed';
  }
}

export function defaultWindowWatchDeps(
  probeDisplay: () => Promise<boolean>,
  log: WindowWatchDeps['log'],
): WindowWatchDeps {
  return {
    probeDisplay,
    hasSession: tmuxHasSession,
    countClients: tmuxCountClients,
    killSession: tmuxKillSession,
    reportClosed: (sessionId) => reportClosedToPortal(sessionId, log),
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log,
  };
}

async function killWithRetry(sessionName: string, deps: WindowWatchDeps): Promise<boolean> {
  if (await deps.killSession(sessionName)) return true;
  await deps.delay(KILL_RETRY_DELAY_MS);
  if (await deps.killSession(sessionName)) return true;
  deps.log(
    'error',
    `window-watch: FAILED to kill tmux session ${sessionName} after retry — zombie session left behind on a resolved step`,
  );
  return false;
}

/**
 * Decide and act on the window process exiting. Never throws.
 */
export async function handleWindowExit(
  code: number | null,
  signal: NodeJS.Signals | null,
  sessionName: string,
  sessionId: string | undefined,
  deps: WindowWatchDeps,
  state: WindowWatchState = createWindowWatchState(),
): Promise<WindowExitVerdict> {
  try {
    state.windowExited = true;
    state.windowExitCode = code;
    if (code !== 0) {
      deps.log(
        'info',
        `window-watch: terminal for ${sessionName} died (code ${code}, signal ${signal ?? 'none'}) — session continues headless`,
      );
      return 'window_died_headless_continue';
    }
    if (!(await deps.probeDisplay())) {
      // Down or probe timeout — indistinguishable, and killing on a possibly
      // mid-restart X would reintroduce the false positive this gate prevents.
      deps.log(
        'warn',
        `window-watch: terminal for ${sessionName} exited cleanly but the X display probe failed (down, or >3s timeout on a loaded box) — NOT killing; the session continues headless`,
      );
      return 'display_down_leave';
    }
    const presence = await deps.hasSession(sessionName);
    if (presence === 'no') {
      if (state.observed || !sessionId) {
        deps.log('info', `window-watch: window for ${sessionName} closed after its session already ended — normal teardown, no action`);
        return 'teardown_noop';
      }
      // Clean window exit and the session was NEVER observed: the tmux client
      // died with the window before creating it, so the job never started and
      // never will — resolve the step or it wedges until sweep/timeout. The
      // same grace applies: if the session in fact lived and completed inside
      // the verify blind spot, the Stop hook's completion wins and our report
      // no-ops as already-resolved.
      deps.log(
        'warn',
        `window-watch: window for ${sessionName} closed before its session ever appeared — job never started; resolving the step`,
      );
      await deps.delay(WINDOW_CLOSE_RESOLVE_GRACE_MS);
      const early = await deps.reportClosed(sessionId);
      if (early === 'already_resolved') {
        deps.log('info', `window-watch: step for session ${sessionId} had already resolved — the session lived and finished unobserved`);
        return 'teardown_noop';
      }
      if (early === 'failed') {
        deps.log('error', `window-watch: could not resolve never-started session ${sessionId} — the step will wedge until sweep or timeout`);
      }
      return 'closed_before_start';
    }
    if (presence === 'unknown') {
      deps.log('warn', `window-watch: session state for ${sessionName} unknown (tmux probe failed) — proceeding on operator intent`);
    } else {
      state.observed = true;
    }
    const clients = await deps.countClients(sessionName);
    if (clients > 0) {
      deps.log(
        'info',
        `window-watch: window for ${sessionName} closed but ${clients} other client(s) still show the session — not killing`,
      );
      return 'other_viewer_attached';
    }

    if (!sessionId) {
      // Manual/operator run: no portal step to resolve, so no sweep race and no
      // completion race — kill immediately.
      const killed = await killWithRetry(sessionName, deps);
      deps.log('info', `window-watch: operator closed the window of manual session ${sessionName} — ${killed ? 'killed' : 'kill failed'}`);
      return 'killed_unreported';
    }

    deps.log(
      'info',
      `window-watch: operator closed the terminal window of ${sessionName} — resolving the job, then killing the session`,
    );
    await deps.delay(WINDOW_CLOSE_RESOLVE_GRACE_MS);
    const outcome = await deps.reportClosed(sessionId);
    const killed = await killWithRetry(sessionName, deps);
    if (outcome === 'already_resolved') {
      deps.log(
        'info',
        `window-watch: step for session ${sessionId} was already resolved (job finished first) — the close was a tidy; session ${killed ? 'killed' : 'kill failed'}`,
      );
      return 'killed_already_resolved';
    }
    if (outcome === 'reported') {
      deps.log('info', `window-watch: reported session ${sessionId} closed-by-operator to the portal; session ${killed ? 'killed' : 'kill failed'}`);
      return 'killed_reported';
    }
    deps.log(
      'error',
      `window-watch: session ${sessionId} killed on operator close but the portal report failed — the job will resolve only via sweep or timeout`,
    );
    return 'killed_report_failed';
  } catch (err) {
    try {
      deps.log('error', `window-watch: exit handler failed for ${sessionName}: ${err}`);
    } catch {
      // even the logger is untrusted here
    }
    return 'watch_error';
  }
}

/**
 * Confirm the window's tmux client actually created the session; if the window
 * is gone or hung without ever creating it, run `fallback()` so the job still
 * executes (headless) instead of silently running nothing. The shared state
 * makes this resurrection-proof: a window that already exited CLEANLY never
 * falls back — its session either lived (operator close / teardown handled by
 * the exit path) or the exit path owns the outcome. Only a window that crashed
 * (non-zero) or never exited while the session never appeared is a failed
 * launch worth recovering. Resolves true when the session was observed. Never
 * throws.
 */
export async function verifySessionCreated(
  sessionName: string,
  deps: Pick<WindowWatchDeps, 'hasSession' | 'delay' | 'log'>,
  fallback: () => void,
  state: WindowWatchState,
  attempts: number = SESSION_CREATE_VERIFY_ATTEMPTS,
): Promise<boolean> {
  try {
    for (let i = 0; i < attempts; i++) {
      if (state.observed) return true;
      if ((await deps.hasSession(sessionName)) === 'yes') {
        state.observed = true;
        return true;
      }
      if (state.windowExited) break;
      await deps.delay(SESSION_CREATE_VERIFY_INTERVAL_MS);
    }
    if (state.observed) return true;
    if (state.windowExited && state.windowExitCode === 0) {
      deps.log(
        'info',
        `window-watch: window for ${sessionName} exited cleanly before the session was observed — not falling back (exit path owns the outcome)`,
      );
      return false;
    }
    deps.log(
      'warn',
      `window-watch: tmux session ${sessionName} never appeared after the window spawn (window ${state.windowExited ? `exited ${state.windowExitCode}` : 'still running'}) — launching headless instead`,
    );
    fallback();
  } catch (err) {
    try {
      deps.log('error', `window-watch: session-create verify failed for ${sessionName}: ${err}`);
    } catch {
      // swallow
    }
  }
  return false;
}

export interface WatchTerminalWindowOpts {
  sessionName: string;
  /** Portal-assigned Claude session UUID; absent for manual runs (kill only, no report). */
  sessionId?: string;
  /** Spawn the headless `tmux new-session -d` variant of this launch. */
  headlessFallback: () => void;
}

/**
 * Wire the watcher onto a just-spawned windowed terminal. Call ONLY for the
 * xfce4-terminal branch: the headless `tmux new-session -d` client exits 0 the
 * moment the detached session exists — arming the operator-close handler there
 * would kill every headless job at birth.
 */
export function watchTerminalWindow(
  child: ChildProcess,
  opts: WatchTerminalWindowOpts,
  deps: WindowWatchDeps,
): void {
  const state = createWindowWatchState();

  // One recovery only, whichever signal arrives first (spawn error vs. the
  // verify poll giving up), and the fallback itself is then re-verified — a
  // fallback that "ran" but produced no session would otherwise strand the job
  // while the log claims a headless launch happened.
  let fallbackDone = false;
  const fallbackOnce = () => {
    if (fallbackDone) return;
    fallbackDone = true;
    try {
      opts.headlessFallback();
    } catch (err) {
      deps.log('error', `window-watch: headless fallback spawn failed for ${opts.sessionName}: ${err}`);
      return;
    }
    void (async () => {
      for (let i = 0; i < FALLBACK_VERIFY_ATTEMPTS; i++) {
        if ((await deps.hasSession(opts.sessionName)) === 'yes') {
          state.observed = true;
          deps.log('info', `window-watch: headless fallback session ${opts.sessionName} is up`);
          return;
        }
        await deps.delay(SESSION_CREATE_VERIFY_INTERVAL_MS);
      }
      deps.log(
        'error',
        `window-watch: headless fallback for ${opts.sessionName} never produced the session — the job is NOT running and needs a re-dispatch`,
      );
    })().catch(() => {});
  };

  child.once('error', (err) => {
    deps.log('warn', `window-watch: terminal spawn failed for ${opts.sessionName} (${err}) — launching headless instead`);
    fallbackOnce();
  });

  child.once('exit', (code, signal) => {
    void handleWindowExit(code, signal, opts.sessionName, opts.sessionId, deps, state);
  });

  void verifySessionCreated(opts.sessionName, deps, fallbackOnce, state);
}
