import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import {
  handleWindowExit,
  verifySessionCreated,
  watchTerminalWindow,
  buildSessionClosedRequest,
  createWindowWatchState,
  OPERATOR_CLOSE_REASON,
  WINDOW_CLOSE_RESOLVE_GRACE_MS,
  KILL_RETRY_DELAY_MS,
  type WindowWatchDeps,
} from './terminal-window-watch.js';

const SID = '0c4f9a2e-7b1d-4e3a-9f08-2d5c6b7a8e90';
const NAME = `sbjob-${SID}`;

function makeDeps(overrides: Partial<WindowWatchDeps> = {}): WindowWatchDeps {
  return {
    probeDisplay: vi.fn().mockResolvedValue(true),
    hasSession: vi.fn().mockResolvedValue('yes'),
    countClients: vi.fn().mockResolvedValue(0),
    killSession: vi.fn().mockResolvedValue(true),
    reportClosed: vi.fn().mockResolvedValue('reported'),
    delay: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    ...overrides,
  };
}

describe('handleWindowExit', () => {
  it('non-zero exit (X death) leaves the session running headless and records the exit on shared state', async () => {
    const deps = makeDeps();
    const state = createWindowWatchState();
    const verdict = await handleWindowExit(1, null, NAME, SID, deps, state);
    expect(verdict).toBe('window_died_headless_continue');
    expect(state.windowExited).toBe(true);
    expect(state.windowExitCode).toBe(1);
    expect(deps.killSession).not.toHaveBeenCalled();
  });

  it('signal exit (systemd cgroup sweep) leaves the session alone', async () => {
    const deps = makeDeps();
    const verdict = await handleWindowExit(null, 'SIGTERM', NAME, SID, deps);
    expect(verdict).toBe('window_died_headless_continue');
    expect(deps.killSession).not.toHaveBeenCalled();
  });

  it('clean exit with a failed display probe is treated as infra and logged, never intent', async () => {
    const deps = makeDeps({ probeDisplay: vi.fn().mockResolvedValue(false) });
    const verdict = await handleWindowExit(0, null, NAME, SID, deps);
    expect(verdict).toBe('display_down_leave');
    expect(deps.killSession).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('warn', expect.stringContaining('NOT killing'));
  });

  it('clean exit after an OBSERVED session ended is normal teardown (logged, no kill, no report)', async () => {
    const deps = makeDeps({ hasSession: vi.fn().mockResolvedValue('no') });
    const state = createWindowWatchState();
    state.observed = true;
    const verdict = await handleWindowExit(0, null, NAME, SID, deps, state);
    expect(verdict).toBe('teardown_noop');
    expect(deps.killSession).not.toHaveBeenCalled();
    expect(deps.reportClosed).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('info', expect.stringContaining('normal teardown'));
  });

  it('clean exit before the session EVER existed resolves the never-started step', async () => {
    const deps = makeDeps({ hasSession: vi.fn().mockResolvedValue('no') });
    const verdict = await handleWindowExit(0, null, NAME, SID, deps, createWindowWatchState());
    expect(verdict).toBe('closed_before_start');
    expect(deps.delay).toHaveBeenCalledWith(WINDOW_CLOSE_RESOLVE_GRACE_MS);
    expect(deps.reportClosed).toHaveBeenCalledWith(SID);
    expect(deps.killSession).not.toHaveBeenCalled();
  });

  it('a never-observed no-session close whose step already resolved was a run in the blind spot — teardown', async () => {
    const deps = makeDeps({
      hasSession: vi.fn().mockResolvedValue('no'),
      reportClosed: vi.fn().mockResolvedValue('already_resolved'),
    });
    const verdict = await handleWindowExit(0, null, NAME, SID, deps, createWindowWatchState());
    expect(verdict).toBe('teardown_noop');
  });

  it('a never-observed no-session close of a MANUAL run has no step to resolve', async () => {
    const deps = makeDeps({ hasSession: vi.fn().mockResolvedValue('no') });
    const verdict = await handleWindowExit(0, null, 'sbjob-1234', undefined, deps, createWindowWatchState());
    expect(verdict).toBe('teardown_noop');
    expect(deps.reportClosed).not.toHaveBeenCalled();
  });

  it('an UNKNOWN session probe proceeds on operator intent, with a warning', async () => {
    const deps = makeDeps({ hasSession: vi.fn().mockResolvedValue('unknown') });
    const verdict = await handleWindowExit(0, null, NAME, SID, deps);
    expect(verdict).toBe('killed_reported');
    expect(deps.log).toHaveBeenCalledWith('warn', expect.stringContaining('proceeding on operator intent'));
    expect(deps.killSession).toHaveBeenCalledWith(NAME);
  });

  it('another attached client means closing this window is not a stop', async () => {
    const deps = makeDeps({ countClients: vi.fn().mockResolvedValue(1) });
    const verdict = await handleWindowExit(0, null, NAME, SID, deps);
    expect(verdict).toBe('other_viewer_attached');
    expect(deps.killSession).not.toHaveBeenCalled();
    expect(deps.reportClosed).not.toHaveBeenCalled();
  });

  it('operator close: grace first (session still alive), report second, kill LAST', async () => {
    const order: string[] = [];
    const deps = makeDeps({
      delay: vi.fn().mockImplementation(async (ms: number) => { order.push(`delay:${ms}`); }),
      reportClosed: vi.fn().mockImplementation(async () => { order.push('report'); return 'reported' as const; }),
      killSession: vi.fn().mockImplementation(async () => { order.push('kill'); return true; }),
    });
    const verdict = await handleWindowExit(0, null, NAME, SID, deps);
    expect(verdict).toBe('killed_reported');
    expect(order).toEqual([`delay:${WINDOW_CLOSE_RESOLVE_GRACE_MS}`, 'report', 'kill']);
  });

  it('a step already resolved by the Stop hook makes the close a tidy, not a stop', async () => {
    const deps = makeDeps({ reportClosed: vi.fn().mockResolvedValue('already_resolved') });
    const verdict = await handleWindowExit(0, null, NAME, SID, deps);
    expect(verdict).toBe('killed_already_resolved');
    expect(deps.killSession).toHaveBeenCalledWith(NAME);
    expect(deps.log).toHaveBeenCalledWith('info', expect.stringContaining('tidy'));
  });

  it('a failed report still kills, and says the job will resolve elsewhere', async () => {
    const deps = makeDeps({ reportClosed: vi.fn().mockResolvedValue('failed') });
    const verdict = await handleWindowExit(0, null, NAME, SID, deps);
    expect(verdict).toBe('killed_report_failed');
    expect(deps.killSession).toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('error', expect.stringContaining('report failed'));
  });

  it('a manual run (no portal session id) is killed immediately — no grace, no report', async () => {
    const deps = makeDeps();
    const verdict = await handleWindowExit(0, null, 'sbjob-1234', undefined, deps);
    expect(verdict).toBe('killed_unreported');
    expect(deps.killSession).toHaveBeenCalledWith('sbjob-1234');
    expect(deps.reportClosed).not.toHaveBeenCalled();
    expect(deps.delay).not.toHaveBeenCalled();
  });

  it('a kill that fails is retried once, then declared a zombie', async () => {
    const deps = makeDeps({ killSession: vi.fn().mockResolvedValue(false) });
    const verdict = await handleWindowExit(0, null, NAME, SID, deps);
    expect(verdict).toBe('killed_reported');
    expect(deps.killSession).toHaveBeenCalledTimes(2);
    expect(deps.delay).toHaveBeenCalledWith(KILL_RETRY_DELAY_MS);
    expect(deps.log).toHaveBeenCalledWith('error', expect.stringContaining('zombie'));
  });

  it('never throws: a broken dep is logged and swallowed', async () => {
    const deps = makeDeps({ probeDisplay: vi.fn().mockRejectedValue(new Error('boom')) });
    const verdict = await handleWindowExit(0, null, NAME, SID, deps);
    expect(verdict).toBe('watch_error');
    expect(deps.log).toHaveBeenCalledWith('error', expect.stringContaining('boom'));
  });
});

