import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionWatcher, findSessionFile, isSessionWatcherEnabled } from './session-watcher.js';

// SCRUM-1972 (SP2-K) — the watcher's runtime. These drive `tick()` by hand against a real file on
// disk, because every interesting case here IS a filesystem case: a partially written line, a file
// that rotated under the cursor, a session that started before the daemon did. What they pin is that
// the watcher never invents continuity and never wedges: a reset is always announced, and no record
// can stall the cursor forever.

const SID = '29a1e0c6-6d1e-4b2b-9c07-1a2b3c4d5e6f';

let home: string;
let projectsDir: string;
let file: string;
let fetchMock: ReturnType<typeof vi.fn>;

const rec = (text: string, over: Record<string, unknown> = {}): string =>
  `${JSON.stringify({ type: 'assistant', uuid: `u${text}`, timestamp: 't', message: { role: 'assistant', content: [{ type: 'text', text }], ...over } })}\n`;

const watcher = (): SessionWatcher =>
  new SessionWatcher({ listSessions: () => [{ pid: 1, cmd: `claude --session-id ${SID}` }], projectsDir });

/** Every POST body the watcher sent, oldest first. */
const posted = (): Array<{ session_id: string; reset: boolean; events: Array<{ kind: string; text?: string }> }> =>
  fetchMock.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body));

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-watch-'));
  projectsDir = path.join(home, '.claude', 'projects');
  // Claude files a session under a directory named after its mangled cwd — the watcher searches
  // across those rather than reproducing the mangling, so the fixture builds a realistic one.
  const sessionDir = path.join(projectsDir, '-home-agent-workspace');
  fs.mkdirSync(sessionDir, { recursive: true });
  file = path.join(sessionDir, `${SID}.jsonl`);
  fs.writeFileSync(file, '');
  vi.stubEnv('AGENT_TOKEN', 'sb_test');
  vi.stubEnv('AGENT_NAME', 'agent-test');
  vi.stubEnv('PORTAL_URL', 'https://portal.test');
  fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fs.rmSync(home, { recursive: true, force: true });
});

