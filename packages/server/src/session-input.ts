/**
 * Pure helpers for POST /api/session/input (SCRUM-1384).
 *
 * Dispatched Claude runs inside a tmux session named `sbjob-<session_id>` (see
 * @sidebutton/core `shell.ts`). This endpoint resolves that session and pastes
 * a single native user turn into the live Claude TUI. These helpers carry the
 * shell-safety + tmux-command logic so the route stays a thin orchestration
 * layer and the tricky parts are unit-tested in isolation (no routes spun up).
 */

/** Strict Claude Code session UUID (v4-shaped). */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Type guard: a string that is a valid session UUID (safe to use as a tmux target). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** tmux session name a dispatched Claude runs under. Mirrors core `shell.ts`. */
export function tmuxSessionName(sessionId: string): string {
  return `sbjob-${sessionId}`;
}

/** One live Claude process as enumerated by `pgrep -a claude`. */
export interface ClaudeSession {
  pid: number;
  cmd: string;
}

/**
 * Liveness gate (AC4): find the PID of the live Claude process for `sessionId`
 * by matching the `--session-id <uuid>` flag the launcher injected into its
 * command line. Returns undefined when no live process carries that id — the
 * caller maps that to HTTP 410 (session/pane gone). Reuses the same enumeration
 * the /health endpoint already exposes as `claude_sessions`.
 */
export function findClaudeSessionPid(
  sessions: ClaudeSession[],
  sessionId: string,
): number | undefined {
  if (!isUuid(sessionId)) return undefined;
  const needle = `--session-id ${sessionId}`;
  return sessions.find((s) => s.cmd.includes(needle))?.pid;
}

/**
 * tmux argv sequence that delivers one native user turn into `sessionName`:
 *
 *   1. `load-buffer -b <buffer> -`  — load the turn text from stdin into a
 *      uniquely-named buffer (text travels via stdin, never as an argv/shell
 *      token, so it cannot be interpreted as a tmux command or shell fragment).
 *   2. `paste-buffer -d -p -b <buffer> -t <session>` — bracketed (`-p`) paste so
 *      the Claude TUI treats it as literal pasted text (newlines do NOT submit);
 *      `-d` deletes the buffer afterwards.
 *   3. `send-keys -t <session> Enter` — only when `submit`; the discrete CR
 *      submits exactly one turn.
 *
 * A unique `bufferName` per request avoids races between concurrent injections.
 * Every element is a fixed flag or a validated/internal value — no untrusted
 * interpolation. Returns argv arrays for `tmux` (the leading "tmux" is implied).
 */
export function buildInputCommands(
  sessionName: string,
  bufferName: string,
  submit: boolean,
): string[][] {
  const commands: string[][] = [
    ['load-buffer', '-b', bufferName, '-'],
    ['paste-buffer', '-d', '-p', '-b', bufferName, '-t', sessionName],
  ];
  if (submit) {
    commands.push(['send-keys', '-t', sessionName, 'Enter']);
  }
  return commands;
}

/** Max accepted turn size (bytes) — a single composer message, not a file. */
export const SESSION_INPUT_BODY_LIMIT = 256 * 1024; // 256 KB
