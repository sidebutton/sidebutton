/**
 * Live session watcher (SCRUM-1972, SP2-K / PLAN §3) — the producer half of app-chat streaming.
 *
 * Claude Code fires a hook per tool call and one at Stop, and nothing in between: the agent's
 * narration exists only in the session JSONL until the whole transcript is uploaded at the end of the
 * turn. That is why the app chat used to show minutes of ✱ ticks and then a wall of text. This tails
 * each live session's JSONL from a byte cursor, projects the new records into chat deltas
 * (session-projection.ts) and POSTs them to the portal, which buffers them for the rail's poll.
 *
 * Three properties this must keep, because the rest of the feature is built on them:
 *
 *   - **It only renders.** Nothing here is the record. The Stop-hook transcript upload is unchanged
 *     and remains the only durable lane, so a watcher that dies, lags or was never upgraded costs
 *     liveness and nothing else — the rail degrades to today's behaviour (PLAN §2, AC5).
 *   - **It never blocks the box.** One stat per live session per second, reads capped per tick, POSTs
 *     fire with a short timeout and every failure is swallowed. A portal that 404s the route (an old
 *     deployment) is backed off from entirely rather than retried in a loop.
 *   - **It never invents continuity.** A rotated or truncated file resets the cursor AND tells the
 *     portal so, because the alternative is a rail splicing two files together by byte offset.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  batchEvents,
  extractSessionId,
  projectChunk,
  type DeltaEvent,
} from './session-projection.js';

/** How often each live session's JSONL is stat-polled. The rail's own budget is ~5 s per message. */
const POLL_MS = 1_000;
/** Process enumeration is a `pgrep` fork — much more expensive than a stat, so it runs 1 in 5. */
const ENUMERATE_EVERY = 5;
/** Bytes one session may consume per tick — a screenshot record alone can be megabytes. */
const MAX_READ_BYTES = 512 * 1024;
/** POST budget. Short: a delta that arrives late is worthless, and the next tick carries it anyway. */
const POST_TIMEOUT_MS = 8_000;
/** After the portal answers 404 (a deployment without the route) the watcher stops posting for this long. */
const UNSUPPORTED_BACKOFF_MS = 10 * 60 * 1000;

/** A live Claude process, as the server's `pgrep -a claude` enumeration reports it. */
export interface ClaudeProcess {
  pid: number;
  cmd: string;
}

interface Tracked {
  sessionId: string;
  file: string;
  /** Byte offset of the next unread byte. */
  cursor: number;
  /** Inode of the file this cursor belongs to — a new inode is a new file, not more of this one. */
  ino: number;
  /** The next POST must carry `reset: true` (first batch for this file, or it rotated under us). */
  reset: boolean;
  /** Wall clock of the last time this session's file existed — drives eviction of dead sessions. */
  seenAt: number;
}

export interface SessionWatcherOptions {
  /** Live Claude processes. Injected so the watcher is testable without forking `pgrep`. */
  listSessions: () => ClaudeProcess[];
  /** Where Claude keeps its session logs. Defaults to `~/.claude/projects`. */
  projectsDir?: string;
  now?: () => number;
}

/** Env flag semantics, matching telemetry.ts: present and not an explicit off-value means on. */
const OFF_VALUES = new Set(['0', 'false', 'off', 'no']);

/**
 * Is the watcher allowed to run?
 *
 * Default-on wherever the outbound hook credentials exist — the watcher speaks to exactly the portal
 * the Stop hook and the artifact upload already speak to, so an agent VM that can upload a transcript
 * can stream one. `SIDEBUTTON_SESSION_WATCHER=0` is the off switch for a box that must not.
 */
export function isSessionWatcherEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.SIDEBUTTON_SESSION_WATCHER ?? '').trim().toLowerCase();
  if (flag && OFF_VALUES.has(flag)) return false;
  const token = env.AGENT_TOKEN || env.SIDEBUTTON_AGENT_TOKEN;
  const name = env.AGENT_NAME || env.SIDEBUTTON_AGENT_NAME;
  return Boolean(token && name);
}

/** The portal creds, read the same way every other outbound call in this package reads them. */
function creds(env: NodeJS.ProcessEnv = process.env): { token: string; agentName: string; portalUrl: string } | null {
  const token = env.AGENT_TOKEN || env.SIDEBUTTON_AGENT_TOKEN;
  const agentName = env.AGENT_NAME || env.SIDEBUTTON_AGENT_NAME;
  if (!token || !agentName) return null;
  const portalUrl = (env.PORTAL_URL || 'https://sidebutton.com').replace(/\/+$/, '');
  return { token, agentName, portalUrl };
}

