/**
 * Abstract provider interfaces for platform integrations.
 * Workflows use these abstractions; concrete providers (Jira, Slack, etc.) implement them.
 */

export interface Attachment {
  filename: string;
  /** Base64-encoded file data (with or without data-URL prefix) */
  data: string;
  contentType?: string;
}

export interface AttachmentResult {
  name: string;
  success: boolean;
  error?: string;
}

export interface IssuesProvider {
  create(params: {
    project: string;
    summary: string;
    description?: string;
    issueType?: string;
    labels?: string[];
  }): Promise<{ key: string; url: string }>;

  get(params: {
    issueKey: string;
    fields?: string;
  }): Promise<string>;

  search(params: {
    query: string;
    maxResults?: number;
    fields?: string;
  }): Promise<string>;

  attach(params: {
    issueKey: string;
    attachments: Attachment[];
  }): Promise<AttachmentResult[]>;

  transition(params: {
    issueKey: string;
    status: string;
  }): Promise<void>;

  comment(params: {
    issueKey: string;
    body: string;
  }): Promise<{ commentId: string }>;
}

export interface GitProvider {
  listPullRequests(params: {
    repo?: string;
    state?: string;
    limit?: number;
  }): Promise<string>;

  getPullRequest(params: {
    repo?: string;
    number: number;
  }): Promise<string>;

  createPullRequest(params: {
    repo?: string;
    title: string;
    body?: string;
    head: string;
    base?: string;
  }): Promise<{ number: number; url: string }>;

  listIssues(params: {
    repo?: string;
    state?: string;
    labels?: string;
    limit?: number;
  }): Promise<string>;

  getIssue(params: {
    repo?: string;
    number: number;
  }): Promise<string>;
}

export interface ChatProvider {
  listChannels(params: {
    types?: string;
    limit?: number;
  }): Promise<string>;

  readChannel(params: {
    channel: string;
    limit?: number;
    maxDays?: number;
  }): Promise<string>;

  readThread(params: {
    channel: string;
    threadTs: string;
    maxDays?: number;
  }): Promise<string>;
}
