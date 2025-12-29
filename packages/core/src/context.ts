/**
 * Execution context for workflow execution
 */

import type { Workflow, WorkflowEvent, LlmConfig } from './types.js';
import { interpolate as interpolateText } from './interpolate.js';

// Maximum depth for nested workflow calls (prevents infinite recursion)
export const MAX_WORKFLOW_DEPTH = 10;

// Retry configuration
export const MAX_RETRIES = 3;
export const BASE_RETRY_DELAY_MS = 500;

/**
 * Interface for browser extension client
 * Implemented by the server package
 */
export interface ExtensionClient {
  isConnected(): Promise<boolean>;
  navigate(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  typeText(selector: string, text: string, submit: boolean): Promise<void>;
  scroll(direction: string, amount: number): Promise<void>;
  extract(selector: string): Promise<string>;
  extractAll(selector: string, separator: string): Promise<string>;
  waitForElement(selector: string, timeout: number): Promise<void>;
  exists(selector: string, timeout: number): Promise<boolean>;
  hover(selector: string): Promise<void>;
  pressKey(key: string, selector?: string): Promise<void>;
  focus(): Promise<void>;
}

/**
 * Execution context for a workflow run
 */
export class ExecutionContext {
  // Variables set during execution
  variables: Record<string, string> = {};

  // Parameters passed to workflow
  params: Record<string, string> = {};

  // Extension client for browser automation
  extensionClient: ExtensionClient | null = null;

  // Workflow registries for workflow.call
  actionsRegistry: Workflow[] = [];
  workflowsRegistry: Workflow[] = [];

  // Current nesting depth (0 = top-level workflow)
  currentDepth = 0;

  // Stack of workflow IDs being executed (for circular call detection)
  callStack: string[] = [];

  // Whether a terminal session is active for this workflow
  terminalActive = false;

  // Last step result (for display in logs)
  lastStepResult?: string;

  // Captured events for run log persistence
  capturedEvents: WorkflowEvent[] = [];

  // Cancellation flag
  cancelled = false;

  // Unique run ID for this execution
  runId: string;

  // User contexts that match this workflow (injected into LLM prompts)
  userContexts: string[] = [];

  // LLM configuration
  llmConfig: LlmConfig = { provider: 'openai' };

  // Repo path mappings (org/repo -> local path)
  repos: Record<string, string> = {};

  // Output message from workflow (set by control.stop)
  outputMessage?: string;

  // Event emitter callback
  private eventCallback?: (event: WorkflowEvent) => void;

  constructor(runId: string) {
    this.runId = runId;
  }

  /**
   * Set the event callback
   */
  onEvent(callback: (event: WorkflowEvent) => void): void {
    this.eventCallback = callback;
  }

  /**
   * Check if cancellation has been requested
   */
  isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Request cancellation
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Create a child context for nested workflow execution
   */
  createChildContext(): ExecutionContext {
    const child = new ExecutionContext(this.runId);

    // Copy env.* params to child (these are global settings)
    for (const [key, value] of Object.entries(this.params)) {
      if (key.startsWith('env.')) {
        child.params[key] = value;
      }
    }

    child.extensionClient = this.extensionClient;
    child.actionsRegistry = this.actionsRegistry;
    child.workflowsRegistry = this.workflowsRegistry;
    child.currentDepth = this.currentDepth + 1;
    child.callStack = [...this.callStack];
    child.terminalActive = this.terminalActive;
    child.cancelled = this.cancelled;
    child.userContexts = [...this.userContexts];
    child.llmConfig = { ...this.llmConfig };
    child.eventCallback = this.eventCallback;

    return child;
  }

  /**
   * Emit a workflow event
   */
  emitEvent(event: WorkflowEvent): void {
    this.capturedEvents.push(event);
    this.eventCallback?.(event);
  }

  /**
   * Merge child context events into parent
   */
  mergeChildEvents(child: ExecutionContext): void {
    this.capturedEvents.push(...child.capturedEvents);
  }

  /**
   * Emit a log event with current depth
   */
  emitLog(level: string, message: string): void {
    this.emitEvent({
      type: 'log',
      level,
      message,
      depth: this.currentDepth,
    });
  }

  /**
   * Interpolate variables in a string ({{var_name}} syntax)
   * Special syntax:
   * - {{_repo:org/repo}} - looks up repo path from settings
   */
  interpolate(text: string): string {
    // First pass: replace regular variables and params
    let result = interpolateText(text, this.variables, this.params);

    // Second pass: handle special _repo:org/repo syntax
    const repoPattern = /\{\{_repo:([^}]+)\}\}/g;
    result = result.replace(repoPattern, (_match, repoKey: string) => {
      const path = this.repos[repoKey.trim()];
      if (path) {
        return path;
      }
      // Fallback to home directory if repo not configured
      return '~';
    });

    return result;
  }
}
