import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ensureTrackerSessionEnv, resetTrackerSessionEnvForTests } from './tracker-session-env.js';

// SCRUM-1830 T2 — the agent-resident vend consumer. All tests run with applyTmux:false (the tmux
// half is a best-effort mirror probed on a real VM) and a fixed clock via the `now` seam.

const T0 = 1_700_000_000_000;
const iso = (ms: number) => new Date(ms).toISOString();

type Route = () => { status: number; body?: unknown };

function fetchMock(routes: Record<string, Route>) {
  return vi.fn(async (url: unknown) => {
    const u = String(url);
    const key = Object.keys(routes).find((r) => u.includes(r));
    const { status, body } = key ? routes[key]() : { status: 404, body: undefined };
    return { status, json: async () => body } as Response;
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  resetTrackerSessionEnvForTests();
  for (const k of ['SIDEBUTTON_AGENT_TOKEN', 'AGENT_TOKEN', 'PORTAL_URL']) savedEnv[k] = process.env[k];
  process.env.SIDEBUTTON_AGENT_TOKEN = 'sb_test_token';
  process.env.PORTAL_URL = 'https://portal.test';
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const opts = (fetchImpl: typeof fetch, nowMs: number) => ({ fetchImpl, now: () => nowMs, applyTmux: false as const });

describe('ensureTrackerSessionEnv — vending', () => {
  it('injects the Jira Bearer triple and the Linear token from their vend endpoints', async () => {
    const f = fetchMock({
      '/api/agents/jira-token': () => ({
        status: 200,
        body: { token: 'JT', baseUrl: 'https://api.atlassian.com/ex/jira/c1', siteUrl: 'https://acme.atlassian.net', expiresAt: iso(T0 + 4 * 3600_000) },
      }),
      '/api/agents/linear-token': () => ({ status: 200, body: { token: 'LT' } }),
    });
    const env = await ensureTrackerSessionEnv(opts(f, T0));
    expect(env).toEqual({
      JIRA_BEARER_TOKEN: 'JT',
      JIRA_BASE_URL: 'https://api.atlassian.com/ex/jira/c1',
      JIRA_SITE_URL: 'https://acme.atlassian.net',
      LINEAR_ACCESS_TOKEN: 'LT',
    });
    expect(f).toHaveBeenCalledTimes(2);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe('https://portal.test/api/agents/jira-token');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sb_test_token');
  });

  it('omits JIRA_SITE_URL when the vend has no captured site, and serves a Linear-only account', async () => {
    const f = fetchMock({
      '/api/agents/jira-token': () => ({ status: 204 }),
      '/api/agents/linear-token': () => ({ status: 200, body: { token: 'LT' } }),
    });
    const env = await ensureTrackerSessionEnv(opts(f, T0));
    expect(env).toEqual({ LINEAR_ACCESS_TOKEN: 'LT' }); // "task management is not Jira" — Linear still served
  });

  it('injects nothing for an api_key / untracked account (both endpoints 204) — the env-file lane is untouched', async () => {
    const f = fetchMock({
      '/api/agents/jira-token': () => ({ status: 204 }),
      '/api/agents/linear-token': () => ({ status: 204 }),
    });
    expect(await ensureTrackerSessionEnv(opts(f, T0))).toEqual({});
    // The 204 is believed for the negative-cache window: an immediate second session re-fetches nothing.
    expect(await ensureTrackerSessionEnv(opts(f, T0 + 60_000))).toEqual({});
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('injects nothing and calls nothing on a non-portal agent (no sb token in the daemon env)', async () => {
    delete process.env.SIDEBUTTON_AGENT_TOKEN;
    delete process.env.AGENT_TOKEN;
    const f = fetchMock({});
    expect(await ensureTrackerSessionEnv(opts(f, T0))).toEqual({});
    expect(f).toHaveBeenCalledTimes(0);
  });
});

describe('ensureTrackerSessionEnv — agent-level cache (no per-job portal calls)', () => {
  it('serves repeat launches from cache while fresh', async () => {
    const f = fetchMock({
      '/api/agents/jira-token': () => ({
        status: 200,
        body: { token: 'JT', baseUrl: 'https://api.atlassian.com/ex/jira/c1', expiresAt: iso(T0 + 4 * 3600_000) },
      }),
      '/api/agents/linear-token': () => ({ status: 200, body: { token: 'LT' } }),
    });
    await ensureTrackerSessionEnv(opts(f, T0));
    await ensureTrackerSessionEnv(opts(f, T0 + 5 * 60_000));
    expect(f).toHaveBeenCalledTimes(2); // second launch: zero portal calls
    await ensureTrackerSessionEnv(opts(f, T0 + 31 * 60_000)); // past the 30-min Jira ceiling + 15-min Linear window
    expect(f).toHaveBeenCalledTimes(4);
  });

  it('re-vends ahead of the Jira token expiry, never riding it to the deadline', async () => {
    let token = 'JT_1';
    const f = fetchMock({
      '/api/agents/jira-token': () => ({
        status: 200,
        body: { token, baseUrl: 'https://api.atlassian.com/ex/jira/c1', expiresAt: iso(T0 + 12 * 60_000) },
      }),
      '/api/agents/linear-token': () => ({ status: 204 }),
    });
    expect((await ensureTrackerSessionEnv(opts(f, T0))).JIRA_BEARER_TOKEN).toBe('JT_1');
    token = 'JT_2';
    // expiry T0+12min, margin 10min ⇒ refresh due from T0+2min
    expect((await ensureTrackerSessionEnv(opts(f, T0 + 3 * 60_000))).JIRA_BEARER_TOKEN).toBe('JT_2');
  });

  it('degrades to {} on transport failure without throwing, and retries after the backoff', async () => {
    let calls = 0;
    const f = vi.fn(async () => {
      calls++;
      throw new Error('portal unreachable');
    }) as unknown as typeof fetch;
    expect(await ensureTrackerSessionEnv(opts(f, T0))).toEqual({});
    expect(await ensureTrackerSessionEnv(opts(f, T0 + 30_000))).toEqual({}); // inside backoff — no new calls
    expect(calls).toBe(2); // one jira + one linear attempt
    await ensureTrackerSessionEnv(opts(f, T0 + 61_000)); // past backoff — retries both
    expect(calls).toBe(4);
  });
});
