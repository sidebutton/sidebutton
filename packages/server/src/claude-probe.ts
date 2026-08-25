/**
 * Reading `pgrep -a claude` honestly (SCRUM-1983).
 *
 * `/health` reports which Claude Code processes are alive, and the orchestrator builds real
 * decisions on it: which agent is busy, which queued row may be dispatched, and — for a step bound
 * to a PID — whether a running job should be declared dead. The enumeration is one `execSync` with
 * a 3-second budget on a VM that may be running 5-8 concurrent `claude` sessions at 96% disk, so
 * it fails for perfectly ordinary reasons: the timeout fires, `fork` returns EAGAIN, the output
 * overruns `maxBuffer`.
 *
 * Every one of those used to come back as `[]` — the same payload an idle box sends. The
 * orchestrator, unable to tell them apart, read a failed probe as positive evidence that a working
 * box was idle: the agent flipped `busy → online` (restarting the 60-second dispatch gate) and its
 * still-running step was reaped as "Claude Code process exited (PID gone)".
 *
 * So the probe distinguishes two answers from one non-answer:
 *
 * | Result                | Meaning                                          |
 * |-----------------------|--------------------------------------------------|
 * | `sessions: [...]`     | These processes are alive                        |
 * | `sessions: []`        | `pgrep` ran and matched nothing — the box is idle |
 * | `sessions: null`      | The probe could not run; we know nothing          |
 *
 * The pure half lives here so the distinction is unit-testable without forking anything.
 */
import type { ClaudeSession } from './session-input.js';

/** Outcome of one `pgrep -a claude` probe: an answer, or the reason there isn't one. */
export interface ClaudeSessionProbe {
  /** The live sessions, or `null` when the probe could not run — never "[] because it failed". */
  sessions: ClaudeSession[] | null;
  /** Present iff `sessions` is null. */
  error?: string;
}

/** Parse `pgrep -a` stdout ("<pid> <full command line>" per line) into sessions. */
export function parseClaudeSessions(pgrepOut: string): ClaudeSession[] {
  return pgrepOut.trim().split('\n').filter(Boolean).map((line) => {
    const spaceIdx = line.indexOf(' ');
    return { pid: parseInt(line.substring(0, spaceIdx), 10), cmd: line.substring(spaceIdx + 1) };
  });
}

/**
 * Was this `execSync` throw an answer or a failure?
 *
 * `pgrep(1)` exits **1** when no process matched — it throws, but it ran, and "nothing is running"
 * is exactly what we asked. Exit 2 (syntax) and 3 (fatal) are pgrep failing; a `signal` means the
 * child was killed; a string `code` (ENOENT, ENOBUFS, EAGAIN, ETIMEDOUT) says why. Only the first
 * case may be reported as evidence.
 *
 * `code` is preferred over `signal` because Node sets BOTH on the two failures that matter here
 * and only `code` tells them apart: a maxBuffer overflow arrives as `{signal:'SIGTERM',
 * code:'ENOBUFS'}` and the 3-second timeout as `{signal:'SIGTERM', code:'ETIMEDOUT'}`. Reading
 * the signal first reported every overflow as a timeout — the one field in `/health` an operator
 * has to diagnose a box whose probe stopped answering, naming the wrong cause.
 */
export function classifyProbeFailure(err: unknown): ClaudeSessionProbe {
  const e = err as { status?: number | null; signal?: string | null; code?: string; message?: string } | null;
  if (e?.status === 1 && !e.signal) return { sessions: [] };
  const reason = typeof e?.code === 'string' ? e.code
    : e?.signal ? `killed by ${e.signal}`
    : e?.status != null ? `exit ${e.status}`
    : (e?.message || 'unknown');
  return { sessions: null, error: `pgrep failed: ${reason}` };
}
