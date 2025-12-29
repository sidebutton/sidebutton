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
  // Settings system
  DashboardShortcut,
  UserContext,
  FullLlmConfig,
  Settings,
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
  WorkflowSummary,
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

// Steps
export { executeStep, hasBrowserSteps, hasOwnRetryLogic } from './steps/index.js';
