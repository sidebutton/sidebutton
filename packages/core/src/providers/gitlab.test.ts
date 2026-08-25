/**
 * GlabCliProvider unit tests (SCRUM-1955) — the argv the provider hands to `glab`, and how it
 * renders / parses what comes back.
 *
 * Every flag asserted here was checked against the pinned glab 1.113.0 that provisioning installs
 * (scripts/setup-agent-vm.sh step 4b): `--output json` is the only long form that works on BOTH
 * `mr` and `issue` (their short flags differ), `mr list` has `--closed/--merged/--all` instead of
 * `--state` and `--per-page` instead of `--limit`, and `mr create` has NO json output at all — so
 * argv drift here is a real runtime break, not a cosmetic one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { GlabCliProvider } from './gitlab.js';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

type ExecFileCb = (error: Error | null, stdout: string, stderr: string) => void;
const execFileMock = execFile as unknown as ReturnType<typeof vi.fn>;

/** argv of every glab invocation, in order. */
let calls: string[][] = [];

/** Queue one glab response (JSON body, raw text, or a failure). */
function respond(result: { stdout?: string; stderr?: string; error?: Error }): void {
  execFileMock.mockImplementationOnce(
    (cmd: string, args: string[], _opts: unknown, cb: ExecFileCb) => {
      expect(cmd).toBe('glab');
      calls.push(args);
      cb(result.error ?? null, result.stdout ?? '', result.stderr ?? '');
    },
  );
}

const MR = {
  iid: 7,
  title: 'Add host-aware push',
  state: 'opened',
  description: 'Body text',
  author: { username: 'agent', name: 'Agent' },
  source_branch: 'feat/x',
  target_branch: 'main',
  web_url: 'https://gitlab.com/group/sub/repo/-/merge_requests/7',
  created_at: '2026-08-17T10:00:00Z',
  changes_count: '3',
  detailed_merge_status: 'mergeable',
};

const ISSUE = {
  iid: 12,
  title: 'Broken redirect',
  state: 'opened',
  description: 'Steps to reproduce',
  author: { username: 'reporter' },
  labels: ['bug', 'p1'],
  assignees: [{ username: 'dev1' }, { username: 'dev2' }],
  created_at: '2026-08-17T10:00:00Z',
  web_url: 'https://gitlab.com/group/sub/repo/-/issues/12',
};

const provider = new GlabCliProvider();

beforeEach(() => {
  calls = [];
  execFileMock.mockReset();
});

