import { describe, it, expect } from 'vitest';
import {
  batchEvents,
  eventBytes,
  extractSessionId,
  projectChunk,
  projectRecord,
  toolSubject,
  MAX_BATCH_EVENTS,
  MAX_BATCH_BYTES,
  MAX_EVENT_TEXT,
  MAX_RESULT_TEXT,
  type DeltaEvent,
} from './session-projection.js';

// SCRUM-1972 (SP2-K) — the producer's projection rules (PLAN §3). The fixtures below are the record
// shapes a real editing session writes: a boot turn's narration between tool calls, a subagent's
// sidechain, a thinking block, a base64 screenshot result, an MCP timeout error, and the assistant
// record whose stop_reason ends the turn. What these pin is the hygiene: the rail gets chat rows and
// nothing else, and a megabyte record never becomes a megabyte POST.

const SID = '29a1e0c6-6d1e-4b2b-9c07-1a2b3c4d5e6f';

const line = (o: unknown): string => JSON.stringify(o);

const assistant = (content: unknown[], over: Record<string, unknown> = {}) => ({
  type: 'assistant',
  uuid: 'a1',
  timestamp: '2026-08-12T07:34:45.082Z',
  message: { role: 'assistant', content, ...over },
});

describe('extractSessionId', () => {
  it('reads the dispatcher-injected --session-id off a cmdline', () => {
    expect(extractSessionId(`claude --session-id ${SID} --dangerously-skip-permissions`)).toBe(SID);
    expect(extractSessionId(`claude --session-id=${SID}`)).toBe(SID);
  });

  it('skips a hand-started claude — the watcher only tails dispatched sessions', () => {
    expect(extractSessionId('claude --dangerously-skip-permissions')).toBeNull();
    expect(extractSessionId('claude --session-id not-a-uuid')).toBeNull();
    expect(extractSessionId('')).toBeNull();
  });
});

