/**
 * Core types for SideButton workflow engine
 */

// Category level for workflow complexity (atomic design inspired)
export type CategoryLevel = 'primitive' | 'task' | 'process' | 'workflow' | 'pipeline';

// Domain tag for workflow type (job-based)
export type CategoryDomain =
  | 'engineering'
  | 'sales'
  | 'support'
  | 'marketing'
  | 'finance'
  | 'hr'
  | 'ops'
  | 'research'
  | 'personal';

// Category metadata for a workflow
export interface Category {
  level: CategoryLevel;
  domain?: CategoryDomain;
  reusable?: boolean;
}

// Parameter type
export type ParamType = 'string' | 'number' | 'boolean';

// Policies for workflow execution
export interface Policies {
  allowed_domains: string[];
}

// Position for embedded button injection
export type EmbedPosition = 'before' | 'after' | 'prepend' | 'append';

// Match criteria for parent filter
export interface MatchCriteria {
  child_selector?: string;
  attribute: string;
  equals?: string;
  contains?: string;
}

// Parent filter for conditional button injection
export interface ParentFilter {
  selector: string;
  match: MatchCriteria;
}

// Configuration for extracting context on button click
export interface ExtractConfig {
  selector: string;
  attribute?: string;
  pattern?: string;
}

// Configuration for embedding workflow buttons in target websites
export interface EmbedConfig {
  selector: string;
  position?: EmbedPosition;
  when?: string;
  label?: string;
  parent_filter?: ParentFilter;
  extract?: Record<string, ExtractConfig>;
  param_map?: Record<string, string>;
  org?: string;  // Filter by org name (empty = match all orgs)
  repo?: string; // Filter by repo name (empty = match all repos)
}

// Scroll direction
export type ScrollDirection = 'up' | 'down';

// Step types - discriminated union matching Rust Step enum
export type Step =
  | { type: 'browser.navigate'; url: string; new_tab?: boolean }
  | { type: 'browser.click'; selector: string; new_tab?: boolean }
  | { type: 'browser.type'; selector: string; text: string }
  | { type: 'browser.scroll'; direction?: ScrollDirection; amount?: number }
  | { type: 'browser.extract'; selector: string; as: string }
  | { type: 'browser.extractAll'; selector: string; as: string; separator?: string }
  | { type: 'browser.wait'; selector?: string; ms?: number; timeout?: number }
  | { type: 'browser.exists'; selector: string; as: string; timeout?: number }
  | { type: 'browser.hover'; selector: string }
  | { type: 'browser.key'; key: string; selector?: string }
  | { type: 'shell.run'; cmd: string; cwd?: string; as?: string }
  | { type: 'llm.classify'; input: string; categories: string[]; as: string }
  | { type: 'llm.generate'; prompt: string; as: string }
  | { type: 'control.if'; condition: string; then: Step[]; else_steps?: Step[] }
  | { type: 'control.retry'; max_attempts?: number; delay_ms?: number; steps: Step[] }
  | { type: 'control.stop'; message?: string }
  | { type: 'workflow.call'; workflow: string; params?: Record<string, string>; as?: string }
  | { type: 'terminal.open'; title?: string; cwd?: string }
  | { type: 'terminal.run'; cmd: string }
  | { type: 'data.first'; input: string; as: string; separator?: string }
  | { type: 'variable.set'; name: string; value: string };

// Workflow/Action definition
export interface Workflow {
  // Versioning fields
  schema_version?: number;
  namespace?: string;
  version?: string;
  last_verified?: string;
  description?: string;

  // Core fields
  id: string;
  title: string;
  hotkey?: string;
  category?: Category;
  parent_id?: string;
  params?: Record<string, ParamType>;
  policies?: Policies;
  embed?: EmbedConfig;
  steps: Step[];
}

// Workflow event types emitted during execution
export type WorkflowEvent =
  | {
      type: 'workflow_start';
      action_id: string;
      action_title: string;
      depth: number;
      run_id?: string;
    }
  | {
      type: 'workflow_end';
      action_id: string;
      success: boolean;
      message?: string;
      depth: number;
    }
  | {
      type: 'step_start';
      step_index: number;
      step_type: string;
      step_details?: string;
      depth: number;
    }
  | {
      type: 'step_end';
      step_index: number;
      success: boolean;
      message?: string;
      result?: string;
      depth: number;
    }
  | {
      type: 'log';
      level: string;
      message: string;
      depth: number;
    }
  | {
      type: 'error';
      message: string;
      depth: number;
    };