/**
 * Find a session's JSONL under `~/.claude/projects/<mangled-cwd>/<uuid>.jsonl`.
 *
 * Searched by filename across the project directories rather than derived from the cwd: the
 * directory name is Claude's own mangling of the working directory (`/home/agent/workspace` →
 * `-home-agent-workspace`), and reimplementing that rule here would break the day it changes. The
 * uuid is unique, so the search is unambiguous and one readdir deep.
 */
export function findSessionFile(sessionId: string, projectsDir: string): string | null {
  let dirs: string[];
  try {
    dirs = fs.readdirSync(projectsDir);
  } catch {
    return null;
  }
  const needle = `${sessionId}.jsonl`;
  for (const dir of dirs) {
    const candidate = path.join(projectsDir, dir, needle);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch { /* not this project dir */ }
  }
  return null;
}

export class SessionWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly tracked = new Map<string, Tracked>();
  private readonly projectsDir: string;
  private readonly listSessions: () => ClaudeProcess[];
  private readonly now: () => number;
  private ticks = 0;
  private busy = false;
  /** Set when the portal says it has no such route — stops the POSTs until the backoff expires. */
  private unsupportedUntil = 0;

  constructor(opts: SessionWatcherOptions) {
    this.listSessions = opts.listSessions;
    this.projectsDir = opts.projectsDir || path.join(os.homedir(), '.claude', 'projects');
    this.now = opts.now || (() => Date.now());
  }

  start(): void {
    if (this.timer) return;
    // `unref` so the watcher can never be the reason a CLI process refuses to exit.
    this.timer = setInterval(() => { void this.tick(); }, POLL_MS);
    this.timer.unref?.();
    console.log('[session-watcher] tailing live Claude sessions for the app-chat stream');
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Nothing to flush: a delta the rail has not received by shutdown is one the durable transcript
    // upload will deliver in full. Draining here would hold a systemd stop open for a POST that
    // buys the operator nothing.
    this.tracked.clear();
  }

  /** One poll. Public for the tests, which drive it by hand rather than by clock. */
  async tick(): Promise<void> {
    // A slow portal must not let ticks stack up into concurrent reads of the same cursor.
    if (this.busy) return;
    this.busy = true;
    try {
      if (this.ticks % ENUMERATE_EVERY === 0) this.enumerate();
      this.ticks++;
      for (const entry of [...this.tracked.values()]) {
        const events = this.read(entry);
        if (!events.length) continue;
        // The cursor has already moved past these events, so a flush that does not land is a hole in
        // the byte range — and a hole the portal cannot see is one the rail would splice over as
        // though the turn had been continuous (PLAN §5.5). The reset flag therefore SURVIVES a failed
        // flush and rides the next one, which is the portal's only chance to tell its readers.
        const delivered = await this.post(entry.sessionId, events, entry.reset);
        entry.reset = !delivered;
      }
    } catch (err) {
      // The watcher is a nicety; a bug in it may not take the daemon's request loop down with it.
      console.warn(`[session-watcher] tick failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.busy = false;
    }
  }

  /** Refresh the set of sessions being tailed from the live process list. */
  private enumerate(): void {
    const live = new Set<string>();
    for (const proc of this.listSessions()) {
      const sessionId = extractSessionId(proc.cmd);
      if (sessionId) live.add(sessionId);
    }
    for (const sessionId of live) {
      if (this.tracked.has(sessionId)) continue;
      const file = findSessionFile(sessionId, this.projectsDir);
      if (!file) continue;
      let ino = 0;
      let size = 0;
      try {
        const stat = fs.statSync(file);
        ino = Number(stat.ino);
        size = stat.size;
      } catch { continue; }
      // Start at the END of what already exists. The history is the transcript's job — replaying a
      // three-hour session into the rail the moment the daemon restarts would flood the ring with
      // turns the operator already read, and evict the live one to do it.
      this.tracked.set(sessionId, { sessionId, file, cursor: size, ino, reset: true, seenAt: this.now() });
    }
    // A session whose process is gone gets one grace period — the Stop hook and the process exit race,
    // and the last records of a turn are written right at that boundary.
    for (const [sessionId, entry] of this.tracked) {
      if (live.has(sessionId)) { entry.seenAt = this.now(); continue; }
      if (this.now() - entry.seenAt > 30_000) this.tracked.delete(sessionId);
    }
  }

  /** Read and project whatever is new in one session's file. */
  private read(entry: Tracked): DeltaEvent[] {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(entry.file);
    } catch {
      // The file went away (a cleaned session dir). Re-resolve on the next enumeration.
      this.tracked.delete(entry.sessionId);
      return [];
    }
    const ino = Number(stat.ino);
    if (ino !== entry.ino || stat.size < entry.cursor) {
      // Rotated, or truncated and rewritten. The cursor means nothing against the new file, and the
      // portal has to be told so — a ring that interleaves two files by byte offset renders a turn
      // that never happened.
      entry.ino = ino;
      entry.cursor = 0;
      entry.reset = true;
    }
    if (stat.size <= entry.cursor) return [];
    const want = Math.min(stat.size - entry.cursor, MAX_READ_BYTES);
    const buf = Buffer.alloc(want);
    let read = 0;
    let fd: number | null = null;
    try {
      fd = fs.openSync(entry.file, 'r');
      read = fs.readSync(fd, buf, 0, want, entry.cursor);
    } catch {
      return [];
    } finally {
      if (fd !== null) { try { fs.closeSync(fd); } catch { /* already gone */ } }
    }
    if (read <= 0) return [];
    // Cut the chunk at the last NEWLINE BYTE before decoding, so the decoder never sees half of a
    // multi-byte character and the cursor is pure byte arithmetic. Decoding first and re-measuring
    // the text instead would drift the moment a read boundary split an em dash: the replacement
    // character re-encodes to three bytes where one was read, and every later cursor in the file is
    // wrong by the difference — which silently eats the record after a big one.
    const raw = buf.subarray(0, read);
    const lastNl = raw.lastIndexOf(0x0a);
    if (lastNl === -1) {
      if (read >= MAX_READ_BYTES) {
        // A single record longer than one tick's read budget — a base64 screenshot, or a tool result
        // the size of a small book. Skipping it costs one dropped ✱ row; not skipping it wedges this
        // session's cursor forever, which costs every row after it.
        entry.cursor += read;
      }
      return [];
    }
    const { events } = projectChunk(raw.subarray(0, lastNl + 1).toString('utf8'), entry.cursor);
    entry.cursor += lastNl + 1;
    return events;
  }

  /**
   * POST one session's queued events, in the ingest's batch sizes. Answers whether the WHOLE queue
   * landed — anything less makes the range a gap the next POST has to announce as a reset.
   */
  private async post(sessionId: string, events: DeltaEvent[], reset: boolean): Promise<boolean> {
    if (this.now() < this.unsupportedUntil) return false;
    const env = creds();
    if (!env) return false;
    let first = reset;
    for (const batch of batchEvents(events)) {
      const ok = await this.postBatch(env, sessionId, batch, first);
      first = false;
      // A batch that did not land ends the flush: pushing the rest would hand the portal a hole in
      // the middle of a cursor range it has no way to detect. What did land stays landed, and the
      // caller flags the next POST as a reset so no reader treats the two sides as continuous.
      if (!ok) return false;
    }
    return true;
  }

  private async postBatch(
    env: { token: string; agentName: string; portalUrl: string },
    sessionId: string,
    events: DeltaEvent[],
    reset: boolean,
  ): Promise<boolean> {
    try {
      const res = await fetch(`${env.portalUrl}/api/agents/transcript-delta`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.token}`,
          'X-Agent-Name': env.agentName,
        },
        body: JSON.stringify({ session_id: sessionId, reset, events }),
        signal: AbortSignal.timeout(POST_TIMEOUT_MS),
      });
      // Any 4xx is a refusal that the next second will earn again: no route (an older portal), a
      // token this box cannot fix, an agent cap, a user with no account. Say it once, then stop
      // asking — a retry loop at 1 Hz against a permanent "no" is the one way this watcher could
      // cost the portal something. Server errors and network failures stay retried: those pass.
      if (res.status >= 400 && res.status < 500) {
        this.unsupportedUntil = this.now() + UNSUPPORTED_BACKOFF_MS;
        console.log(`[session-watcher] portal refused the delta stream (${res.status}) — pausing for now`);
        return false;
      }
      return res.ok;
    } catch {
      // Offline, DNS, timeout. The rail degrades to the durable lane; nothing to report per tick.
      return false;
    }
  }
}
