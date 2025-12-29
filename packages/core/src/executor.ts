/**
 * Workflow executor
 */

import type { Step, Workflow, WorkflowEvent } from './types.js';
import { WorkflowError } from './types.js';
import { ExecutionContext, MAX_RETRIES, BASE_RETRY_DELAY_MS } from './context.js';
import {
  executeStep,
  hasBrowserSteps,
  hasOwnRetryLogic,
  setExecuteStepsImpl,
  setExecuteWorkflowImpl,
} from './steps/index.js';

/**
 * Execute a list of steps
 */
async function executeSteps(steps: Step[], ctx: ExecutionContext): Promise<void> {
  for (let index = 0; index < steps.length; index++) {
    // Check for cancellation before each step
    if (ctx.isCancelled()) {
      ctx.emitLog('warn', 'Workflow cancelled by user');
      throw new WorkflowError('Workflow cancelled by user', 'CANCELLED');
    }

    const step = steps[index];
    const stepType = step.type;
    const stepDetails = getStepDetails(step, ctx);
    const depth = ctx.currentDepth;

    ctx.emitEvent({
      type: 'step_start',
      step_index: index,
      step_type: stepType,
      step_details: stepDetails,
      depth,
    });

    // Clear last result before step
    ctx.lastStepResult = undefined;

    // Execute step with automatic retry
    let success = true;
    let message: string | undefined;

    try {
      await executeStepWithRetry(step, ctx, index);
    } catch (error) {
      if (error instanceof WorkflowError && error.code === 'STOPPED') {
        // control.stop is a successful completion
        success = true;
        message = error.message;
      } else {
        success = false;
        message = error instanceof Error ? error.message : String(error);
      }
    }

    const stepResult = ctx.lastStepResult;

    ctx.emitEvent({
      type: 'step_end',
      step_index: index,
      success,
      message,
      result: stepResult,
      depth,
    });

    if (!success) {
      throw new WorkflowError(message ?? 'Step failed', 'SHELL_ERROR');
    }

    // Check for stop
    if (message && success) {
      // This was a control.stop
      throw new WorkflowError(message, 'STOPPED');
    }
  }
}

/**
 * Execute a step with automatic retry on failure
 */