describe('isSessionWatcherEnabled', () => {
  it('is on when the box has the outbound hook credentials', () => {
    expect(isSessionWatcherEnabled({ AGENT_TOKEN: 't', AGENT_NAME: 'a' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('is off without them — a dev box has nowhere to stream to', () => {
    expect(isSessionWatcherEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isSessionWatcherEnabled({ AGENT_TOKEN: 't' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('honours the explicit off switch even on a credentialled box', () => {
    const env = { AGENT_TOKEN: 't', AGENT_NAME: 'a', SIDEBUTTON_SESSION_WATCHER: '0' } as NodeJS.ProcessEnv;
    expect(isSessionWatcherEnabled(env)).toBe(false);
  });
});

describe('findSessionFile', () => {
  it('finds the JSONL by uuid without reimplementing Claude\'s cwd mangling', () => {
    expect(findSessionFile(SID, projectsDir)).toBe(file);
  });

  it('answers null for a session with no log and for a missing projects dir', () => {
    expect(findSessionFile('00000000-0000-4000-8000-000000000000', projectsDir)).toBeNull();
    expect(findSessionFile(SID, path.join(home, 'nope'))).toBeNull();
  });
});

describe('SessionWatcher.tick', () => {
  it('starts at the END of an existing log — a restart does not replay the afternoon', async () => {
    fs.writeFileSync(file, rec('old turn nobody asked to re-read'));
    const w = watcher();
    await w.tick();
    expect(fetchMock).not.toHaveBeenCalled();

    fs.appendFileSync(file, rec('the new one'));
    await w.tick();
    expect(posted()[0].events.map((e) => e.text)).toEqual(['the new one']);
  });

  it('marks the first batch of a file as a reset, and only the first', async () => {
    const w = watcher();
    await w.tick();
    fs.appendFileSync(file, rec('one'));
    await w.tick();
    fs.appendFileSync(file, rec('two'));
    await w.tick();
    expect(posted().map((b) => b.reset)).toEqual([true, false]);
  });

  it('holds a half-written line back and delivers it whole on the next tick', async () => {
    const w = watcher();
    await w.tick();
    const whole = rec('complete');
    fs.appendFileSync(file, whole + '{"type":"assistant","uuid":"partial"');
    await w.tick();
    expect(posted()[0].events.map((e) => e.text)).toEqual(['complete']);

    // The rest of the record lands; the watcher re-reads from where it stopped.
    fs.appendFileSync(file, ',"timestamp":"t","message":{"role":"assistant","content":[{"type":"text","text":"rest"}]}}\n');
    await w.tick();
    expect(posted()[1].events.map((e) => e.text)).toEqual(['rest']);
  });

  it('announces a reset when the file is truncated under the cursor', async () => {
    const w = watcher();
    await w.tick();
    fs.appendFileSync(file, rec('before'));
    await w.tick();
    // A compaction restart rewrites the log from the top.
    fs.writeFileSync(file, rec('after'));
    await w.tick();
    expect(posted()[1]).toMatchObject({ reset: true });
    expect(posted()[1].events.map((e) => e.text)).toEqual(['after']);
  });

  it('sends nothing when nothing was written', async () => {
    const w = watcher();
    await w.tick();
    await w.tick();
    await w.tick();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts with the hook credentials the transcript upload uses', async () => {
    const w = watcher();
    await w.tick();
    fs.appendFileSync(file, rec('hello'));
    await w.tick();
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe('https://portal.test/api/agents/transcript-delta');
    expect(init.headers.Authorization).toBe('Bearer sb_test');
    expect(init.headers['X-Agent-Name']).toBe('agent-test');
  });

  it('backs off silently once the portal answers 404 — an old deployment, polled every second', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const w = watcher();
    await w.tick();
    fs.appendFileSync(file, rec('one'));
    await w.tick();
    fs.appendFileSync(file, rec('two'));
    await w.tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('survives a portal that is simply unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const w = watcher();
    await w.tick();
    fs.appendFileSync(file, rec('one'));
    await expect(w.tick()).resolves.toBeUndefined();
  });

  it('announces a reset after a flush that did not land — a hole is never handed over as continuity', async () => {
    // The cursor has already moved past the events the failed POST was carrying, so those bytes are
    // gone. The portal has to learn that the next batch is not the continuation of the last one, or
    // the rail splices two halves of a turn together (PLAN §5.5).
    const w = watcher();
    await w.tick();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502 });
    fs.appendFileSync(file, rec('lost to a 502'));
    await w.tick();
    fs.appendFileSync(file, rec('the next one'));
    await w.tick();
    expect(posted().map((b) => b.reset)).toEqual([true, true]);
    expect(posted()[1].events.map((e) => e.text)).toEqual(['the next one']);
  });

  it('backs off on any 4xx — a permanent refusal must not be retried every second', async () => {
    // 403 (no account, agent cap) earns itself again on the next tick, exactly like the 404 does.
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    const w = watcher();
    await w.tick();
    fs.appendFileSync(file, rec('one'));
    await w.tick();
    fs.appendFileSync(file, rec('two'));
    await w.tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the cursor byte-exact across a record bigger than one tick\'s read budget', async () => {
    // The skip path is the one place the cursor advances through bytes nobody parsed. If it advanced
    // by re-measured TEXT instead, a read boundary landing inside a multi-byte character would drift
    // the offset (U+FFFD re-encodes to three bytes) and eat the record that follows.
    const w = watcher();
    await w.tick();
    const huge = `${JSON.stringify({ type: 'assistant', uuid: 'big', timestamp: 't', message: { role: 'assistant', content: [{ type: 'text', text: `${'—'.repeat(400_000)}` }] } })}\n`;
    fs.appendFileSync(file, huge);
    // Several ticks: each one consumes at most its read budget of the giant record.
    for (let i = 0; i < 6; i++) await w.tick();
    fs.appendFileSync(file, rec('after the monster'));
    await w.tick();
    expect(posted().at(-1)?.events.map((e) => e.text)).toEqual(['after the monster']);
  });

  it('does not post for a session no live process is running', async () => {
    const w = new SessionWatcher({ listSessions: () => [{ pid: 1, cmd: 'claude --dangerously-skip-permissions' }], projectsDir });
    await w.tick();
    fs.appendFileSync(file, rec('nobody is watching'));
    await w.tick();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stop() clears the interval and forgets its cursors', async () => {
    const w = watcher();
    w.start();
    await w.stop();
    await expect(w.stop()).resolves.toBeUndefined();
  });
});

describe('activity fallback — claude ignores --session-id (2.1.x)', () => {
  // The dispatcher's argv uuid and the transcript's own uuid diverge on Claude Code ≥ 2.1.x: the
  // JSONL is born under claude's uuid, so the argv-keyed lookup misses forever. These pin the
  // fallback: bind by activity only when unambiguous, and keep posting under the ARGV id.
  const ARGV_SID = '7d3f2a10-1111-4222-8333-444455556666';
  const foreignFile = (name: string): string => {
    const p = path.join(projectsDir, '-home-agent-workspace', `${name}.jsonl`);
    fs.writeFileSync(p, '');
    return p;
  };
  const foreignWatcher = (): SessionWatcher =>
    new SessionWatcher({ listSessions: () => [{ pid: 2, cmd: `claude --session-id ${ARGV_SID}` }], projectsDir });

  it('binds the single active foreign transcript and posts under the ARGV session id', async () => {
    fs.rmSync(file); // no <argv-id>.jsonl anywhere — the 2.1.x world
    const foreign = foreignFile('1d7eeb51-bee4-4b97-b737-ca8437eb7bba');
    const w = foreignWatcher();
    await w.tick(); // discovery tick — cursor lands at the file's current end
    fs.appendFileSync(foreign, rec('streamed via fallback'));
    await w.tick();
    expect(posted()).toHaveLength(1);
    expect(posted()[0].session_id).toBe(ARGV_SID);
    expect(posted()[0].events.map((e) => e.text)).toEqual(['streamed via fallback']);
  });

  it('tracks nothing when TWO foreign transcripts are active — never a guess', async () => {
    fs.rmSync(file);
    const a = foreignFile('aaaa1111-2222-4333-8444-555566667777');
    const b = foreignFile('bbbb1111-2222-4333-8444-555566667777');
    const w = foreignWatcher();
    await w.tick();
    fs.appendFileSync(a, rec('a'));
    fs.appendFileSync(b, rec('b'));
    await w.tick();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never claims a file named after another LIVE session (old-semantics claude)', async () => {
    // SID's own file exists and belongs to SID; ARGV_SID has no file. The fallback must not steal
    // SID's transcript for ARGV_SID.
    const w = new SessionWatcher({
      listSessions: () => [
        { pid: 1, cmd: `claude --session-id ${SID}` },
        { pid: 2, cmd: `claude --session-id ${ARGV_SID}` },
      ],
      projectsDir,
    });
    await w.tick();
    fs.appendFileSync(file, rec('belongs to SID'));
    await w.tick();
    expect(posted()).toHaveLength(1);
    expect(posted()[0].session_id).toBe(SID);
  });

  it('the direct argv-named lookup still wins when the file exists (pre-2.1 claude unchanged)', async () => {
    const w = watcher();
    await w.tick();
    fs.appendFileSync(file, rec('direct path'));
    await w.tick();
    expect(posted()[0].session_id).toBe(SID);
  });
});
