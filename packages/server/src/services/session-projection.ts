/**
 * Claude session JSONL → chat delta events (SCRUM-1972, SP2-K / PLAN §3).
 *
 * The pure half of the session watcher: everything here is a function of bytes in and events out, so
 * the projection rules — which are the whole hygiene of this feature — are unit-testable against
 * fixtures cut from real transcripts, with no filesystem and no clock.
 *
 * Why project at all rather than relay the JSONL: a single turn's transcript runs to megabytes
 * (tool results, base64 screenshots, thinking blocks, subagent chatter), and none of that is a chat
 * rail row. What survives here is what the rail actually draws — the agent's narration, one line per
 * tool call, an error flag on results — which is a few KB per turn and safe to POST every second.
 */

/** The event vocabulary, mirrored from the portal's `website/src/lib/transcript-stream.ts`. */
export type DeltaKind = 'text' | 'tool' | 'tool_result' | 'user' | 'turn_end';

export interface DeltaEvent {
  /** Byte offset in the JSONL after this record — the resume point and the client's cursor. */
  cursor: number;
  uuid: string;
  ts: string;
  kind: DeltaKind;
  text?: string;
  tool?: { name: string; subject: string };
  is_error?: boolean;
  tool_use_id?: string;
}

/** Caps, mirrored from the ingest so a batch is never refused for a size the producer could see. */
export const MAX_EVENT_TEXT = 8_000;
export const MAX_RESULT_TEXT = 160;
export const MAX_SUBJECT = 200;
/** Per-POST caps (PLAN §3). Whichever is hit first ends the batch; the rest rides the next tick. */
export const MAX_BATCH_EVENTS = 50;
export const MAX_BATCH_BYTES = 64 * 1024;

const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

/**
 * The Claude session id a live process is running, from its command line.
 *
 * The inverse of `findClaudeSessionPid` (session-input.ts): the dispatcher injects
 * `--session-id <uuid>` into every session it starts (core/steps/shell.ts), so the cmdline is the
 * only place a running session announces which JSONL it is writing. A process without the flag is
 * someone's hand-started `claude` and is deliberately skipped — the watcher must never tail a
 * session the portal did not dispatch.
 */
export function extractSessionId(cmd: string): string | null {
  const m = /--session-id[= ]+(\S+)/.exec(String(cmd || ''));
  if (!m) return null;
  const id = m[1];
  return UUID_RE.test(id) && id.length === 36 ? id.toLowerCase() : null;
}

/** One-line subject for a tool call — the same "what did it act on" the ✱ tick lane shows. */
export function toolSubject(name: string, input: unknown): string {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const first = (...keys: string[]): string => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };
  // Named in the order the rail cares about: what ran, what it touched, what it looked for. The
  // generic fallbacks at the end cover MCP tools, whose input shapes this module cannot know.
  const subject = first('command', 'file_path', 'path', 'pattern', 'url', 'uri', 'description', 'prompt', 'query', 'name');
  // Newlines are the common case for `command` (a heredoc, a multi-line script) and a rail row is
  // one line — collapsing beats truncating at the first newline, which would hide the actual verb.
  return subject.replace(/\s+/g, ' ').trim().slice(0, MAX_SUBJECT);
}

/** A parsed JSONL record, as loosely as this module is willing to trust one. */
interface Record_ {
  type?: string;
  uuid?: string;
  timestamp?: string;
  isSidechain?: boolean;
  /** Claude Code's own flag for a record the harness injected rather than a person writing it. */
  isMeta?: boolean;
  /** Set when the record is a tool's own injection (a skill body, a task notification). */
  sourceToolUseID?: string;
  message?: {
    role?: string;
    content?: unknown;
    stop_reason?: string | null;
  };
}

/** `stop_reason` values that end a turn — the in-band boundary the rail folds on. */
const TURN_END_REASONS: ReadonlySet<string> = new Set(['end_turn', 'stop_sequence']);

/**
 * A user record the HARNESS wrote, not a person.
 *
 * Claude Code files several kinds of machine input as `type:"user"`: a Skill's body, a
 * `<task-notification>`, `<command-name>`/`<local-command-stdout>` pairs from a slash command, the
 * `<local-command-caveat>` preamble of a resumed session. Real transcripts flag most of them
 * (`isMeta`, `sourceToolUseID`) and wrap the rest in a tag on the first line.
 *
 * They must never reach the rail, because a `kind:"user"` event is not a cosmetic row: the client
 * treats it as somebody taking the turn — it folds the live feed, opens a fresh card and stamps it
 * delivered. A Skill invocation mid-turn would therefore cut the agent's own turn in half and put
 * "Base directory for this skill: …" on screen as though the operator had typed it.
 */
const MACHINE_USER_TEXT = /^\s*<(?:task-notification|command-name|command-message|command-args|local-command-[a-z-]+|system-reminder|user-prompt-submit-hook)\b/i;

/**
 * Project one JSONL line into the events it produces (usually one, sometimes several: an assistant
 * record carries text and tool calls in one content array, and may end the turn as well).
 *
 * `cursor` is the file offset AFTER this line, so an event's cursor is a resume point: a consumer
 * that has seen it can restart the read from exactly there and lose nothing.
 */