describe('listPullRequests', () => {
  it('sends the json + per-page argv and renders a markdown table of iids', async () => {
    respond({ stdout: JSON.stringify([MR]) });

    const md = await provider.listPullRequests({});

    expect(calls[0]).toEqual(['mr', 'list', '--output', 'json', '--per-page', '20']);
    expect(md).toContain('**1 merge request**');
    expect(md).toContain('| !7 | Add host-aware push | opened | agent | feat/x | main |');
  });

  it('passes a nested subgroup path through -R and honors limit', async () => {
    respond({ stdout: '[]' });

    const md = await provider.listPullRequests({ repo: 'group/sub/repo', limit: 5 });

    expect(calls[0]).toEqual([
      'mr', 'list', '--output', 'json', '-R', 'group/sub/repo', '--per-page', '5',
    ]);
    expect(md).toBe('No merge requests found.');
  });

  it.each([
    ['open', []],
    ['opened', []],
    ['closed', ['--closed']],
    ['merged', ['--merged']],
    ['all', ['--all']],
  ])('maps state %s to %j (glab has no --state flag)', async (state, expected) => {
    respond({ stdout: '[]' });

    await provider.listPullRequests({ state: state as string });

    expect(calls[0]).toEqual(['mr', 'list', '--output', 'json', ...expected, '--per-page', '20']);
  });

  it('clamps limit to GitLab\'s 100-per-page maximum (glab fetches one page, gh --limit paginates)', async () => {
    respond({ stdout: '[]' });

    await provider.listPullRequests({ limit: 250 });

    expect(calls[0]).toEqual(['mr', 'list', '--output', 'json', '--per-page', '100']);
  });

  it('rejects an unknown state instead of silently listing open MRs', async () => {
    await expect(provider.listPullRequests({ state: 'draft' })).rejects.toThrow(
      /unsupported state "draft". Supported: open, closed, merged, all/,
    );
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('propagates glab stderr', async () => {
    respond({ error: new Error('exit 1'), stderr: 'no GitLab Projects found from remotes' });

    await expect(provider.listPullRequests({})).rejects.toThrow(
      /glab mr list .* failed: no GitLab Projects found from remotes/,
    );
  });
});

describe('getPullRequest', () => {
  it('views by iid and renders the detail table', async () => {
    respond({ stdout: JSON.stringify({ ...MR, draft: true }) });

    const md = await provider.getPullRequest({ repo: 'group/sub/repo', number: 7 });

    expect(calls[0]).toEqual(['mr', 'view', '7', '--output', 'json', '-R', 'group/sub/repo']);
    expect(md).toContain('## MR !7: Add host-aware push');
    expect(md).toContain('| State | opened (draft) |');
    expect(md).toContain('| Branch | feat/x → main |');
    expect(md).toContain('| Changes | 3 files |');
    expect(md).toContain('| Merge status | mergeable |');
    expect(md).toContain('| URL | https://gitlab.com/group/sub/repo/-/merge_requests/7 |');
    expect(md).toContain('### Description\n\nBody text');
  });

  it('says unknown rather than undefined when glab omits the merge status', async () => {
    respond({ stdout: JSON.stringify({ ...MR, detailed_merge_status: undefined }) });

    expect(await provider.getPullRequest({ number: 7 })).toContain('| Merge status | unknown |');
  });
});

describe('createPullRequest', () => {
  it('maps head to --source-branch (not glab -H, which is the head REPO) and is non-interactive', async () => {
    respond({ stdout: 'https://gitlab.com/group/sub/repo/-/merge_requests/7' });

    const result = await provider.createPullRequest({
      repo: 'group/sub/repo',
      title: 'Add host-aware push',
      body: '## Summary\nx',
      head: 'feat/x',
      base: 'main',
    });

    expect(calls[0]).toEqual([
      'mr', 'create',
      '--title', 'Add host-aware push',
      '--source-branch', 'feat/x',
      '-R', 'group/sub/repo',
      '--description', '## Summary\nx',
      '--target-branch', 'main',
      '--yes',
    ]);
    // The MR "number" is the per-project iid, read off the URL's last segment.
    expect(result).toEqual({ number: 7, url: 'https://gitlab.com/group/sub/repo/-/merge_requests/7' });
  });

  it('omits the optional flags when body/base/repo are not given', async () => {
    respond({ stdout: 'https://gitlab.com/group/repo/-/merge_requests/1' });

    await provider.createPullRequest({ title: 'T', head: 'feat/y' });

    expect(calls[0]).toEqual(['mr', 'create', '--title', 'T', '--source-branch', 'feat/y', '--yes']);
  });

  it('parses the iid out of the decorated TTY-style block too, at any namespace depth', async () => {
    respond({
      stdout: [
        '!42 Add host-aware push (feat/x)',
        ' https://gitlab.com/group/sub/deeper/repo/-/merge_requests/42',
      ].join('\n'),
    });

    expect(await provider.createPullRequest({ title: 'T', head: 'feat/x' })).toEqual({
      number: 42,
      url: 'https://gitlab.com/group/sub/deeper/repo/-/merge_requests/42',
    });
  });

  it('ignores the progress line glab writes to stderr and takes the URL from stdout', async () => {
    // The real split: "Creating merge request for <src> into <dst> in <repo>" goes to stderr, the
    // bare web URL to stdout.
    respond({
      stdout: 'https://gitlab.com/group/repo/-/merge_requests/9',
      stderr: 'Creating merge request for feat/x into main in group/repo',
    });

    expect((await provider.createPullRequest({ title: 'T', head: 'feat/x' })).number).toBe(9);
  });

  it('takes the LAST MR URL, so a link in the surrounding output cannot win over the created MR', async () => {
    respond({
      stdout: [
        'Related: https://gitlab.com/group/repo/-/merge_requests/3',
        'https://gitlab.com/group/repo/-/merge_requests/11',
      ].join('\n'),
    });

    expect(await provider.createPullRequest({ title: 'T', head: 'feat/x' })).toEqual({
      number: 11,
      url: 'https://gitlab.com/group/repo/-/merge_requests/11',
    });
  });

  it('fails loudly (quoting glab) when no MR URL comes back', async () => {
    respond({ stdout: 'aborted' });

    await expect(provider.createPullRequest({ title: 'T', head: 'feat/x' })).rejects.toThrow(
      /could not find a merge request URL in its output: aborted/,
    );
  });
});

describe('listIssues / getIssue', () => {
  it('lists with --label and renders GitLab string labels', async () => {
    respond({ stdout: JSON.stringify([ISSUE]) });

    const md = await provider.listIssues({ state: 'closed', labels: 'bug,p1', limit: 3 });

    expect(calls[0]).toEqual([
      'issue', 'list', '--output', 'json', '--closed', '--label', 'bug,p1', '--per-page', '3',
    ]);
    // GitLab labels are plain strings — the GitHub `{ name }` shape would render "[object Object]".
    expect(md).toContain('| #12 | Broken redirect | opened | reporter | bug, p1 |');
  });

  it('rejects state=merged for issues', async () => {
    await expect(provider.listIssues({ state: 'merged' })).rejects.toThrow(
      /glab issue list: unsupported state "merged". Supported: open, closed, all/,
    );
  });

  it('views an issue by iid and lists assignees', async () => {
    respond({ stdout: JSON.stringify(ISSUE) });

    const md = await provider.getIssue({ repo: 'group/sub/repo', number: 12 });

    expect(calls[0]).toEqual(['issue', 'view', '12', '--output', 'json', '-R', 'group/sub/repo']);
    expect(md).toContain('## Issue #12: Broken redirect');
    expect(md).toContain('| Assignees | dev1, dev2 |');
    expect(md).toContain('| Labels | bug, p1 |');
  });

  it('reports an empty issue list', async () => {
    respond({ stdout: '[]' });
    expect(await provider.listIssues({})).toBe('No issues found.');
  });
});