describe('buildSessionClosedRequest', () => {
  it('targets step-complete with the failed status, the shared reason marker, and the bearer token', () => {
    const { url, init } = buildSessionClosedRequest('https://sidebutton.com/', 'sb_tok', SID);
    expect(url).toBe('https://sidebutton.com/api/jobs/step-complete');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sb_tok');
    expect(JSON.parse(init.body as string)).toEqual({
      session_id: SID,
      status: 'failed',
      error: OPERATOR_CLOSE_REASON,
    });
  });
});

describe('verifySessionCreated', () => {
  it('resolves true once the session appears, marking it observed, without falling back', async () => {
    const seen = vi.fn()
      .mockResolvedValueOnce('no')
      .mockResolvedValueOnce('no')
      .mockResolvedValue('yes');
    const fallback = vi.fn();
    const deps = makeDeps({ hasSession: seen });
    const state = createWindowWatchState();
    const ok = await verifySessionCreated(NAME, deps, fallback, state, 5);
    expect(ok).toBe(true);
    expect(state.observed).toBe(true);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('short-circuits without probing when the exit path already observed the session', async () => {
    const deps = makeDeps();
    const state = createWindowWatchState();
    state.observed = true;
    const ok = await verifySessionCreated(NAME, deps, vi.fn(), state, 5);
    expect(ok).toBe(true);
    expect(deps.hasSession).not.toHaveBeenCalled();
  });

  it('falls back to headless when the session never appears and the window is still running', async () => {
    const fallback = vi.fn();
    const deps = makeDeps({ hasSession: vi.fn().mockResolvedValue('no') });
    const ok = await verifySessionCreated(NAME, deps, fallback, createWindowWatchState(), 3);
    expect(ok).toBe(false);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(deps.log).toHaveBeenCalledWith('warn', expect.stringContaining('never appeared'));
  });

  it('NEVER falls back after a clean window exit — resurrecting a stopped job is forbidden', async () => {
    const fallback = vi.fn();
    const deps = makeDeps({ hasSession: vi.fn().mockResolvedValue('no') });
    const state = createWindowWatchState();
    state.windowExited = true;
    state.windowExitCode = 0;
    const ok = await verifySessionCreated(NAME, deps, fallback, state, 5);
    expect(ok).toBe(false);
    expect(fallback).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('info', expect.stringContaining('not falling back'));
  });

  it('falls back after a CRASHED window that never created the session', async () => {
    const fallback = vi.fn();
    const deps = makeDeps({ hasSession: vi.fn().mockResolvedValue('no') });
    const state = createWindowWatchState();
    state.windowExited = true;
    state.windowExitCode = 1;
    const ok = await verifySessionCreated(NAME, deps, fallback, state, 5);
    expect(ok).toBe(false);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('treats an unknown probe as not-seen and keeps polling', async () => {
    const seen = vi.fn()
      .mockResolvedValueOnce('unknown')
      .mockResolvedValue('yes');
    const deps = makeDeps({ hasSession: seen });
    const ok = await verifySessionCreated(NAME, deps, vi.fn(), createWindowWatchState(), 5);
    expect(ok).toBe(true);
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('a broken tmux is logged, not thrown, and does not spawn a doomed fallback', async () => {
    const fallback = vi.fn();
    const deps = makeDeps({ hasSession: vi.fn().mockRejectedValue(new Error('no tmux')) });
    const ok = await verifySessionCreated(NAME, deps, fallback, createWindowWatchState(), 3);
    expect(ok).toBe(false);
    expect(fallback).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('error', expect.stringContaining('no tmux'));
  });
});

describe('watchTerminalWindow', () => {
  function makeChild(): ChildProcess {
    return new EventEmitter() as unknown as ChildProcess;
  }

  it('spawn error triggers the headless fallback exactly once, then confirms the fallback session', async () => {
    const child = makeChild();
    const fallback = vi.fn();
    // First polls miss (window never made it), then the FALLBACK session shows up.
    const seen = vi.fn()
      .mockResolvedValueOnce('no')
      .mockResolvedValue('yes');
    const deps = makeDeps({ hasSession: seen });
    watchTerminalWindow(child, { sessionName: NAME, sessionId: SID, headlessFallback: fallback }, deps);
    child.emit('error', new Error('ENOENT'));
    await vi.waitFor(() => expect(fallback).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => {
      expect(deps.log).toHaveBeenCalledWith('info', expect.stringContaining('fallback session'));
    });
  });

  it('a fallback that never produces the session is loudly declared dead, not assumed running', async () => {
    const child = makeChild();
    const deps = makeDeps({ hasSession: vi.fn().mockResolvedValue('no') });
    watchTerminalWindow(child, { sessionName: NAME, sessionId: SID, headlessFallback: vi.fn() }, deps);
    child.emit('error', new Error('ENOENT'));
    await vi.waitFor(() => {
      expect(deps.log).toHaveBeenCalledWith('error', expect.stringContaining('never produced the session'));
    });
  });

  it('a clean window exit over a live session runs the operator-close path and never falls back', async () => {
    const child = makeChild();
    const fallback = vi.fn();
    const deps = makeDeps();
    watchTerminalWindow(child, { sessionName: NAME, sessionId: SID, headlessFallback: fallback }, deps);
    child.emit('exit', 0, null);
    await vi.waitFor(() => expect(deps.killSession).toHaveBeenCalledWith(NAME));
    await vi.waitFor(() => expect(deps.reportClosed).toHaveBeenCalledWith(SID));
    expect(fallback).not.toHaveBeenCalled();
  });

  it('closing the window before the session ever appears resolves the step and resurrects nothing', async () => {
    const child = makeChild();
    const fallback = vi.fn();
    const deps = makeDeps({ hasSession: vi.fn().mockResolvedValue('no') });
    watchTerminalWindow(child, { sessionName: NAME, sessionId: SID, headlessFallback: fallback }, deps);
    child.emit('exit', 0, null);
    await vi.waitFor(() => expect(deps.reportClosed).toHaveBeenCalledWith(SID));
    expect(deps.killSession).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('an X-death exit does not kill and does not fall back once the session was observed', async () => {
    const child = makeChild();
    const fallback = vi.fn();
    const deps = makeDeps();
    watchTerminalWindow(child, { sessionName: NAME, sessionId: SID, headlessFallback: fallback }, deps);
    await vi.waitFor(() => expect(deps.hasSession).toHaveBeenCalled());
    child.emit('exit', 1, null);
    await new Promise((resolve) => setImmediate(resolve));
    expect(deps.killSession).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });
});