export function projectRecord(line: string, cursor: number): DeltaEvent[] {
  let rec: Record_;
  try {
    rec = JSON.parse(line) as Record_;
  } catch {
    return [];
  }
  if (!rec || typeof rec !== 'object') return [];
  // Subagent chatter never reaches the rail (PLAN §3). A Task tool's own transcript is interleaved
  // into the same file, and rendering it would put a second agent's narration inside the operator's
  // turn with nothing on screen to say whose words they are.
  if (rec.isSidechain === true) return [];
  // Harness-injected input is not a turn — see MACHINE_USER_TEXT for what that costs on the rail.
  if (rec.isMeta === true || typeof rec.sourceToolUseID === 'string') return [];
  const type = rec.type;
  if (type !== 'user' && type !== 'assistant') return [];
  const uuid = typeof rec.uuid === 'string' ? rec.uuid : '';
  if (!uuid) return [];
  const ts = typeof rec.timestamp === 'string' ? rec.timestamp : new Date(0).toISOString();
  const base = { cursor, uuid, ts };
  const content = rec.message?.content;
  const out: DeltaEvent[] = [];

  if (type === 'user') {
    // A string body is a real turn — the operator, or the dispatch prompt. An array body is Claude
    // replaying tool results as user records, which is the ✱ lane's material, not the thread's.
    if (typeof content === 'string') {
      if (MACHINE_USER_TEXT.test(content)) return out;
      const text = content.trim().slice(0, MAX_EVENT_TEXT);
      if (text) out.push({ ...base, kind: 'user', text });
      return out;
    }
    if (!Array.isArray(content)) return out;
    for (const raw of content as Array<Record<string, unknown>>) {
      const block = raw || {};
      // A `text` block inside a user ARRAY body is never the operator speaking — PLAN §3 lists only
      // a string body as a turn. In real transcripts every one of these is harness injection (a
      // skill body, an image note), which the guards above already drop; anything new that shows up
      // here is dropped too rather than promoted to a turn nobody took.
      if (block.type !== 'tool_result') continue;
      out.push({
        ...base,
        kind: 'tool_result',
        // A result's content is a string OR the same block array shape; images inside it are
        // dropped rather than truncated, because 160 characters of base64 is not a rail row.
        text: resultText(block.content).slice(0, MAX_RESULT_TEXT),
        is_error: block.is_error === true,
        ...(typeof block.tool_use_id === 'string' ? { tool_use_id: block.tool_use_id } : {}),
      });
    }
    return out;
  }

  if (Array.isArray(content)) {
    for (const raw of content as Array<Record<string, unknown>>) {
      const block = raw || {};
      // Thinking and images are dropped by rule: the first is the agent's private reasoning and the
      // second is megabytes of base64. Both stay in the durable transcript.
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
        out.push({ ...base, kind: 'text', text: block.text.trim().slice(0, MAX_EVENT_TEXT) });
        continue;
      }
      if (block.type !== 'tool_use') continue;
      const name = typeof block.name === 'string' ? block.name : '';
      if (!name) continue;
      out.push({
        ...base,
        kind: 'tool',
        tool: { name: name.slice(0, 80), subject: toolSubject(name, block.input) },
        ...(typeof block.id === 'string' ? { tool_use_id: block.id } : {}),
      });
    }
  }
  const stop = rec.message?.stop_reason;
  if (typeof stop === 'string' && TURN_END_REASONS.has(stop)) {
    out.push({ ...base, kind: 'turn_end' });
  }
  return out;
}

/** Flatten a tool_result body to one short line, dropping any image blocks. */
function resultText(content: unknown): string {
  if (typeof content === 'string') return content.replace(/\s+/g, ' ').trim();
  if (!Array.isArray(content)) return '';
  return (content as Array<Record<string, unknown>>)
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => String(b.text))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Rough wire size of one event, matching the ingest's own measure. */
export function eventBytes(ev: DeltaEvent): number {
  return (ev.text?.length ?? 0) + (ev.tool ? ev.tool.name.length + ev.tool.subject.length : 0) + 120;
}

/**
 * Split a queue into POST-sized batches (PLAN §3: ≤ 50 events / 64 KB).
 *
 * A single event over the byte cap still goes out alone rather than being dropped — it has already
 * been truncated to {@link MAX_EVENT_TEXT}, and a turn is not worth losing to arithmetic.
 */
export function batchEvents(events: DeltaEvent[]): DeltaEvent[][] {
  const batches: DeltaEvent[][] = [];
  let current: DeltaEvent[] = [];
  let bytes = 0;
  for (const ev of events) {
    const size = eventBytes(ev);
    if (current.length && (current.length >= MAX_BATCH_EVENTS || bytes + size > MAX_BATCH_BYTES)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(ev);
    bytes += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

/** What a tail read produced: the events, and where the next read starts. */
export interface TailResult {
  events: DeltaEvent[];
  /** Byte offset of the first incomplete line — a partial write is re-read whole next tick. */
  cursor: number;
}

/**
 * Project a chunk read at `from`, keeping only COMPLETE lines.
 *
 * The file is being appended to as we read it, so the tail of any chunk is very likely half a JSON
 * record. Parsing it would drop that record permanently (its bytes are behind the new cursor);
 * leaving it un-consumed costs one extra second of latency and nothing else.
 */
export function projectChunk(chunk: string, from: number): TailResult {
  const events: DeltaEvent[] = [];
  let cursor = from;
  let start = 0;
  for (;;) {
    const nl = chunk.indexOf('\n', start);
    if (nl === -1) break;
    const line = chunk.slice(start, nl);
    start = nl + 1;
    // Byte length, not character length: the cursor is a file offset and transcripts carry UTF-8.
    // Measured per line and ACCUMULATED rather than by re-measuring the prefix each time: a 512 KB
    // chunk of short records re-scanned per line is quadratic work on the daemon's event loop, and
    // this runs once a second per live session.
    cursor += Buffer.byteLength(line, 'utf8') + 1;   // +1: the '\n' itself is one byte in UTF-8
    if (line.trim()) events.push(...projectRecord(line, cursor));
  }
  return { events, cursor };
}
