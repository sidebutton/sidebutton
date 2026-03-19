/**
 * @sidebutton/core
 * Core workflow engine for SideButton
 */

// Types
export type {
  CategoryLevel,
  CategoryDomain,
  Category,
  ParamType,
  Policies,
  EmbedPosition,
  MatchCriteria,
  ParentFilter,
  ExtractConfig,
  EmbedConfig,
  ScrollDirection,
  Step,
  Workflow,
  WorkflowEvent,
  WorkflowEventMessage,
  RunLogStatus,
  ExecutionStatus,
  RunLogMetadata,
  RunLog,
  LlmProvider,
  LlmConfig,
  ExtensionStatus,
  // Context system
  RoleContext,
  TargetContext,
  PersonaContext,
  ContextConfig,
  // Provider system
  ProviderType,
  ConnectorType,
  ConnectorDefinition,
  ConnectorStatus,
  ProviderDefinition,
  ProviderStatus,
  // Settings system
  DashboardShortcut,
  UserContext,
  FullLlmConfig,
  Settings,
  SkillRegistry,
  // Skill pack system
  SkillPackManifest,
  InstalledPack,
  SkillPackDetail,
  ContextSummary,
  ContextSource,
  // External MCP configuration
  ExternalMcpTransport,
  ExternalMcpToolConfig,
  ExternalMcpConfig,
  // Reporting
  ReportingConfig,
  // Recording system
  RecordedEvent,
  Recording,
  RecordingMetadata,
  RecordingStatus,
  // Running workflow tracking
  RunningWorkflowInfo,
  WorkflowStats,
  // API types
  HealthResponse,
  WorkflowSourceType,
  WorkflowSummary,
  // Skill module system
  SkillModule,
  // Agent system
  AgentMetrics,
  AgentStatus,
  AgentJob,
  // Publisher system
  Publisher,
} from './types.js';

export { WorkflowError } from './types.js';

// Parser
export {
  parseWorkflow,
  loadWorkflow,
  loadWorkflowsFromDir,
  getStepTypeName,
  countSteps,
  hasStepType,
  countStepType,
} from './parser.js';

// Interpolation
export {
  interpolate,
  truncateForDisplay,
  evaluateCondition,
} from './interpolate.js';

// Context
export {
  ExecutionContext,
  MAX_WORKFLOW_DEPTH,
  MAX_RETRIES,
  BASE_RETRY_DELAY_MS,
} from './context.js';

export type { ExtensionClient } from './context.js';

// Executor
export { executeWorkflow, executeSteps } from './executor.js';

// Context utilities
export { getContextSource, getSkillDomain } from './context-utils.js';

// Delay
export type { DelayConstant, DelayValue } from './delay.js';
export { resolveDelay, DELAY_BASE } from './delay.js';

// Steps
export { executeStep, hasBrowserSteps, hasOwnRetryLogic, getAllStepTypes } from './steps/index.js';

// Providers
export type { IssuesProvider, ChatProvider, GitProvider, Attachment, AttachmentResult } from './providers/types.js';
export { JiraProvider, getJiraAuth } from './providers/jira.js';
export { AcliJiraProvider } from './providers/jira-acli.js';
export { GhCliProvider } from './providers/github.js';
export {
  getIssuesProvider,
  getChatProvider,
  getGitProvider,
  PROVIDER_DEFINITIONS,
  getProviderStatuses,
  getActiveUsageFile,
  detectCli,
} from './providers/registry.js';
export type { ProviderStatusOptions } from './providers/registry.js';
