/**
 * Linear implementation of IssuesProvider.
 *
 * Talks to Linear's single GraphQL endpoint (https://api.linear.app/graphql). Authentication is one
 * of two shapes, resolved once in the constructor (docs/plans/LINEAR-OAUTH-APP.md §11):
 *   - an OAuth app access token (`LINEAR_ACCESS_TOKEN`) sent as `Authorization: Bearer <token>`, or
 *   - a personal API key (`LINEAR_API_KEY`) sent RAW in `Authorization` (no "Bearer " prefix).
 * The OAuth token wins when both are present. Unlike Jira's REST API, Linear answers HTTP 200 even on
 * failure and reports problems in a top-level `errors[]` array, so {@link LinearProvider.graphql}
 * inspects the body, not just the status.
 *
 * Linear has no first-class issue keys as primary ids: `ENG-123` is the `identifier`, while every
 * write wants the issue / team / state UUID. We resolve identifier→UUID (and team-key→UUID,
 * team→states) on demand and cache per instance to stay under Linear's complexity-based rate limit.
 *
 * Concept mapping (docs/plans/LINEAR-PROVIDER.md §2/§4/§5):
 *   create.project    → Linear TEAM key (resolved to a teamId)
 *   create.issueType  → a label (Linear has no first-class issue types)
 *   transition.status → a workflow-state name, resolved within the issue's own team; the terminal
 *                       category keywords ("done"/"canceled") fall back to the state `type`
 *   comment / description body → Markdown (no ADF wrapping)
 */

import type { IssuesProvider, Attachment, AttachmentResult } from './types.js';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

/** `ENG-123` → `{ teamKey: 'ENG', number: 123 }`. Linear keys share Jira's `TEAM-\d+` shape. */
function parseIssueKey(issueKey: string): { teamKey: string; number: number } {
  const m = /^([A-Za-z][A-Za-z0-9_]*)-(\d+)$/.exec(issueKey.trim());
  if (!m) {
    throw new Error(`Invalid Linear issue key "${issueKey}" (expected TEAM-123, e.g. ENG-42).`);
  }
  return { teamKey: m[1].toUpperCase(), number: Number(m[2]) };
}

interface LinearState {
  id: string;
  name: string;
  /** triage | backlog | unstarted | started | completed | canceled */
  type: string;
  position: number;
}

interface ResolvedIssue {
  id: string;
  identifier: string;
  teamId: string;
  teamKey: string;
  stateId: string;
}

export class LinearProvider implements IssuesProvider {
  /** Pre-resolved `Authorization` header value: `Bearer <oauth-token>` or the raw personal key. */
  private authHeader: string;
  // Per-instance (per-run) caches — Linear ops need UUIDs that cost an extra round trip to look up.
  private issueCache = new Map<string, ResolvedIssue>();
  private teamCache = new Map<string, string>();
  private stateCache = new Map<string, LinearState[]>();

  constructor(envVars: Record<string, string>) {
    // Two credential shapes. An OAuth app token (Bearer) wins over a personal key (raw) when both are
    // present — a stale leftover key must never shadow the account's live app token (§11).
    const oauthToken = envVars.LINEAR_ACCESS_TOKEN;
    const apiKey = envVars.LINEAR_API_KEY;
    if (oauthToken) {
      this.authHeader = `Bearer ${oauthToken}`;
    } else if (apiKey) {
      this.authHeader = apiKey;
    } else {
      throw new Error(
        'Linear credentials not configured. Set LINEAR_ACCESS_TOKEN (OAuth app token) or ' +
          'LINEAR_API_KEY (personal API key) in Settings → Environment Variables.',
      );
    }
  }

