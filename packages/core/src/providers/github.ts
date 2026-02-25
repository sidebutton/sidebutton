/**
 * GitHub implementation of GitProvider + IssuesProvider via `gh` CLI.
 * Calls gh commands via child_process.execFile, parses JSON output,
 * returns markdown tables (same pattern as JiraProvider).
 */

import { execFile } from 'node:child_process';
import type { GitProvider } from './types.js';
import type { IssuesProvider, Attachment, AttachmentResult } from './types.js';

function gh(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`gh ${args.join(' ')} failed: ${stderr || error.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export class GhCliProvider implements GitProvider, IssuesProvider {
  async listPullRequests(params: {
    repo?: string;
    state?: string;
    limit?: number;
  }): Promise<string> {
    const args = ['pr', 'list', '--json', 'number,title,state,author,headRefName,baseRefName,url,createdAt'];
    if (params.repo) args.push('-R', params.repo);
    if (params.state) args.push('--state', params.state);
    args.push('--limit', String(params.limit ?? 20));

    const output = await gh(args);
    const prs = JSON.parse(output) as Array<{
      number: number; title: string; state: string;
      author: { login: string }; headRefName: string;
      baseRefName: string; url: string; createdAt: string;
    }>;

    if (prs.length === 0) return 'No pull requests found.';

    let md = `**${prs.length} pull request${prs.length === 1 ? '' : 's'}**\n\n`;
    md += `| # | Title | State | Author | Head | Base |\n`;
    md += `|---|-------|-------|--------|------|------|\n`;
    for (const pr of prs) {
      md += `| #${pr.number} | ${pr.title} | ${pr.state} | ${pr.author?.login ?? '-'} | ${pr.headRefName} | ${pr.baseRefName} |\n`;
    }
    return md;
  }

  async getPullRequest(params: {
    repo?: string;
    number: number;
  }): Promise<string> {
    const args = ['pr', 'view', String(params.number), '--json',
      'number,title,state,body,author,headRefName,baseRefName,url,additions,deletions,changedFiles,reviewDecision,createdAt'];
    if (params.repo) args.push('-R', params.repo);

    const output = await gh(args);
    const pr = JSON.parse(output) as {
      number: number; title: string; state: string; body: string;
      author: { login: string }; headRefName: string; baseRefName: string;
      url: string; additions: number; deletions: number;
      changedFiles: number; reviewDecision: string; createdAt: string;
    };

    let md = `## PR #${pr.number}: ${pr.title}\n\n`;
    md += `| Field | Value |\n|-------|-------|\n`;
    md += `| State | ${pr.state} |\n`;
    md += `| Author | ${pr.author?.login ?? '-'} |\n`;
    md += `| Branch | ${pr.headRefName} → ${pr.baseRefName} |\n`;
    md += `| Changes | +${pr.additions} -${pr.deletions} (${pr.changedFiles} files) |\n`;
    md += `| Review | ${pr.reviewDecision || 'pending'} |\n`;
    md += `| URL | ${pr.url} |\n`;

    if (pr.body) {
      md += `\n### Description\n\n${pr.body}\n`;
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
    const args = ['pr', 'create', '--title', params.title, '--head', params.head];
    if (params.repo) args.push('-R', params.repo);
    if (params.body) args.push('--body', params.body);
    if (params.base) args.push('--base', params.base);
    args.push('--json', 'number,url');

    const output = await gh(args);
    const result = JSON.parse(output) as { number: number; url: string };
    return { number: result.number, url: result.url };
  }

  async listIssues(params: {
    repo?: string;
    state?: string;
    labels?: string;
    limit?: number;
  }): Promise<string> {
    const args = ['issue', 'list', '--json', 'number,title,state,author,labels,createdAt,url'];
    if (params.repo) args.push('-R', params.repo);
    if (params.state) args.push('--state', params.state);
    if (params.labels) args.push('--label', params.labels);
    args.push('--limit', String(params.limit ?? 20));

    const output = await gh(args);
    const issues = JSON.parse(output) as Array<{
      number: number; title: string; state: string;
      author: { login: string }; labels: Array<{ name: string }>;
      createdAt: string; url: string;
    }>;

    if (issues.length === 0) return 'No issues found.';

    let md = `**${issues.length} issue${issues.length === 1 ? '' : 's'}**\n\n`;
    md += `| # | Title | State | Author | Labels |\n`;
    md += `|---|-------|-------|--------|--------|\n`;
    for (const issue of issues) {
      const labels = issue.labels?.map((l) => l.name).join(', ') || '-';
      md += `| #${issue.number} | ${issue.title} | ${issue.state} | ${issue.author?.login ?? '-'} | ${labels} |\n`;
    }
    return md;
  }

  async getIssue(params: {
    repo?: string;
    number: number;
  }): Promise<string> {
    const args = ['issue', 'view', String(params.number), '--json',
      'number,title,state,body,author,labels,assignees,createdAt,url'];
    if (params.repo) args.push('-R', params.repo);

    const output = await gh(args);
    const issue = JSON.parse(output) as {
      number: number; title: string; state: string; body: string;
      author: { login: string }; labels: Array<{ name: string }>;
      assignees: Array<{ login: string }>; createdAt: string; url: string;
    };

    let md = `## Issue #${issue.number}: ${issue.title}\n\n`;
    md += `| Field | Value |\n|-------|-------|\n`;
    md += `| State | ${issue.state} |\n`;
    md += `| Author | ${issue.author?.login ?? '-'} |\n`;
    const assignees = issue.assignees?.map((a) => a.login).join(', ') || 'None';
    md += `| Assignees | ${assignees} |\n`;
    const labels = issue.labels?.map((l) => l.name).join(', ') || '-';
    md += `| Labels | ${labels} |\n`;
    md += `| URL | ${issue.url} |\n`;

    if (issue.body) {
      md += `\n### Description\n\n${issue.body}\n`;
    }
    return md;
  }

  // ============================================================================
  // IssuesProvider implementation (maps to gh issue commands)
  // ============================================================================

  async create(params: {
    project: string;
    summary: string;
    description?: string;
    issueType?: string;
    labels?: string[];
  }): Promise<{ key: string; url: string }> {
    const args = ['issue', 'create', '--title', params.summary];
    if (params.project) args.push('-R', params.project);
    if (params.description) args.push('--body', params.description);
    if (params.labels && params.labels.length > 0) {
      args.push('--label', params.labels.join(','));
    }
    args.push('--json', 'number,url');

    const output = await gh(args);
    const result = JSON.parse(output) as { number: number; url: string };
    return { key: `#${result.number}`, url: result.url };
  }

  async get(params: {
    issueKey: string;
    fields?: string;
  }): Promise<string> {
    const num = parseInt(params.issueKey.replace('#', ''), 10);
    return this.getIssue({ number: num });
  }

  async search(params: {
    query: string;
    maxResults?: number;
    fields?: string;
  }): Promise<string> {
    const args = ['issue', 'list', '--search', params.query,
      '--json', 'number,title,state,author,labels,createdAt,url'];
    args.push('--limit', String(params.maxResults ?? 20));

    const output = await gh(args);
    const issues = JSON.parse(output) as Array<{
      number: number; title: string; state: string;
      author: { login: string }; labels: Array<{ name: string }>;
      createdAt: string; url: string;
    }>;

    if (issues.length === 0) return 'No issues found.';

    let md = `**${issues.length} result${issues.length === 1 ? '' : 's'}**\n\n`;
    md += `| # | Title | State | Author | Labels |\n`;
    md += `|---|-------|-------|--------|--------|\n`;
    for (const issue of issues) {
      const labels = issue.labels?.map((l) => l.name).join(', ') || '-';
      md += `| #${issue.number} | ${issue.title} | ${issue.state} | ${issue.author?.login ?? '-'} | ${labels} |\n`;
    }
    return md;
  }

  async attach(_params: {
    issueKey: string;
    attachments: Attachment[];
  }): Promise<AttachmentResult[]> {
    // GitHub doesn't support issue attachments via CLI
    return _params.attachments.map((a) => ({
      name: a.filename,
      success: false,
      error: 'GitHub CLI does not support issue attachments. Use the web UI.',
    }));
  }

  async transition(_params: {
    issueKey: string;
    status: string;
  }): Promise<void> {
    const num = _params.issueKey.replace('#', '');
    const status = _params.status.toLowerCase();
    if (status === 'closed' || status === 'close') {
      await gh(['issue', 'close', num]);
    } else if (status === 'open' || status === 'reopen') {
      await gh(['issue', 'reopen', num]);
    } else {
      throw new Error(`GitHub issues only support "closed" and "open" states. Got: "${_params.status}"`);
    }
  }

  async comment(params: {
    issueKey: string;
    body: string;
  }): Promise<{ commentId: string }> {
    const num = params.issueKey.replace('#', '');
    await gh(['issue', 'comment', num, '--body', params.body]);
    return { commentId: 'created' };
  }
}