describe('projectRecord — what reaches the rail', () => {
  it('projects an assistant text block whole — it is the payload the feature exists for', () => {
    const events = projectRecord(line(assistant([{ type: 'text', text: 'Wiring the priority param now.' }])), 100);
    expect(events).toEqual([
      { cursor: 100, uuid: 'a1', ts: '2026-08-12T07:34:45.082Z', kind: 'text', text: 'Wiring the priority param now.' },
    ]);
  });

  it('projects tool_use as name + one-line subject, carrying the tool_use_id for dedupe', () => {
    const events = projectRecord(
      line(assistant([{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'git commit -m "fix"\n' } }])),
      200,
    );
    expect(events).toEqual([
      { cursor: 200, uuid: 'a1', ts: '2026-08-12T07:34:45.082Z', kind: 'tool', tool: { name: 'Bash', subject: 'git commit -m "fix"' }, tool_use_id: 'toolu_1' },
    ]);
  });

  it('keeps narration AND the call from one multi-block record, in order', () => {
    const events = projectRecord(
      line(assistant([
        { type: 'text', text: 'First I will read the route.' },
        { type: 'tool_use', id: 'toolu_2', name: 'Read', input: { file_path: '/src/pages/api/x.ts' } },
      ])),
      300,
    );
    expect(events.map((e) => e.kind)).toEqual(['text', 'tool']);
    expect(events[1].tool).toEqual({ name: 'Read', subject: '/src/pages/api/x.ts' });
  });

  it('drops a thinking block — the agent\'s private reasoning is not a rail row', () => {
    const events = projectRecord(line(assistant([{ type: 'thinking', thinking: 'maybe the poll is wrong' }])), 400);
    expect(events).toEqual([]);
  });

  it('drops every record of a subagent sidechain', () => {
    const rec = { ...assistant([{ type: 'text', text: 'subagent chatter' }]), isSidechain: true };
    expect(projectRecord(line(rec), 500)).toEqual([]);
  });

  it('drops image blocks rather than truncating base64 into a row', () => {
    const events = projectRecord(
      line({
        type: 'user',
        uuid: 'u1',
        timestamp: 't',
        message: { role: 'user', content: [
          { type: 'tool_result', tool_use_id: 'toolu_3', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo'.repeat(5000) } },
            { type: 'text', text: 'screenshot saved' },
          ] },
        ] },
      }),
      600,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'tool_result', text: 'screenshot saved', is_error: false, tool_use_id: 'toolu_3' });
  });

  it('flags a failed tool result and truncates it to a ✱ row', () => {
    const events = projectRecord(
      line({
        type: 'user',
        uuid: 'u2',
        timestamp: 't',
        message: { role: 'user', content: [
          { type: 'tool_result', tool_use_id: 'toolu_4', is_error: true, content: `MCP error -32001: Request timed out ${'x'.repeat(400)}` },
        ] },
      }),
      700,
    );
    expect(events[0].is_error).toBe(true);
    expect(events[0].text).toHaveLength(MAX_RESULT_TEXT);
    expect(events[0].text?.startsWith('MCP error -32001')).toBe(true);
  });

  it('drops harness-injected user records — a Skill body is not somebody taking the turn', () => {
    // Real transcripts file a Skill's own text, an image note and a task notification as `type:"user"`,
    // flagged `isMeta` / `sourceToolUseID`. On the rail a user event FOLDS the live turn and opens a
    // fresh card, so letting one through cuts the agent's turn in half mid-work and stamps a message
    // the operator never wrote as delivered.
    const meta = {
      type: 'user', uuid: 'm1', timestamp: 't', isMeta: true, sourceToolUseID: 'toolu_9',
      message: { role: 'user', content: [{ type: 'text', text: 'Base directory for this skill: /home/agent/.claude/skills/x' }] },
    };
    expect(projectRecord(line(meta), 100)).toEqual([]);
    const fromTool = { type: 'user', uuid: 'm2', timestamp: 't', sourceToolUseID: 'toolu_9', message: { role: 'user', content: 'run the review' } };
    expect(projectRecord(line(fromTool), 110)).toEqual([]);
  });

  it('drops the harness\'s tagged user strings — slash commands and task notifications', () => {
    for (const body of [
      '<task-notification> <task-id>bf3ruuxr4</task-id> done',
      '<command-name>/login</command-name> <command-message>login</command-message>',
      '<local-command-stdout>Login successful</local-command-stdout>',
      '<local-command-caveat>Caveat: The messages below were generated by the user while…',
    ]) {
      expect(projectRecord(line({ type: 'user', uuid: 'c1', timestamp: 't', message: { role: 'user', content: body } }), 120)).toEqual([]);
    }
  });

  it('never promotes a text block inside a user array body to a turn', () => {
    // PLAN §3 lists only a STRING user body as a turn; an array body is Claude replaying tool
    // results. A text block in there is harness material whatever flags it carries.
    const rec = {
      type: 'user', uuid: 'u9', timestamp: 't',
      message: { role: 'user', content: [{ type: 'text', text: 'injected instruction' }, { type: 'tool_result', tool_use_id: 'toolu_5', content: 'ok' }] },
    };
    expect(projectRecord(line(rec), 130).map((e) => e.kind)).toEqual(['tool_result']);
  });

  it('projects a string user record as a turn — other tabs and the console speak this way', () => {
    const events = projectRecord(
      line({ type: 'user', uuid: 'u3', timestamp: 't', message: { role: 'user', content: 'make the heading bigger' } }),
      800,
    );
    expect(events).toEqual([{ cursor: 800, uuid: 'u3', ts: 't', kind: 'user', text: 'make the heading bigger' }]);
  });

  it('emits turn_end from a stop_reason that actually ends the turn — and not from one that does not', () => {
    const ended = projectRecord(line(assistant([{ type: 'text', text: 'Done.' }], { stop_reason: 'end_turn' })), 900);
    expect(ended.map((e) => e.kind)).toEqual(['text', 'turn_end']);
    const running = projectRecord(line(assistant([{ type: 'text', text: 'Working…' }], { stop_reason: 'tool_use' })), 910);
    expect(running.map((e) => e.kind)).toEqual(['text']);
  });

  it('truncates a giant text block instead of shipping it whole', () => {
    const events = projectRecord(line(assistant([{ type: 'text', text: 'y'.repeat(MAX_EVENT_TEXT + 1000) }])), 1000);
    expect(events[0].text).toHaveLength(MAX_EVENT_TEXT);
  });

  it('survives junk — a half-written line, a summary record, an unparseable blob', () => {
    expect(projectRecord('{"type":"assis', 10)).toEqual([]);
    expect(projectRecord(line({ type: 'summary', summary: 'x' }), 10)).toEqual([]);
    expect(projectRecord('not json at all', 10)).toEqual([]);
  });
});

