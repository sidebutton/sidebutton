// ============================================================================
// Re-export shared types from @sidebutton/core
// ============================================================================

export type {
  // Category types
  CategoryLevel,
  CategoryDomain,
  Category,
  // Embed types
  EmbedPosition,
  MatchCriteria,
  ParentFilter,
  ExtractConfig,
  EmbedConfig,
  // Workflow types
  ParamType,
  Policies,
  Step,
  Workflow,
  // Event types
  WorkflowEvent,
  WorkflowEventMessage,
  RunLogStatus,
  ExecutionStatus,
  // Run log types
  RunLogMetadata,
  RunLog,
  // Settings types
  DashboardShortcut,
  UserContext,
  LlmProvider,
  LlmConfig,
  FullLlmConfig,
  Settings,
  // Recording types
  RecordingMetadata,
  RecordingStatus,
  RecordedEvent,
  Recording,
  // Running workflow tracking
  RunningWorkflowInfo,
  WorkflowStats,
  // API types
  HealthResponse,
  WorkflowSummary,
} from '@sidebutton/core';

// ============================================================================
// Dashboard-specific types (UI display info, view state, etc.)
// ============================================================================

import { categoryColors } from './theme';

// Category display info (for UI rendering)
export const CATEGORY_LEVELS: Record<import('@sidebutton/core').CategoryLevel, {
  label: string;
  badge: string;
  color: string;
  bgColor: string;
  description: string;
}> = {
  primitive: {
    label: 'Primitive',
    badge: 'Primitive',
    ...categoryColors.primitive,
    description: 'Single action, no dependencies'
  },
  task: {
    label: 'Task',
    badge: 'Task',
    ...categoryColors.task,
    description: 'Simple multi-step sequence'
  },
  process: {
    label: 'Process',
    badge: 'Process',
    ...categoryColors.process,
    description: 'Has extraction, LLM, or retry logic'
  },
  workflow: {
    label: 'Workflow',
    badge: 'Workflow',
    ...categoryColors.workflow,
    description: 'Multi-system or calls other workflows'
  },
  pipeline: {
    label: 'Pipeline',
    badge: 'Pipeline',
    ...categoryColors.pipeline,
    description: 'End-to-end orchestration'
  }
};

export const CATEGORY_DOMAINS: Record<import('@sidebutton/core').CategoryDomain, {
  label: string;
  icon: string;
  description: string;
}> = {
  engineering: { label: 'Engineering', icon: '</>', description: 'Software development, DevOps, releases' },
  sales: { label: 'Sales', icon: '$', description: 'Lead gen, outreach, CRM updates' },
  support: { label: 'Support', icon: '?', description: 'Customer service, ticket handling' },
  marketing: { label: 'Marketing', icon: '#', description: 'Content, campaigns, analytics' },
  finance: { label: 'Finance', icon: '%', description: 'Invoicing, expenses, reporting' },
  hr: { label: 'HR', icon: '@', description: 'Recruiting, onboarding' },
  ops: { label: 'Operations', icon: '*', description: 'General business ops, admin' },
  research: { label: 'Research', icon: '~', description: 'Data gathering, analysis' },
  personal: { label: 'Personal', icon: '^', description: 'Individual productivity' }
};

// LLM Provider presets (for settings UI)
export const LLM_PROVIDER_PRESETS: Record<import('@sidebutton/core').LlmProvider, {
  label: string;
  base_url: string;
  default_model: string;
  hint: string;
}> = {
  openai: {
    label: "OpenAI",
    base_url: "https://api.openai.com/v1",
    default_model: "gpt-5.2",
    hint: "Get API key from platform.openai.com"
  },
  anthropic: {
    label: "Anthropic",
    base_url: "https://api.anthropic.com",
    default_model: "claude-sonnet-4-20250514",
    hint: "Get API key from console.anthropic.com"
  },
  ollama: {
    label: "Ollama (Local)",
    base_url: "http://localhost:11434/v1",
    default_model: "llama3.2",
    hint: "Run 'ollama serve' to start local inference"
  }
};

export const DEFAULT_LLM_CONFIG: import('@sidebutton/core').FullLlmConfig = {
  provider: "openai",
  base_url: "https://api.openai.com/v1",
  api_key: "",
  model: "gpt-5.2"
};

// Action type alias for dashboard (uses Workflow from core)
export type Action = import('@sidebutton/core').Workflow;

// User context type guards
export function isLlmContext(ctx: import('@sidebutton/core').UserContext): ctx is Extract<import('@sidebutton/core').UserContext, { type: 'llm' }> {
  return ctx.type === 'llm';
}

export function isEnvContext(ctx: import('@sidebutton/core').UserContext): ctx is Extract<import('@sidebutton/core').UserContext, { type: 'env' }> {
  return ctx.type === 'env';
}

// Log entry for the execution log display
export interface LogEntry {
  timestamp: string;
  message: string;
  type: string;
  depth?: number;
}

// Application views
export type ViewType = "dashboard" | "actions" | "workflows" | "recordings" | "run-logs" | "action-detail" | "workflow-detail" | "execution" | "recording-detail" | "run-log-detail" | "settings";

// Active page for drawer navigation
export type PageType = "dashboard" | "actions" | "workflows" | "recordings" | "run-logs";

// View state for navigation
export interface ViewState {
  current: ViewType;
  activePage: PageType;
  selectedActionId: string | null;
  selectedWorkflowId: string | null;
  selectedRecordingId: string | null;
  selectedRunLogId: string | null;
}

// Running workflow (dashboard-specific, uses run_id not runId)
export interface RunningWorkflow {
  run_id: string;
  workflow_id: string;
  workflow_title: string;
  started_at: string;
  params: Record<string, string>;
}

// Browser connection status
export interface McpStatus {
  server_running: boolean;
  browser_connected: boolean;
  tab_id?: number;
  error: string | null;
}
