/**
 * Jira implementation of IssuesProvider via Atlassian CLI (acli).
 * Calls `acli jira workitem` commands via child_process.execFile.
 * Auth is handled by `acli jira auth login` (browser OAuth, cached locally).
 */

import { execFile } from 'node:child_process';
import type { IssuesProvider, Attachment, AttachmentResult } from './types.js';

function acli(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('acli', ['jira', ...args], { timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`acli jira ${args.join(' ')} failed: ${stderr || error.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export class AcliJiraProvider implements IssuesProvider {
  async create(params: {
    project: string;
    summary: string;
    description?: string;
    issueType?: string;
    labels?: string[];
  }): Promise<{ key: string; url: string }> {
    const args = ['workitem', 'create',
      '--project', params.project,
      '--summary', params.summary,
      '--type', params.issueType ?? 'Task',
    ];
    if (params.description) args.push('--description', params.description);
    if (params.labels && params.labels.length > 0) {
      args.push('--labels', params.labels.join(','));
    }
    args.push('--output', 'json');

    const output = await acli(args);
    const result = JSON.parse(output) as { key: string; self: string };
    // Derive browse URL from self link
    const baseUrl = result.self?.split('/rest/')[0] ?? '';
    return { key: result.key, url: `${baseUrl}/browse/${result.key}` };
  }

  async get(params: {
    issueKey: string;
    fields?: string;
  }): Promise<string> {
    const args = ['workitem', 'view', params.issueKey, '--output', 'json'];
    const output = await acli(args);
    const issue = JSON.parse(output) as {
      key: string;
      fields: {
        summary?: string;
        status?: { name?: string };
        assignee?: { displayName?: string };
        issuetype?: { name?: string };
        priority?: { name?: string };
        labels?: string[];
        description?: string;
      };
    };

    const f = issue.fields;
    let md = `## ${issue.key}: ${f.summary ?? 'Untitled'}\n\n`;
    md += `| Field | Value |\n|-------|-------|\n`;
    md += `| Type | ${f.issuetype?.name ?? '-'} |\n`;
    md += `| Status | ${f.status?.name ?? '-'} |\n`;
    md += `| Priority | ${f.priority?.name ?? '-'} |\n`;
    md += `| Assignee | ${f.assignee?.displayName ?? 'Unassigned'} |\n`;
    if (f.labels && f.labels.length > 0) {
      md += `| Labels | ${f.labels.join(', ')} |\n`;
    }
    if (f.description) {
      md += `\n### Description\n\n${f.description}\n`;
    }
    return md;
  }

  async search(params: {
    query: string;
    maxResults?: number;
    fields?: string;
  }): Promise<string> {
    const args = ['workitem', 'list',
      '--jql', params.query,
      '--limit', String(params.maxResults ?? 20),
      '--output', 'json',
    ];

    const output = await acli(args);
    const data = JSON.parse(output) as {
      issues: Array<{
        key: string;
        fields: {
          summary?: string;
          status?: { name?: string };
          assignee?: { displayName?: string };
          issuetype?: { name?: string };
          priority?: { name?: string };
        };
      }>;
    };

    const issues = data.issues ?? [];
    if (issues.length === 0) return 'No issues found.';

    let md = `**${issues.length} result${issues.length === 1 ? '' : 's'}**\n\n`;
    md += `| Key | Type | Summary | Status | Assignee | Priority |\n`;
    md += `|-----|------|---------|--------|----------|----------|\n`;
    for (const issue of issues) {
      const f = issue.fields;
      md += `| ${issue.key} | ${f.issuetype?.name ?? '-'} | ${f.summary ?? '-'} | ${f.status?.name ?? '-'} | ${f.assignee?.displayName ?? '-'} | ${f.priority?.name ?? '-'} |\n`;
    }
    return md;
  }

  async attach(params: {
    issueKey: string;
    attachments: Attachment[];
  }): Promise<AttachmentResult[]> {
    // ACLI supports attachments via `acli jira workitem attach`
    // but requires files on disk. For now, return unsupported.
    return params.attachments.map((a) => ({
      name: a.filename,
      success: false,
      error: 'ACLI attachment from base64 not yet implemented. Use the REST API connector.',
    }));
  }

  async transition(params: {
    issueKey: string;
    status: string;
  }): Promise<void> {
    await acli(['workitem', 'transition', params.issueKey, '--transition', params.status]);
  }

  async comment(params: {
    issueKey: string;
    body: string;
  }): Promise<{ commentId: string }> {
    const output = await acli([
      'workitem', 'comment', params.issueKey,
      '--body', params.body,
      '--output', 'json',
    ]);
    const result = JSON.parse(output) as { id?: string };
    return { commentId: result.id ?? 'created' };
  }
}