  /** POST a GraphQL operation; throw on a transport failure OR a non-empty `errors[]`. */
  private async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(LINEAR_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Resolved in the constructor: "Bearer <oauth-token>" or the raw personal API key.
        Authorization: this.authHeader,
      },
      body: JSON.stringify({ query, variables: variables ?? {} }),
    });

    // Linear answers 200 even for GraphQL-level errors; a non-2xx is a transport/auth failure.
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Linear API ${response.status}: ${text}`);
    }

    const body = (await response.json()) as {
      data?: T;
      errors?: Array<{ message?: string }>;
    };
    if (body.errors && body.errors.length > 0) {
      throw new Error(
        `Linear GraphQL error: ${body.errors.map((e) => e.message ?? 'unknown').join('; ')}`,
      );
    }
    if (body.data === undefined || body.data === null) {
      throw new Error('Linear GraphQL returned no data.');
    }
    return body.data;
  }

  // ---- resolution helpers (cached) -----------------------------------------

  /** Team key (`ENG`) → team UUID. */
  private async resolveTeamId(teamKey: string): Promise<string> {
    const cached = this.teamCache.get(teamKey);
    if (cached) return cached;

    const data = await this.graphql<{ teams: { nodes: Array<{ id: string }> } }>(
      `query($key:String!){ teams(filter:{ key:{ eq:$key } }, first:1){ nodes{ id } } }`,
      { key: teamKey },
    );
    const id = data.teams.nodes[0]?.id;
    if (!id) throw new Error(`No Linear team with key "${teamKey}".`);
    this.teamCache.set(teamKey, id);
    return id;
  }

  /** Issue key (`ENG-123`) → `{ id, teamId, stateId, … }`. */
  private async resolveIssue(issueKey: string): Promise<ResolvedIssue> {
    const cached = this.issueCache.get(issueKey);
    if (cached) return cached;

    const { teamKey, number } = parseIssueKey(issueKey);
    const data = await this.graphql<{
      issues: {
        nodes: Array<{
          id: string;
          identifier: string;
          team: { id: string; key: string };
          state?: { id: string };
        }>;
      };
    }>(
      `query($filter:IssueFilter!){ issues(filter:$filter, first:1){ nodes{ id identifier team{ id key } state{ id } } } }`,
      { filter: { team: { key: { eq: teamKey } }, number: { eq: number } } },
    );
    const node = data.issues.nodes[0];
    if (!node) throw new Error(`Linear issue "${issueKey}" not found.`);

    const resolved: ResolvedIssue = {
      id: node.id,
      identifier: node.identifier,
      teamId: node.team.id,
      teamKey: node.team.key,
      stateId: node.state?.id ?? '',
    };
    this.issueCache.set(issueKey, resolved);
    this.teamCache.set(node.team.key, node.team.id);
    return resolved;
  }

  /** Workflow states for a team (the transition target set). */
  private async teamStates(teamId: string): Promise<LinearState[]> {
    const cached = this.stateCache.get(teamId);
    if (cached) return cached;

    const data = await this.graphql<{ workflowStates: { nodes: LinearState[] } }>(
      `query($teamId:ID!){ workflowStates(filter:{ team:{ id:{ eq:$teamId } } }){ nodes{ id name type position } } }`,
      { teamId },
    );
    const states = data.workflowStates.nodes;
    this.stateCache.set(teamId, states);
    return states;
  }

  /** Resolve label names → label UUIDs (unknown names are dropped). */
  private async resolveLabelIds(names: string[]): Promise<string[]> {
    if (names.length === 0) return [];
    const data = await this.graphql<{ issueLabels: { nodes: Array<{ id: string; name: string }> } }>(
      `query($names:[String!]){ issueLabels(filter:{ name:{ in:$names } }){ nodes{ id name } } }`,
      { names },
    );
    return data.issueLabels.nodes.map((n) => n.id);
  }

  /** Match a status name to a team state; fall back to the terminal category keyword's `type`. */
  private pickState(states: LinearState[], status: string): LinearState | undefined {
    const want = status.trim().toLowerCase();

    // 1. exact workflow-state name (case-insensitive) — the common path.
    const byName = states.find((s) => s.name.toLowerCase() === want);
    if (byName) return byName;

    // 2. terminal category keyword → Linear state `type` (no hardcoded "Done" string).
    const DONE = new Set(['done', 'complete', 'completed', 'resolved', 'closed']);
    const CANCELED = new Set(['canceled', 'cancelled', 'wontfix', 'no action']);
    const type = DONE.has(want) ? 'completed' : CANCELED.has(want) ? 'canceled' : undefined;
    if (!type) return undefined;

    return states
      .filter((s) => s.type === type)
      .sort((a, b) => a.position - b.position)[0];
  }

  // ---- IssuesProvider surface ----------------------------------------------

  async create(params: {
    project: string;
    summary: string;
    description?: string;
    issueType?: string;
    labels?: string[];
  }): Promise<{ key: string; url: string }> {
    // `project` is the Linear TEAM key. Linear has no issue types, so issueType folds into a label.
    const teamId = await this.resolveTeamId(params.project.toUpperCase());
    const labelNames = [...(params.labels ?? []), ...(params.issueType ? [params.issueType] : [])];
    const labelIds = await this.resolveLabelIds(labelNames);

    const input: Record<string, unknown> = { teamId, title: params.summary };
    if (params.description) input.description = params.description;
    if (labelIds.length > 0) input.labelIds = labelIds;

    const data = await this.graphql<{
      issueCreate: { success: boolean; issue?: { identifier: string; url: string } };
    }>(
      `mutation($input:IssueCreateInput!){ issueCreate(input:$input){ success issue{ identifier url } } }`,
      { input },
    );
    const issue = data.issueCreate.issue;
    if (!data.issueCreate.success || !issue) throw new Error('Linear issueCreate failed.');
    return { key: issue.identifier, url: issue.url };
  }

  async get(params: { issueKey: string; fields?: string }): Promise<string> {
    // `fields` is a Jira-ism (REST field selection); Linear's GraphQL projection is fixed here.
    const { teamKey, number } = parseIssueKey(params.issueKey);
    const data = await this.graphql<{
      issues: {
        nodes: Array<{
          identifier: string;
          title?: string;
          url: string;
          state?: { name?: string; type?: string };
          assignee?: { name?: string };
          team?: { key?: string };
          labels?: { nodes: Array<{ name: string }> };
          description?: string;
        }>;
      };
    }>(
      `query($filter:IssueFilter!){ issues(filter:$filter, first:1){ nodes{ identifier title url state{ name type } assignee{ name } team{ key } labels{ nodes{ name } } description } } }`,
      { filter: { team: { key: { eq: teamKey } }, number: { eq: number } } },
    );
    const issue = data.issues.nodes[0];
    if (!issue) throw new Error(`Linear issue "${params.issueKey}" not found.`);

    const labels = issue.labels?.nodes.map((l) => l.name) ?? [];
    let md = `## ${issue.identifier}: ${issue.title ?? 'Untitled'}\n\n`;
    md += `| Field | Value |\n|-------|-------|\n`;
    md += `| Team | ${issue.team?.key ?? '-'} |\n`;
    md += `| Status | ${issue.state?.name ?? '-'} |\n`;
    md += `| Assignee | ${issue.assignee?.name ?? 'Unassigned'} |\n`;
    if (labels.length > 0) md += `| Labels | ${labels.join(', ')} |\n`;
    md += `| URL | ${issue.url} |\n`;

    if (issue.description) {
      md += `\n### Description\n\n${issue.description}\n`;
    }
    return md;
  }

  async search(params: {
    query: string;
    maxResults?: number;
    fields?: string;
  }): Promise<string> {
    // Linear has no JQL — this is full-text `issueSearch`. JQL strings will not work (see target doc).
    const maxResults = params.maxResults ?? 20;
    const data = await this.graphql<{
      issueSearch: {
        nodes: Array<{
          identifier: string;
          title?: string;
          state?: { name?: string };
          assignee?: { name?: string };
          team?: { key?: string };
        }>;
      };
    }>(
      `query($q:String!,$n:Int){ issueSearch(query:$q, first:$n){ nodes{ identifier title state{ name } assignee{ name } team{ key } } } }`,
      { q: params.query, n: maxResults },
    );

    const nodes = data.issueSearch.nodes;
    let md = `**${nodes.length} results**\n\n`;
    md += `| Key | Summary | Status | Assignee | Team |\n`;
    md += `|-----|---------|--------|----------|------|\n`;
    for (const n of nodes) {
      md += `| ${n.identifier} | ${n.title ?? '-'} | ${n.state?.name ?? '-'} | ${n.assignee?.name ?? '-'} | ${n.team?.key ?? '-'} |\n`;
    }
    return md;
  }

  async attach(params: {
    issueKey: string;
    attachments: Attachment[];
  }): Promise<AttachmentResult[]> {
    let issueId: string;
    try {
      issueId = (await this.resolveIssue(params.issueKey)).id;
    } catch (err) {
      // Key resolution failed → every file fails with the same reason (mirror Jira's per-file shape).
      return params.attachments.map((f) => ({
        name: f.filename,
        success: false,
        error: (err as Error).message,
      }));
    }

    const results: AttachmentResult[] = [];
    for (const file of params.attachments) {
      try {
        const base64 = file.data.replace(/^data:[^;]+;base64,/, '');
        const bytes = Buffer.from(base64, 'base64');
        const contentType = file.contentType ?? 'application/octet-stream';

        // Step 1 — request a signed upload URL (Linear's two-step upload, vs Jira's single multipart).
        const up = await this.graphql<{
          fileUpload: {
            success: boolean;
            uploadFile?: {
              uploadUrl: string;
              assetUrl: string;
              headers: Array<{ key: string; value: string }>;
            };
          };
        }>(
          `mutation($ct:String!,$fn:String!,$sz:Int!){ fileUpload(contentType:$ct, filename:$fn, size:$sz){ success uploadFile{ uploadUrl assetUrl headers{ key value } } } }`,
          { ct: contentType, fn: file.filename, sz: bytes.length },
        );
        const uf = up.fileUpload?.uploadFile;
        if (!up.fileUpload?.success || !uf) throw new Error('fileUpload did not return an upload URL');

        // Step 2 — PUT the bytes to storage with the returned headers.
        const putHeaders: Record<string, string> = { 'Content-Type': contentType };
        for (const h of uf.headers ?? []) putHeaders[h.key] = h.value;
        const put = await fetch(uf.uploadUrl, { method: 'PUT', headers: putHeaders, body: bytes });
        if (!put.ok) throw new Error(`upload PUT failed: ${put.status}`);

        // Step 3 — link the uploaded asset to the issue.
        await this.graphql<{ attachmentCreate: { success: boolean } }>(
          `mutation($input:AttachmentCreateInput!){ attachmentCreate(input:$input){ success } }`,
          { input: { issueId, url: uf.assetUrl, title: file.filename } },
        );
        results.push({ name: file.filename, success: true });
      } catch (err) {
        results.push({ name: file.filename, success: false, error: (err as Error).message });
      }
    }
    return results;
  }

  async transition(params: { issueKey: string; status: string }): Promise<void> {
    const issue = await this.resolveIssue(params.issueKey);
    const states = await this.teamStates(issue.teamId);

    const target = this.pickState(states, params.status);
    if (!target) {
      const available = states.map((s) => s.name).join(', ');
      throw new Error(
        `No Linear workflow state matching "${params.status}" in team ${issue.teamKey}. Available: ${available}`,
      );
    }
    if (target.id === issue.stateId) return; // idempotent — already in the target state

    await this.graphql<{ issueUpdate: { success: boolean } }>(
      `mutation($id:String!,$input:IssueUpdateInput!){ issueUpdate(id:$id, input:$input){ success } }`,
      { id: issue.id, input: { stateId: target.id } },
    );
  }

  async comment(params: { issueKey: string; body: string }): Promise<{ commentId: string }> {
    const issue = await this.resolveIssue(params.issueKey);
    const data = await this.graphql<{
      commentCreate: { success: boolean; comment?: { id: string } };
    }>(
      `mutation($input:CommentCreateInput!){ commentCreate(input:$input){ success comment{ id } } }`,
      { input: { issueId: issue.id, body: params.body } },
    );
    const comment = data.commentCreate.comment;
    if (!data.commentCreate.success || !comment) throw new Error('Linear commentCreate failed.');
    return { commentId: comment.id };
  }
}