async function executeStepWithRetry(
  step: Step,
  ctx: ExecutionContext,
  stepIndex: number
): Promise<void> {
  // Don't auto-retry steps that have their own retry/control logic
  if (hasOwnRetryLogic(step)) {
    return executeStep(step, ctx);
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Check for cancellation before each retry attempt
    if (ctx.isCancelled()) {
      throw new WorkflowError('Workflow cancelled by user', 'CANCELLED');
    }

    try {
      await executeStep(step, ctx);
      return; // Success
    } catch (error) {
      if (error instanceof WorkflowError) {
        // Don't retry these error types - they are configuration/setup issues
        if (
          error.code === 'STOPPED' ||
          error.code === 'CANCELLED' ||
          error.code === 'NOT_IMPLEMENTED' ||
          error.code === 'NESTED_ERROR' ||
          error.code === 'LLM_ERROR' || // API key missing or provider misconfigured
          error.code === 'EXTENSION_ERROR' || // Browser extension not connected
          error.code === 'TERMINAL_ERROR' // Terminal not available
        ) {
          throw error;
        }
      }

      lastError = error as Error;

      if (attempt < MAX_RETRIES) {
        // Calculate delay: base * (attempt + 1) -> 500ms, 1000ms, 1500ms
        const delayMs = BASE_RETRY_DELAY_MS * (attempt + 1);
        ctx.emitLog(
          'warn',
          `Step ${stepIndex + 1} failed, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError ?? new WorkflowError('Retry exhausted', 'RETRY_EXHAUSTED');
}

/**
 * Execute a workflow
 */
async function executeWorkflow(
  workflow: Workflow,
  ctx: ExecutionContext
): Promise<void> {
  // Check for cancellation before starting
  if (ctx.isCancelled()) {
    throw new WorkflowError('Workflow cancelled by user', 'CANCELLED');
  }

  // Include run_id only for top-level workflow (depth 0)
  const runIdForEvent = ctx.currentDepth === 0 ? ctx.runId : undefined;

  ctx.emitEvent({
    type: 'workflow_start',
    action_id: workflow.id,
    action_title: workflow.title,
    depth: ctx.currentDepth,
    run_id: runIdForEvent,
  });

  // Focus browser tab before executing if workflow has browser steps (only at top level)
  if (ctx.currentDepth === 0 && hasBrowserSteps(workflow.steps) && ctx.extensionClient) {
    try {
      await ctx.extensionClient.focus();
    } catch (e) {
      console.warn('Failed to focus browser tab:', e);
      // Continue anyway - the tab might already be focused
    }
  }

  let success = true;
  let message: string | undefined;

  try {
    await executeSteps(workflow.steps, ctx);
  } catch (error) {
    if (error instanceof WorkflowError) {
      if (error.code === 'STOPPED') {
        // control.stop is a successful completion
        success = true;
        message = error.message;
        ctx.outputMessage = error.message;
      } else if (error.code === 'CANCELLED') {
        success = false;
        message = 'Cancelled by user';
      } else {
        success = false;
        message = error.message;
      }
    } else {
      success = false;
      message = error instanceof Error ? error.message : String(error);
    }
  }

  ctx.emitEvent({
    type: 'workflow_end',
    action_id: workflow.id,
    success,
    message,
    depth: ctx.currentDepth,
  });

  if (!success) {
    throw new WorkflowError(message ?? 'Workflow failed', 'SHELL_ERROR');
  }
}

// Set up circular dependency resolution
setExecuteStepsImpl(executeSteps);
setExecuteWorkflowImpl(executeWorkflow);

/**
 * Get step details for display (params, variable names, etc.)
 */
function getStepDetails(step: Step, ctx: ExecutionContext): string | undefined {
  switch (step.type) {
    case 'workflow.call': {
      const params = step.params
        ? Object.entries(step.params)
            .map(([k, v]) => `${k}=${ctx.interpolate(v)}`)
            .join(', ')
        : '';
      return params ? `${step.workflow} (${params})` : step.workflow;
    }
    case 'browser.extract':
      return `${step.selector} → $${step.as}`;
    case 'browser.extractAll':
      return `${step.selector} → $${step.as} (all)`;
    case 'browser.navigate':
      return ctx.interpolate(step.url);
    case 'browser.click':
      return ctx.interpolate(step.selector);
    case 'browser.type':
      return `${ctx.interpolate(step.selector)} ← "${ctx.interpolate(step.text)}"`;
    case 'browser.wait':
      if (step.selector) return ctx.interpolate(step.selector);
      if (step.ms) return `${step.ms}ms`;
      return undefined;
    case 'browser.exists':
      return `${ctx.interpolate(step.selector)} → $${step.as}`;
    case 'browser.hover':
      return ctx.interpolate(step.selector);
    case 'browser.key': {
      const key = ctx.interpolate(step.key);
      if (step.selector) return `'${key}' on ${ctx.interpolate(step.selector)}`;
      return `'${key}'`;
    }
    case 'shell.run': {
      const cmd = ctx.interpolate(step.cmd);
      if (step.as) return `${cmd} → $${step.as}`;
      return cmd;
    }
    case 'terminal.run':
      return ctx.interpolate(step.cmd);
    case 'llm.generate':
      return `→ $${step.as}`;
    case 'data.first':
      return `${ctx.interpolate(step.input)} → $${step.as}`;
    case 'variable.set':
      return `$${step.name} = ${ctx.interpolate(step.value).substring(0, 50)}`;
    default:
      return undefined;
  }
}

export { executeWorkflow, executeSteps, ExecutionContext };