// Flat workflow event interface for serialization/API responses
// Use this when deserializing events or in UI frameworks that need flat objects
export interface WorkflowEventMessage {
  type: string;
  action_id?: string;
  action_title?: string;
  step_index?: number;
  step_type?: string;
  step_details?: string;
  success?: boolean;
  message?: string;
  result?: string;
  level?: string;
  depth?: number;
  run_id?: string;
}

// Run log status
export type RunLogStatus = 'success' | 'failed' | 'cancelled';

// Execution status for UI tracking
export type ExecutionStatus = 'idle' | 'running' | 'success' | 'failed' | 'cancelled';

// Run log metadata
export interface RunLogMetadata {
  id: string;
  workflow_id: string;
  workflow_title: string;
  timestamp: string;
  status: RunLogStatus;
  duration_ms: number;
  event_count: number;
  workflow_version?: string;
  triggered_by?: string;
  target_domain?: string;
  failure_step?: number;
  failure_selector?: string;
}

// Complete run log
export interface RunLog {
  metadata: RunLogMetadata;
  events: WorkflowEvent[];
  params: Record<string, string>;
  output_message?: string;  // Final output from control.stop
}

// LLM provider configuration
export type LlmProvider = 'openai' | 'anthropic' | 'ollama';

export interface LlmConfig {
  provider: LlmProvider;
  model?: string;
  api_key?: string;
  base_url?: string;
}

// Extension status
export interface ExtensionStatus {
  server_running: boolean;
  browser_connected: boolean;
  tab_id?: number;
  recording: boolean;
}

// ============================================================================
// Settings System (port of lib.rs Settings)
// ============================================================================

// Dashboard shortcut for quick workflow execution
export interface DashboardShortcut {
  id: string;
  action_id: string;
  custom_name: string;
  color: string;
  params: Record<string, string>;
  order: number;
}

// User context - supports multiple types for different purposes
export type UserContext =
  | {
      type: 'llm';
      id: string;
      industry?: string;
      domain?: string;
      context: string;
    }
  | {
      type: 'env';
      id: string;
      name: string;
      value: string;
    };

// Full LLM configuration
export interface FullLlmConfig {
  provider: LlmProvider;
  base_url: string;
  api_key: string;
  model: string;
}

// Application settings
export interface Settings {
  llm: FullLlmConfig;
  last_used_params: Record<string, Record<string, unknown>>;
  dashboard_shortcuts: DashboardShortcut[];
  user_contexts: UserContext[];
  /** Maps "org/repo" to local filesystem path */
  repos?: Record<string, string>;
}

// ============================================================================
// Recording System (port of recording.rs)
// ============================================================================

// A recorded browser event from the extension
export interface RecordedEvent {
  event_type: string;
  selector?: string;
  text?: string;
  value?: string;
  url?: string;
  tag?: string;
  direction?: string;
  amount?: number;
  timestamp_ms: number;
}

// A saved recording with metadata
export interface Recording {
  id: string;
  timestamp: string;
  events: RecordedEvent[];
}

// Recording metadata for listing
export interface RecordingMetadata {
  id: string;
  timestamp: string;
  event_count: number;
  path: string;
}

// Recording status
export interface RecordingStatus {
  is_recording: boolean;
  event_count: number;
}

// ============================================================================
// Running Workflow Tracking
// ============================================================================

// Info about a running workflow
export interface RunningWorkflowInfo {
  run_id: string;
  workflow_id: string;
  workflow_title: string;
  started_at: string;
  params: Record<string, string>;
}

// Workflow stats for analytics
export interface WorkflowStats {
  total_runs: number;
  success_count: number;
  failed_count: number;
  cancelled_count: number;
  last_run?: string;
}

// ============================================================================
// API Types
// ============================================================================

// Health check response
export interface HealthResponse {
  status: string;
  version: string;
  desktop_connected: boolean;
  browser_connected: boolean;
}

// Workflow summary for listing
export interface WorkflowSummary {
  id: string;
  title: string;
  description?: string;
  params: Record<string, string>;
  source: 'actions' | 'workflows';
}

// Error types
export class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'EXTENSION_ERROR'
      | 'SHELL_ERROR'
      | 'TERMINAL_ERROR'
      | 'LLM_ERROR'
      | 'NOT_IMPLEMENTED'
      | 'RETRY_EXHAUSTED'
      | 'STOPPED'
      | 'CANCELLED'
      | 'WORKFLOW_NOT_FOUND'
      | 'MAX_DEPTH_EXCEEDED'
      | 'CIRCULAR_CALL'
      | 'NESTED_ERROR'
      | 'PARSE_ERROR'
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}
