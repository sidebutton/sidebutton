/**
 * GitLab implementation of GitProvider via the `glab` CLI (SCRUM-1955).
 * Twin of GhCliProvider (github.ts): calls glab via child_process.execFile, parses JSON output,
 * returns markdown tables.
 *
 * Deliberately NOT an IssuesProvider: `getIssuesProvider` has no `gitlab` case, so advertising
 * issues.* for GitLab would be exactly the phantom capability SCRUM-1189 removed. The five git.*
 * methods below are the whole contract.
 *
 * Flag notes, verified against the pinned glab 1.113.0 (scripts/setup-agent-vm.sh step 4b):
 *  - `--output json` is spelled `-F` on `mr list|view` but `-O` on `issue list` (`-F` there means
 *    `--output-format details|ids|urls`). Only the LONG form is consistent, so we always use it.
 *  - `mr list` has no `--state`; it has `--closed`/`--merged`/`--all` and defaults to open.
 *  - `mr list` has no `--limit`; page size is `--per-page`, and glab fetches exactly ONE page
 *    (unlike `gh --limit`, which paginates), so `limit` is capped at GitLab's 100/page maximum.
 *  - `mr create` has NO json output flag, so the MR iid + URL are scraped from its output.
 */

import { execFile } from 'node:child_process';
import type { GitProvider } from './types.js';

