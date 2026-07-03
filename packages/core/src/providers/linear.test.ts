/**
 * LinearProvider unit tests (mocked fetch) — SCRUM-1425 / docs/plans/LINEAR-PROVIDER.md §4–§5.
 *
 * Every Linear call is GraphQL-over-HTTP to one endpoint, so the fetch mock routes by a substring
 * of the query and records each call's variables. This lets us assert the operation sequence,
 * the key→UUID / team→state resolution, the raw-key auth, and the per-instance cache.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LinearProvider } from './linear.js';

const ENV = { LINEAR_API_KEY: 'lin_api_test' };
const GQL = 'https://api.linear.app/graphql';

interface RecordedCall {
  op: string;
  url: string;
  variables?: Record<string, any>;
  headers?: Record<string, string>;
}

/**
 * Route GraphQL ops by a unique substring of the query string. A route value is the `data` payload
 * to return; `{ errors: [...] }` simulates a GraphQL error and `{ __httpError, status, text }` a
 * transport/auth failure. Non-GraphQL URLs (the attachment PUT) are handled via `opts.put`.
 */
function mockFetch(
  routes: Record<string, any>,
  opts?: { put?: { ok?: boolean; status?: number } },
): { fn: ReturnType<typeof vi.fn>; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fn = vi.fn(async (url: string, init: any) => {
    if (url !== GQL) {
      // Attachment byte upload (PUT to signed storage URL).
      const ok = opts?.put?.ok ?? true;
      calls.push({ op: 'PUT', url, headers: init?.headers });
      return { ok, status: opts?.put?.status ?? (ok ? 200 : 500), text: async () => 'put-body' };
    }
    const body = JSON.parse(init.body) as { query: string; variables: Record<string, any> };
    const op = Object.keys(routes).find((k) => body.query.includes(k));
    calls.push({ op: op ?? 'UNKNOWN', url, variables: body.variables, headers: init.headers });
    if (!op) throw new Error(`No mock route for query: ${body.query}`);
    const payload = routes[op];
    if (payload && payload.__httpError) {
      return { ok: false, status: payload.status ?? 400, text: async () => payload.text ?? 'err' };
    }
    return {
      ok: true,
      status: 200,
      json: async () => (payload && payload.errors ? { errors: payload.errors } : { data: payload }),
    };
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

const ISSUE_NODE = {
  id: 'i1',
  identifier: 'ENG-3',
  team: { id: 't1', key: 'ENG' },
  state: { id: 's-old', name: 'Todo', type: 'unstarted' },
};

const STATES = {
  workflowStates: {
    nodes: [
      { id: 's-old', name: 'Todo', type: 'unstarted', position: 0 },
      { id: 's-prog', name: 'In Progress', type: 'started', position: 1 },
      { id: 's-done', name: 'Merged', type: 'completed', position: 2 },
      { id: 's-cancel', name: 'Dropped', type: 'canceled', position: 3 },
    ],
  },
};

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('LinearProvider construction & auth', () => {
  it('throws a clear setup error naming both credentials when neither is set', () => {
    expect(() => new LinearProvider({})).toThrow(/LINEAR_ACCESS_TOKEN/);
    expect(() => new LinearProvider({})).toThrow(/LINEAR_API_KEY/);
  });

  it('sends the RAW api key in Authorization (never "Bearer …")', async () => {
    const { calls } = mockFetch({
      'issues(filter': { issues: { nodes: [{ identifier: 'ENG-1', title: 'T', url: 'u' }] } },
    });
    await new LinearProvider(ENV).get({ issueKey: 'ENG-1' });
    expect(calls[0].headers?.Authorization).toBe('lin_api_test');
    expect(calls[0].headers?.Authorization).not.toMatch(/^Bearer/);
  });

  it('sends an OAuth app token as "Bearer <token>" (SCRUM-1583 D1)', async () => {
    const { calls } = mockFetch({
      'issues(filter': { issues: { nodes: [{ identifier: 'ENG-1', title: 'T', url: 'u' }] } },
    });
    await new LinearProvider({ LINEAR_ACCESS_TOKEN: 'lin_oauth_tok' }).get({ issueKey: 'ENG-1' });
    expect(calls[0].headers?.Authorization).toBe('Bearer lin_oauth_tok');
  });

  it('prefers the OAuth token over a stale personal key when both are set', async () => {
    const { calls } = mockFetch({
      'issues(filter': { issues: { nodes: [{ identifier: 'ENG-1', title: 'T', url: 'u' }] } },
    });
    await new LinearProvider({ LINEAR_ACCESS_TOKEN: 'lin_oauth_tok', LINEAR_API_KEY: 'lin_api_test' }).get({
      issueKey: 'ENG-1',
    });
    expect(calls[0].headers?.Authorization).toBe('Bearer lin_oauth_tok');
    expect(calls[0].headers?.Authorization).not.toBe('lin_api_test');
  });
});

describe('create', () => {
  it('resolves the team key→teamId and returns identifier + url', async () => {
    const { calls } = mockFetch({
      'teams(': { teams: { nodes: [{ id: 'team-uuid' }] } },
      issueCreate: {
        issueCreate: { success: true, issue: { identifier: 'ENG-7', url: 'https://linear.app/acme/issue/ENG-7' } },
      },
    });
    const res = await new LinearProvider(ENV).create({ project: 'eng', summary: 'Login fails' });
    expect(res).toEqual({ key: 'ENG-7', url: 'https://linear.app/acme/issue/ENG-7' });
    // team key is upper-cased before the lookup
    expect(calls.find((c) => c.op === 'teams(')?.variables?.key).toBe('ENG');
    const create = calls.find((c) => c.op === 'issueCreate');
    expect(create?.variables?.input).toMatchObject({ teamId: 'team-uuid', title: 'Login fails' });
    // no labels/issueType → labels are never resolved and no labelIds are sent
    expect(calls.some((c) => c.op === 'issueLabels')).toBe(false);
    expect(create?.variables?.input.labelIds).toBeUndefined();
  });

  it('folds issueType + labels into label ids (Linear has no issue types)', async () => {
    const { calls } = mockFetch({
      'teams(': { teams: { nodes: [{ id: 'team-uuid' }] } },
      issueLabels: { issueLabels: { nodes: [{ id: 'l1', name: 'bug' }, { id: 'l2', name: 'Story' }] } },
      issueCreate: { issueCreate: { success: true, issue: { identifier: 'ENG-8', url: 'u' } } },
    });
    await new LinearProvider(ENV).create({ project: 'ENG', summary: 'x', issueType: 'Story', labels: ['bug'] });
    expect(calls.find((c) => c.op === 'issueLabels')?.variables?.names).toEqual(['bug', 'Story']);
    expect(calls.find((c) => c.op === 'issueCreate')?.variables?.input.labelIds).toEqual(['l1', 'l2']);
  });

  it('surfaces success:false as an error', async () => {
    mockFetch({
      'teams(': { teams: { nodes: [{ id: 'team-uuid' }] } },
      issueCreate: { issueCreate: { success: false } },
    });
    await expect(new LinearProvider(ENV).create({ project: 'ENG', summary: 'x' })).rejects.toThrow(/issueCreate failed/);
  });
});

describe('get', () => {
  it('renders human-readable markdown and filters by team key + number', async () => {
    const { calls } = mockFetch({
      'issues(filter': {
        issues: {
          nodes: [
            {
              identifier: 'ENG-1',
              title: 'Login button fails',
              url: 'https://linear.app/acme/issue/ENG-1',
              state: { name: 'In Progress', type: 'started' },
              assignee: { name: 'Alice' },
              team: { key: 'ENG' },
              labels: { nodes: [{ name: 'bug' }] },
              description: 'Steps to reproduce',
            },
          ],
        },
      },
    });
    const md = await new LinearProvider(ENV).get({ issueKey: 'ENG-1' });
    expect(md).toContain('## ENG-1: Login button fails');
    expect(md).toContain('| Status | In Progress |');
    expect(md).toContain('| Assignee | Alice |');
    expect(md).toContain('| Labels | bug |');
    expect(md).toContain('### Description');
    expect(md).toContain('Steps to reproduce');
    expect(calls[0].variables?.filter).toEqual({ team: { key: { eq: 'ENG' } }, number: { eq: 1 } });
  });

  it('throws on an unparseable key', async () => {
    mockFetch({});
    await expect(new LinearProvider(ENV).get({ issueKey: 'not-a-key!' })).rejects.toThrow(/Invalid Linear issue key/);
  });

  it('throws when the issue does not exist', async () => {
    mockFetch({ 'issues(filter': { issues: { nodes: [] } } });
    await expect(new LinearProvider(ENV).get({ issueKey: 'ENG-99' })).rejects.toThrow(/not found/);
  });
});

describe('search', () => {
  it('uses full-text issueSearch (no JQL) and renders a table', async () => {
    const { calls } = mockFetch({
      issueSearch: {
        issueSearch: {
          nodes: [
            { identifier: 'ENG-2', title: 'Crash on save', state: { name: 'Todo' }, assignee: { name: 'Bob' }, team: { key: 'ENG' } },
          ],
        },
      },
    });
    const md = await new LinearProvider(ENV).search({ query: 'crash', maxResults: 5 });
    expect(md).toContain('**1 results**');
    expect(md).toContain('| ENG-2 | Crash on save | Todo | Bob | ENG |');
    expect(calls[0].variables).toEqual({ q: 'crash', n: 5 });
  });
});

describe('transition', () => {
  it('resolves a status NAME to the team stateId and updates the issue', async () => {
    const { calls } = mockFetch({
      'issues(filter': { issues: { nodes: [ISSUE_NODE] } },
      workflowStates: STATES,
      issueUpdate: { issueUpdate: { success: true } },
    });
    await new LinearProvider(ENV).transition({ issueKey: 'ENG-3', status: 'in progress' });
    const upd = calls.find((c) => c.op === 'issueUpdate');
    expect(upd?.variables).toEqual({ id: 'i1', input: { stateId: 's-prog' } });
  });

  it('maps the terminal "done" keyword to the completed-type state (no hardcoded name)', async () => {
    const { calls } = mockFetch({
      'issues(filter': { issues: { nodes: [ISSUE_NODE] } },
      workflowStates: STATES,
      issueUpdate: { issueUpdate: { success: true } },
    });
    await new LinearProvider(ENV).transition({ issueKey: 'ENG-3', status: 'done' });
    expect(calls.find((c) => c.op === 'issueUpdate')?.variables?.input.stateId).toBe('s-done');
  });

  it('is idempotent — no issueUpdate when already in the target state', async () => {
    const { calls } = mockFetch({
      'issues(filter': { issues: { nodes: [ISSUE_NODE] } }, // current state is "Todo"
      workflowStates: STATES,
      issueUpdate: { issueUpdate: { success: true } },
    });
    await new LinearProvider(ENV).transition({ issueKey: 'ENG-3', status: 'Todo' });
    expect(calls.some((c) => c.op === 'issueUpdate')).toBe(false);
  });

  it('throws listing the available states when nothing matches', async () => {
    mockFetch({
      'issues(filter': { issues: { nodes: [ISSUE_NODE] } },
      workflowStates: STATES,
    });
    await expect(new LinearProvider(ENV).transition({ issueKey: 'ENG-3', status: 'Nope' })).rejects.toThrow(
      /No Linear workflow state matching "Nope".*Todo, In Progress, Merged, Dropped/,
    );
  });
});

describe('comment', () => {
  it('posts markdown (not ADF) and returns the comment id', async () => {
    const { calls } = mockFetch({
      'issues(filter': { issues: { nodes: [ISSUE_NODE] } },
      commentCreate: { commentCreate: { success: true, comment: { id: 'c1' } } },
    });
    const res = await new LinearProvider(ENV).comment({ issueKey: 'ENG-3', body: '**done** — see PR' });
    expect(res).toEqual({ commentId: 'c1' });
    const c = calls.find((call) => call.op === 'commentCreate');
    // body is a plain markdown string, not an ADF object
    expect(c?.variables?.input).toEqual({ issueId: 'i1', body: '**done** — see PR' });
  });
});

describe('attach (two-step upload)', () => {
  const file = { filename: 'log.txt', data: Buffer.from('hello').toString('base64'), contentType: 'text/plain' };

  it('uploads bytes then links the asset to the issue', async () => {
    const { calls } = mockFetch({
      'issues(filter': { issues: { nodes: [ISSUE_NODE] } },
      fileUpload: {
        fileUpload: {
          success: true,
          uploadFile: { uploadUrl: 'https://upload.example/put', assetUrl: 'https://assets/x', headers: [{ key: 'x-h', value: 'v' }] },
        },
      },
      attachmentCreate: { attachmentCreate: { success: true } },
    });
    const res = await new LinearProvider(ENV).attach({ issueKey: 'ENG-3', attachments: [file] });
    expect(res).toEqual([{ name: 'log.txt', success: true }]);
    const put = calls.find((c) => c.op === 'PUT');
    expect(put?.url).toBe('https://upload.example/put');
    expect(put?.headers).toMatchObject({ 'Content-Type': 'text/plain', 'x-h': 'v' });
    expect(calls.find((c) => c.op === 'attachmentCreate')?.variables?.input).toMatchObject({
      issueId: 'i1',
      url: 'https://assets/x',
      title: 'log.txt',
    });
  });

  it('reports a per-file failure when the byte PUT fails', async () => {
    const { calls } = mockFetch(
      {
        'issues(filter': { issues: { nodes: [ISSUE_NODE] } },
        fileUpload: {
          fileUpload: { success: true, uploadFile: { uploadUrl: 'https://upload.example/put', assetUrl: 'https://assets/x', headers: [] } },
        },
      },
      { put: { ok: false, status: 503 } },
    );
    const res = await new LinearProvider(ENV).attach({ issueKey: 'ENG-3', attachments: [file] });
    expect(res[0].success).toBe(false);
    expect(res[0].error).toMatch(/PUT failed: 503/);
    expect(calls.some((c) => c.op === 'attachmentCreate')).toBe(false);
  });
});

describe('error handling', () => {
  it('surfaces a GraphQL errors[] body even though Linear answers HTTP 200', async () => {
    mockFetch({ 'issues(filter': { errors: [{ message: 'Entity not found' }] } });
    await expect(new LinearProvider(ENV).get({ issueKey: 'ENG-1' })).rejects.toThrow(/Linear GraphQL error: Entity not found/);
  });

  it('surfaces a non-2xx transport/auth failure', async () => {
    mockFetch({ 'issues(filter': { __httpError: true, status: 401, text: 'Unauthorized' } });
    await expect(new LinearProvider(ENV).get({ issueKey: 'ENG-1' })).rejects.toThrow(/Linear API 401/);
  });
});

describe('per-run key→id cache', () => {
  it('resolves an issue key once across multiple writes', async () => {
    const { calls } = mockFetch({
      'issues(filter': { issues: { nodes: [ISSUE_NODE] } },
      commentCreate: { commentCreate: { success: true, comment: { id: 'c1' } } },
    });
    const provider = new LinearProvider(ENV);
    await provider.comment({ issueKey: 'ENG-3', body: 'first' });
    await provider.comment({ issueKey: 'ENG-3', body: 'second' });
    // resolveIssue (the `issues(filter` query) ran only once; the second comment hit the cache.
    expect(calls.filter((c) => c.op === 'issues(filter').length).toBe(1);
    expect(calls.filter((c) => c.op === 'commentCreate').length).toBe(2);
  });
});
