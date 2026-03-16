/**
 * Core types for SideButton workflow engine
 */

import type { DelayValue } from './delay.js';

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
  selector?: string;
  position?: EmbedPosition;
  when?: string;
  label?: string;
  parent_filter?: ParentFilter;
  extract?: Record<string, ExtractConfig>;
  param_map?: Record<string, string>;
  prompt?: {
    param: string;
    placeholder?: string;
    title?: string;
  };
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
  | { type: 'browser.extract'; selector: string; as: string; attribute?: string }
  | { type: 'browser.extractAll'; selector: string; as: string; separator?: string; attribute?: string }
  | { type: 'browser.extractMap'; selector: string; fields: Record<string, { selector: string; attribute?: string }>; as: string; separator?: string }
  | { type: 'browser.wait'; selector?: string; ms?: DelayValue; timeout?: number }
  | { type: 'browser.exists'; selector: string; as: string; timeout?: number }
  | { type: 'browser.hover'; selector: string }
  | { type: 'browser.key'; key: string; selector?: string }
  | { type: 'browser.snapshot'; as: string; includeContent?: boolean }
  | { type: 'shell.run'; cmd: string; cwd?: string; as?: string }
  | { type: 'llm.classify'; input: string; categories: string[]; as: string }
  | { type: 'llm.generate'; prompt: string; as: string }
  | { type: 'llm.decide'; input: string; actions: Array<{ id: string; description: string }>; as: string }
  | { type: 'control.if'; condition: string; then: Step[]; else_steps?: Step[] }
  | { type: 'control.retry'; max_attempts?: number; delay_ms?: DelayValue; steps: Step[] }
  | { type: 'control.foreach'; items: string; as: string; separator?: string; index_as?: string; steps: Step[]; max_items?: number; delay_ms?: DelayValue; continue_on_error?: boolean }
  | { type: 'control.stop'; message?: string }
  | { type: 'workflow.call'; workflow: string; params?: Record<string, string>; as?: string; timeout?: number }
  | { type: 'terminal.open'; title?: string; cwd?: string }
  | { type: 'terminal.run'; cmd: string }
  | { type: 'data.first'; input: string; as: string; separator?: string }
  | { type: 'data.get'; input: string; separator?: string; index: string; as: string }
  | { type: 'browser.injectCSS'; css: string; id?: string }
  | { type: 'browser.injectJS'; js: string; id?: string; as?: string }
  | { type: 'browser.select_option'; selector: string; value?: string; label?: string }
  | { type: 'browser.scrollIntoView'; selector: string; block?: 'start' | 'center' | 'end' | 'nearest' }
  | { type: 'browser.fill'; selector: string; value: string }
  | { type: 'variable.set'; name: string; value: string }
  // Abstract platform step types — provider auto-detected from envVars
  | { type: 'issues.create'; project: string; summary: string; description?: string; issue_type?: string; labels?: string[]; provider?: string; site?: string; as?: string }
  | { type: 'issues.get'; issue_key: string; fields?: string; provider?: string; site?: string; as?: string }
  | { type: 'issues.search'; query: string; max_results?: number; fields?: string; provider?: string; site?: string; as?: string }
  | { type: 'issues.attach'; issue_key: string; files: Array<{ filename: string; data: string; content_type?: string }>; provider?: string; site?: string; as?: string }
  | { type: 'issues.transition'; issue_key: string; status: string; provider?: string; site?: string; as?: string }
  | { type: 'issues.comment'; issue_key: string; body: string; provider?: string; site?: string; as?: string }
  | { type: 'chat.listChannels'; types?: string; limit?: number; provider?: string; as?: string }
  | { type: 'chat.readChannel'; channel: string; limit?: number; max_days?: number; provider?: string; as?: string }
  | { type: 'chat.readThread'; channel: string; thread_ts: string; max_days?: number; provider?: string; as?: string }
  // Abstract git step types — provider auto-detected from active connector
  | { type: 'git.listPRs'; repo?: string; state?: string; limit?: number; provider?: string; as?: string }
  | { type: 'git.getPR'; repo?: string; number: number; provider?: string; as?: string }
  | { type: 'git.createPR'; repo?: string; title: string; body?: string; head: string; base?: string; provider?: string; as?: string }
  | { type: 'git.listIssues'; repo?: string; state?: string; labels?: string; limit?: number; provider?: string; as?: string }
  | { type: 'git.getIssue'; repo?: string; number: number; provider?: string; as?: string };

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
  is_agent?: boolean;
  agent_role?: string;
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
// Context System (persona, roles, targets)
// ============================================================================

// Role context - matched by @category tags
export interface RoleContext {
  filename: string;
  name: string;
  match: string[];
  enabled?: boolean;
  body: string;
}

// Target context - matched by domain/glob patterns
export interface TargetContext {
  filename: string;
  name: string;
  match: string[];
  enabled?: boolean;
  provider?: string;
  body: string;
}

// Persona context - single global identity
export interface PersonaContext {
  body: string;
}

// Full context configuration
export interface ContextConfig {
  persona: PersonaContext;
  roles: RoleContext[];
  targets: TargetContext[];
}

// ============================================================================
// Provider System (Jira, Slack, GitHub, Bitbucket)
// ============================================================================