function glab(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile('glab', args, { timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`glab ${args.join(' ')} failed: ${stderr || error.message}`));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function glabJson<T>(args: string[]): Promise<T> {
  const { stdout } = await glab(args);
  return JSON.parse(stdout) as T;
}

/**
 * `state` is a free-form string on the GitProvider interface (gh takes `--state <value>`), but glab
 * spells each state as its own boolean flag. Map the known values and reject the rest loudly — a
 * silently ignored filter would return open MRs while the caller believes it asked for merged ones.
 */
function mrStateArgs(state: string | undefined, kind: 'mr' | 'issue'): string[] {
  if (!state) return [];
  switch (state.toLowerCase()) {
    case 'open':
    case 'opened':
      return []; // glab's default
    case 'closed':
      return ['--closed'];
    case 'merged':
      if (kind === 'issue') break;
      return ['--merged'];
    case 'all':
      return ['--all'];
  }
  const supported = kind === 'mr' ? 'open, closed, merged, all' : 'open, closed, all';
  throw new Error(`glab ${kind} list: unsupported state "${state}". Supported: ${supported}`);
}

/**
 * glab asks for one page of `--per-page` items and stops; GitLab rejects anything above 100 per
 * page. Clamp rather than pass through, so a caller's large `limit` degrades predictably instead
 * of erroring at the API.
 */
const PER_PAGE_MAX = 100;
const perPage = (limit: number | undefined): string => String(Math.min(limit ?? 20, PER_PAGE_MAX));

/**
 * glab prints the plain web URL on `mr create` when stdout is not a TTY (which it never is under
 * execFile) and a decorated block when it is; both carry the URL, and the iid is its last segment.
 * The namespace can nest arbitrarily deep (group/subgroup/project), so anchor on `/merge_requests/`
 * rather than on a fixed number of path segments.
 */
function parseCreatedMr(output: string): { number: number; url: string } {
  const matches = [...output.matchAll(/https?:\/\/\S*?\/merge_requests\/(\d+)/g)];
  const last = matches[matches.length - 1];
  if (!last) {
    throw new Error(`glab mr create: could not find a merge request URL in its output: ${output}`);
  }
  return { number: parseInt(last[1], 10), url: last[0] };
}

interface GlabMr {
  iid: number;
  title: string;
  state: string;
  description?: string;
  author?: { username?: string; name?: string };
  source_branch: string;
  target_branch: string;
  web_url: string;
  created_at: string;
  draft?: boolean;
  changes_count?: string;
  /**
   * glab re-marshals its vendored struct, which carries only the modern field — a `merge_status`
   * from an older GitLab never survives to us, so there is nothing to fall back to.
   */
  detailed_merge_status?: string;
}

interface GlabIssue {
  iid: number;
  title: string;
  state: string;
  description?: string;
  author?: { username?: string; name?: string };
  /** GitLab issue labels are plain strings, not objects (unlike GitHub's `{ name }`). */
  labels?: string[];
  assignees?: Array<{ username?: string; name?: string }>;
  created_at: string;
  web_url: string;
}

const who = (u?: { username?: string; name?: string }): string => u?.username ?? u?.name ?? '-';

export class GlabCliProvider implements GitProvider {
  async listPullRequests(params: {
    repo?: string;
    state?: string;
    limit?: number;
  }): Promise<string> {
    const args = ['mr', 'list', '--output', 'json'];
    if (params.repo) args.push('-R', params.repo);
    args.push(...mrStateArgs(params.state, 'mr'));
    args.push('--per-page', perPage(params.limit));

    const mrs = await glabJson<GlabMr[]>(args);
    if (mrs.length === 0) return 'No merge requests found.';

    let md = `**${mrs.length} merge request${mrs.length === 1 ? '' : 's'}**\n\n`;
    md += `| ! | Title | State | Author | Source | Target |\n`;
    md += `|---|-------|-------|--------|--------|--------|\n`;
    for (const mr of mrs) {
      md += `| !${mr.iid} | ${mr.title} | ${mr.state} | ${who(mr.author)} | ${mr.source_branch} | ${mr.target_branch} |\n`;
    }
    return md;
  }

  async getPullRequest(params: {
    repo?: string;
    number: number;
  }): Promise<string> {
    const args = ['mr', 'view', String(params.number), '--output', 'json'];
    if (params.repo) args.push('-R', params.repo);

    const mr = await glabJson<GlabMr>(args);

    let md = `## MR !${mr.iid}: ${mr.title}\n\n`;
    md += `| Field | Value |\n|-------|-------|\n`;
    md += `| State | ${mr.state}${mr.draft ? ' (draft)' : ''} |\n`;
    md += `| Author | ${who(mr.author)} |\n`;
    md += `| Branch | ${mr.source_branch} → ${mr.target_branch} |\n`;
    md += `| Changes | ${mr.changes_count ?? '-'} files |\n`;
    md += `| Merge status | ${mr.detailed_merge_status || 'unknown'} |\n`;
    md += `| URL | ${mr.web_url} |\n`;

    if (mr.description) {
      md += `\n### Description\n\n${mr.description}\n`;
    }
    return md;
  }

  async createPullRequest(params: {
    repo?: string;
    title: string;
    body?: string;
    head: string;
    base?: string;
  }): Promise<{ number: number; url: string }> {
    // `head` is the SOURCE BRANCH. Note the trap: glab's `-H/--head` is the head *repository*
    // (fork), not the branch — the branch flag is `--source-branch`.
    const args = ['mr', 'create', '--title', params.title, '--source-branch', params.head];
    if (params.repo) args.push('-R', params.repo);
    if (params.body) args.push('--description', params.body);
    if (params.base) args.push('--target-branch', params.base);
    args.push('--yes'); // non-interactive: skip the submission confirmation prompt

    const { stdout, stderr } = await glab(args);
    return parseCreatedMr(`${stdout}\n${stderr}`);
  }

  async listIssues(params: {
    repo?: string;
    state?: string;
    labels?: string;
    limit?: number;
  }): Promise<string> {
    const args = ['issue', 'list', '--output', 'json'];
    if (params.repo) args.push('-R', params.repo);
    args.push(...mrStateArgs(params.state, 'issue'));
    if (params.labels) args.push('--label', params.labels);
    args.push('--per-page', perPage(params.limit));

    const issues = await glabJson<GlabIssue[]>(args);
    if (issues.length === 0) return 'No issues found.';

    let md = `**${issues.length} issue${issues.length === 1 ? '' : 's'}**\n\n`;
    md += `| # | Title | State | Author | Labels |\n`;
    md += `|---|-------|-------|--------|--------|\n`;
    for (const issue of issues) {
      const labels = issue.labels?.join(', ') || '-';
      md += `| #${issue.iid} | ${issue.title} | ${issue.state} | ${who(issue.author)} | ${labels} |\n`;
    }
    return md;
  }

  async getIssue(params: {
    repo?: string;
    number: number;
  }): Promise<string> {
    const args = ['issue', 'view', String(params.number), '--output', 'json'];
    if (params.repo) args.push('-R', params.repo);

    const issue = await glabJson<GlabIssue>(args);

    let md = `## Issue #${issue.iid}: ${issue.title}\n\n`;
    md += `| Field | Value |\n|-------|-------|\n`;
    md += `| State | ${issue.state} |\n`;
    md += `| Author | ${who(issue.author)} |\n`;
    const assignees = issue.assignees?.map((a) => who(a)).join(', ') || 'None';
    md += `| Assignees | ${assignees} |\n`;
    md += `| Labels | ${issue.labels?.join(', ') || '-'} |\n`;
    md += `| URL | ${issue.web_url} |\n`;

    if (issue.description) {
      md += `\n### Description\n\n${issue.description}\n`;
    }
    return md;
  }
}
