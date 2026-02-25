/**
 * Provider barrel exports
 */

export type { IssuesProvider, ChatProvider, GitProvider, Attachment, AttachmentResult } from './types.js';
export { JiraProvider, getJiraAuth } from './jira.js';
export { AcliJiraProvider } from './jira-acli.js';
export { GhCliProvider } from './github.js';
export {
  getIssuesProvider,
  getChatProvider,
  getGitProvider,
  PROVIDER_DEFINITIONS,
  getProviderStatuses,
  getActiveUsageFile,
  detectCli,
} from './registry.js';
export type { ProviderStatusOptions } from './registry.js';
