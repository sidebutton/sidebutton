/**
 * Jira implementation of IssuesProvider.
 * Uses Jira REST API v3 with Basic auth (email + API token).
 */

import * as crypto from 'node:crypto';
import type { IssuesProvider, Attachment, AttachmentResult } from './types.js';

interface JiraAuth {
  baseUrl: string;
  authHeader: string;
}

export function getJiraAuth(envVars: Record<string, string>, site?: string): JiraAuth {
  const email = envVars.JIRA_USER_EMAIL;
  const token = envVars.JIRA_API_TOKEN;
  const url = site ?? envVars.JIRA_URL;

  if (!email || !token) {
    throw new Error('Jira credentials not configured. Set JIRA_USER_EMAIL and JIRA_API_TOKEN in Settings → Environment Variables.');
  }
  if (!url) {
    throw new Error('Jira URL not configured. Set JIRA_URL in Settings → Environment Variables (e.g. "mycompany.atlassian.net").');
  }

  const baseUrl = url.startsWith('https://') ? url : `https://${url}`;
  const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  return { baseUrl, authHeader };
}

async function jiraFetch(auth: JiraAuth, path: string, options?: RequestInit): Promise<Response> {
  const url = `${auth.baseUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: auth.authHeader,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jira API ${response.status}: ${errorText}`);
  }

  return response;
}

/** Convert plain text to Atlassian Document Format */
function toAdf(text: string): object {
  return {
    type: 'doc',
    version: 1,
    content: text.split('\n\n').map((paragraph) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: paragraph }],
    })),
  };
}

/** Extract plain text from ADF content */
function adfToText(adf: unknown): string {
  if (!adf || typeof adf !== 'object') return '';
  const doc = adf as { content?: Array<{ content?: Array<{ text?: string }> }> };
  if (!doc.content) return '';
  return doc.content
    .map((block) =>
      (block.content ?? []).map((inline) => inline.text ?? '').join('')
    )
    .join('\n\n');
}

interface JiraTransition {
  id: string;
  name: string;
  to: { id: string; name: string };
}

export class JiraProvider implements IssuesProvider {
  private envVars: Record<string, string>;
  private site?: string;

  constructor(envVars: Record<string, string>, site?: string) {
    this.envVars = envVars;
    this.site = site;
  }

  async create(params: {
    project: string;
    summary: string;
    description?: string;
    issueType?: string;
    labels?: string[];
  }): Promise<{ key: string; url: string }> {
    const auth = getJiraAuth(this.envVars, this.site);

    const fields: Record<string, unknown> = {
      project: { key: params.project },
      issuetype: { name: params.issueType ?? 'Task' },
      summary: params.summary,
    };

    if (params.description) {
      fields.description = toAdf(params.description);
    }
    if (params.labels && params.labels.length > 0) {
      fields.labels = params.labels;
    }

    const response = await jiraFetch(auth, '/rest/api/3/issue', {
      method: 'POST',
      body: JSON.stringify({ fields }),
    });

    const result = (await response.json()) as { id: string; key: string; self: string };
    return {
      key: result.key,
      url: `${auth.baseUrl}/browse/${result.key}`,
    };
  }