export type ProviderType = 'issues' | 'chat' | 'git';

export type ConnectorType = 'api' | 'cli' | 'browser';

export interface ConnectorDefinition {
  id: ConnectorType;
  name: string;
  featureLevel: 'full' | 'standard' | 'basic';
  requiredEnvVars: string[];
  optionalEnvVars: string[];
  detectCommand?: string;
  stepTypes: string[];
  setupInstructions: string;
  usageFile: string;
}

export interface ConnectorStatus {
  id: ConnectorType;
  available: boolean;
  active: boolean;
  error?: string;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  type: ProviderType | ProviderType[];
  connectors: ConnectorDefinition[];
}

export interface ProviderStatus extends ProviderDefinition {
  connected: boolean;
  activeConnector?: ConnectorType;
  connectorStatuses: ConnectorStatus[];
  error?: string;
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

// External MCP transport configuration
export type ExternalMcpTransport =
  | { type: 'claude-code' }
  | { type: 'http'; endpoint: string }
  | { type: 'sse'; endpoint: string };

// External MCP tool-specific configuration
export interface ExternalMcpToolConfig {
  createIssue?: {
    cloudId: string;
    defaultProject: string;
    defaultIssueType: string;
  };
}

// External MCP server configuration
export interface ExternalMcpConfig {
  id: string;
  name: string;
  displayName: string;
  enabled: boolean;
  transport: ExternalMcpTransport;
  tools: ExternalMcpToolConfig;
}

// Reporting configuration for anonymous run reports
export interface ReportingConfig {
  report_url?: string;
}

// Skill pack registry configuration
export interface SkillRegistry {
  name: string;
  type: 'local' | 'git';
  url: string;
  enabled: boolean;
}

// Application settings
export interface Settings {
  llm: FullLlmConfig;
  last_used_params: Record<string, Record<string, unknown>>;
  dashboard_shortcuts: DashboardShortcut[];
  user_contexts: UserContext[];
  /** Maps "org/repo" to local filesystem path */
  repos?: Record<string, string>;
  /** External MCP server configurations */
  external_mcps?: ExternalMcpConfig[];
  /** Anonymous run reporting configuration */
  reporting?: ReportingConfig;
  /** Active connector per provider: e.g. { "jira": "api", "github": "cli" } */
  provider_connectors?: Record<string, ConnectorType>;
  /** Configured skill pack registries (local dirs or git repos) */
  skill_registries?: SkillRegistry[];
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
  job?: {
    job_id: number;
    step_index: number;
    workflow_id: string;
    ticket_key?: string;
    started_at: string;
  } | null;
  idle_since?: string | null;
  result?: { type: string; at: string } | null;
  last_tool_use?: string | null;
  workflows_running?: number;
}

// Workflow summary for listing
export interface WorkflowSummary {
  id: string;
  title: string;
  description?: string;
  params: Record<string, string>;
  source: 'actions' | 'workflows';
}

// ============================================================================
// Skill Pack System
// ============================================================================

// Manifest from skill-pack.json in each pack
export interface SkillPackManifest {
  name: string;
  version: string;
  title: string;
  description: string;
  domain: string;
  tagline?: string;
  category?: string;
  modules?: string[];
  requires?: { browser?: boolean; llm?: boolean };
  private?: boolean;
  roles?: string[];
}

// Record of an installed skill pack
export interface InstalledPack {
  name: string;
  version: string;
  domain: string;
  title: string;
  installedAt: string;
  source: string;
  registry?: string;
}

// Full detail view of an installed skill pack
export interface SkillPackDetail {
  pack: InstalledPack;
  roles: RoleContext[];
  targets: TargetContext[];
  workflowCount: number;
}

// Aggregated context info for dashboard overview
export interface ContextSummary {
  persona: { name: string; preview: string } | null;
  activeRoles: number;
  totalRoles: number;
  matchedTargets: number;
  totalTargets: number;
  installedPacks: number;
}

// Origin of a context item (user-created or from a skill pack)
export interface ContextSource {
  type: 'user' | 'skill';
  domain?: string;
}

// ============================================================================
// Skill Module System
// ============================================================================

// A module within a skill pack (subdirectory with _skill.md)
export interface SkillModule {
  name: string;
  displayName: string;
  path: string;
  workflowCount: number;
  workflows: { id: string; title: string }[];
  hasSkillDoc: boolean;
  hasRoles: string[];
}

// ============================================================================
// Agent System
// ============================================================================

export interface AgentMetrics {
  action_count: number;
  token_count: number;
  cost_estimate?: number;
}

export type AgentStatus = 'running' | 'completed' | 'failed';

export interface AgentJob {
  run_id: string;
  workflow_id: string;
  workflow_title: string;
  role: string;
  started_at: string;
  status: AgentStatus;
  duration_ms?: number;
  initial_prompt: string;
  metrics: AgentMetrics;
  current_task?: string;
  result_summary?: string;
  pid?: number;
}

// ============================================================================
// Publisher / Registry System
// ============================================================================

export interface Publisher {
  name: string;
  type: 'local' | 'git';
  url: string;
  enabled: boolean;
  packCount?: number;
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
      | 'PROVIDER_ERROR'
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}