describe('toolSubject', () => {
  it.each([
    ['Bash', { command: 'pnpm test' }, 'pnpm test'],
    ['Edit', { file_path: '/a/b.ts', old_string: 'x' }, '/a/b.ts'],
    ['Grep', { pattern: 'TODO' }, 'TODO'],
    ['WebFetch', { url: 'https://example.com' }, 'https://example.com'],
    ['Task', { description: 'map the code' }, 'map the code'],
  ])('%s → %o', (name, input, expected) => {
    expect(toolSubject(name, input)).toBe(expected);
  });

  it('collapses a multi-line command onto one line', () => {
    expect(toolSubject('Bash', { command: 'set -e\nnpm ci\nnpm test' })).toBe('set -e npm ci npm test');
  });

  it('answers empty for an input shape it cannot read, rather than inventing one', () => {
    expect(toolSubject('mcp__weird__thing', { widget: 3 })).toBe('');
  });
});

describe('projectChunk — complete lines only', () => {
  it('leaves a partial trailing line un-consumed so the next read gets it whole', () => {
    const a = line(assistant([{ type: 'text', text: 'one' }]));
    const b = line(assistant([{ type: 'text', text: 'two' }]));
    const chunk = `${a}\n${b}`;   // no trailing newline: `b` is still being written
    const { events, cursor } = projectChunk(chunk, 0);
    expect(events.map((e) => e.text)).toEqual(['one']);
    expect(cursor).toBe(Buffer.byteLength(`${a}\n`, 'utf8'));
  });

  it('counts the cursor in BYTES — a transcript full of em dashes is not ASCII', () => {
    const rec = line(assistant([{ type: 'text', text: 'saved — pushed' }]));
    const { cursor } = projectChunk(`${rec}\n`, 0);
    expect(cursor).toBe(Buffer.byteLength(`${rec}\n`, 'utf8'));
    expect(cursor).toBeGreaterThan(`${rec}\n`.length);
  });

  it('gives every event of one record the SAME cursor — it is one file offset, not one row', () => {
    // The consumer's dedupe has to know this: a record's narration, the call it made and the
    // `turn_end` that closed it all resume from the same byte, so a buffer keyed on the cursor alone
    // would keep the first and silently drop the rest (the fold, on every ordinary turn).
    const rec = line(assistant([
      { type: 'text', text: 'Done.' },
      { type: 'tool_use', id: 'toolu_9', name: 'Bash', input: { command: 'git push' } },
    ], { stop_reason: 'end_turn' }));
    const { events, cursor } = projectChunk(`${rec}\n`, 0);
    expect(events.map((e) => e.kind)).toEqual(['text', 'tool', 'turn_end']);
    expect(new Set(events.map((e) => e.cursor))).toEqual(new Set([cursor]));
  });

  it('resumes from the offset it was given', () => {
    const rec = line(assistant([{ type: 'text', text: 'hello' }]));
    const { events, cursor } = projectChunk(`${rec}\n`, 5_000);
    expect(events[0].cursor).toBe(5_000 + Buffer.byteLength(`${rec}\n`, 'utf8'));
    expect(cursor).toBe(events[0].cursor);
  });
});

describe('batchEvents', () => {
  const ev = (i: number, text = 'x'): DeltaEvent => ({ cursor: i, uuid: `u${i}`, ts: 't', kind: 'text', text });

  it('splits at the event cap', () => {
    const batches = batchEvents(Array.from({ length: MAX_BATCH_EVENTS + 3 }, (_, i) => ev(i)));
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(MAX_BATCH_EVENTS);
    expect(batches[1]).toHaveLength(3);
  });

  it('splits at the byte cap before the event cap when the events are fat', () => {
    const fat = Array.from({ length: 20 }, (_, i) => ev(i, 'z'.repeat(8_000)));
    const batches = batchEvents(fat);
    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) {
      const bytes = batch.reduce((n, e) => n + eventBytes(e), 0);
      // Only a lone oversized event may exceed the cap — never a batch that could have been split.
      expect(bytes <= MAX_BATCH_BYTES || batch.length === 1).toBe(true);
    }
  });

  it('sends a single over-cap event alone rather than dropping it', () => {
    const batches = batchEvents([ev(1, 'q'.repeat(MAX_BATCH_BYTES + 10))]);
    expect(batches).toEqual([[expect.objectContaining({ cursor: 1 })]]);
  });

  it('answers nothing for nothing', () => {
    expect(batchEvents([])).toEqual([]);
  });
});