  async get(params: {
    issueKey: string;
    fields?: string;
  }): Promise<string> {
    const auth = getJiraAuth(this.envVars, this.site);
    const fieldsParam = params.fields ?? 'summary,status,assignee,description,issuetype,priority,labels';
    const response = await jiraFetch(
      auth,
      `/rest/api/3/issue/${encodeURIComponent(params.issueKey)}?fields=${encodeURIComponent(fieldsParam)}`
    );

    const issue = (await response.json()) as {
      key: string;
      fields: {
        summary?: string;
        status?: { name?: string };
        assignee?: { displayName?: string };
        issuetype?: { name?: string };
        priority?: { name?: string };
        labels?: string[];
        description?: unknown;
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

    const descText = adfToText(f.description);
    if (descText) {
      md += `\n### Description\n\n${descText}\n`;
    }

    return md;
  }

  async search(params: {
    query: string;
    maxResults?: number;
    fields?: string;
  }): Promise<string> {
    const auth = getJiraAuth(this.envVars, this.site);
    const maxResults = params.maxResults ?? 20;
    const fields = params.fields ?? 'summary,status,assignee,issuetype,priority';

    const response = await jiraFetch(auth, '/rest/api/3/search/jql', {
      method: 'POST',
      body: JSON.stringify({
        jql: params.query,
        maxResults,
        fields: fields.split(',').map((f) => f.trim()),
      }),
    });

    const data = (await response.json()) as {
      total?: number;
      isLast?: boolean;
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

    const count = data.total ?? data.issues.length;
    let md = `**${count} results** (showing ${data.issues.length})\n\n`;
    md += `| Key | Type | Summary | Status | Assignee | Priority |\n`;
    md += `|-----|------|---------|--------|----------|----------|\n`;

    for (const issue of data.issues) {
      const f = issue.fields;
      md += `| ${issue.key} | ${f.issuetype?.name ?? '-'} | ${f.summary ?? '-'} | ${f.status?.name ?? '-'} | ${f.assignee?.displayName ?? '-'} | ${f.priority?.name ?? '-'} |\n`;
    }

    return md;
  }

  async attach(params: {
    issueKey: string;
    attachments: Attachment[];
  }): Promise<AttachmentResult[]> {
    const auth = getJiraAuth(this.envVars, this.site);
    const attachmentUrl = `${auth.baseUrl}/rest/api/3/issue/${encodeURIComponent(params.issueKey)}/attachments`;
    const results: AttachmentResult[] = [];

    for (const file of params.attachments) {
      try {
        const base64Data = file.data.replace(/^data:[^;]+;base64,/, '');
        const binaryData = Buffer.from(base64Data, 'base64');
        const contentType = file.contentType ?? 'application/octet-stream';

        const boundary = '----FormBoundary' + crypto.randomUUID();
        const header = [
          `--${boundary}`,
          `Content-Disposition: form-data; name="file"; filename="${file.filename}"`,
          `Content-Type: ${contentType}`,
          '',
          '',
        ].join('\r\n');

        const footer = `\r\n--${boundary}--\r\n`;
        const body = Buffer.concat([
          Buffer.from(header),
          binaryData,
          Buffer.from(footer),
        ]);

        const response = await fetch(attachmentUrl, {
          method: 'POST',
          headers: {
            Authorization: auth.authHeader,
            'X-Atlassian-Token': 'no-check',
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body,
        });

        if (response.ok) {
          results.push({ name: file.filename, success: true });
        } else {
          const errText = await response.text();
          results.push({ name: file.filename, success: false, error: errText });
        }
      } catch (err) {
        results.push({
          name: file.filename,
          success: false,
          error: (err as Error).message,
        });
      }
    }

    return results;
  }

  async transition(params: {
    issueKey: string;
    status: string;
  }): Promise<void> {
    const auth = getJiraAuth(this.envVars, this.site);
    const issueKey = encodeURIComponent(params.issueKey);

    // Get available transitions
    const response = await jiraFetch(auth, `/rest/api/3/issue/${issueKey}/transitions`);
    const data = (await response.json()) as { transitions: JiraTransition[] };

    // Case-insensitive match against transition names
    const target = params.status.toLowerCase();
    const match = data.transitions.find((t) => t.name.toLowerCase() === target);

    if (!match) {
      const available = data.transitions.map((t) => t.name).join(', ');
      throw new Error(
        `No transition matching "${params.status}" for ${params.issueKey}. Available: ${available}`,
      );
    }

    await jiraFetch(auth, `/rest/api/3/issue/${issueKey}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ transition: { id: match.id } }),
    });
  }

  async comment(params: {
    issueKey: string;
    body: string;
  }): Promise<{ commentId: string }> {
    const auth = getJiraAuth(this.envVars, this.site);
    const issueKey = encodeURIComponent(params.issueKey);

    const response = await jiraFetch(auth, `/rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      body: JSON.stringify({ body: toAdf(params.body) }),
    });

    const result = (await response.json()) as { id: string };
    return { commentId: result.id };
  }
}
