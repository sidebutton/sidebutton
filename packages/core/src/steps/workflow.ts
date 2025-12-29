/**
 * Workflow.call step executor
 * Implements: workflow.call
 */

import type { Step, Workflow } from '../types.js';
import type { ExecutionContext } from '../context.js';
import { WorkflowError } from '../types.js';
import { MAX_WORKFLOW_DEPTH } from '../context.js';

type WorkflowCall = Extract<Step, { type: 'workflow.call' }>;

// Forward declaration - will be set by executor to avoid circular import
let executeWorkflowImpl: (workflow: Workflow, ctx: ExecutionContext) => Promise<void>;

export function setExecuteWorkflowImpl(fn: typeof executeWorkflowImpl): void {
  executeWorkflowImpl = fn;
}

export async function executeWorkflowCall(
  step: WorkflowCall,
  ctx: ExecutionContext
): Promise<void> {
  const namespace = step.as ?? step.workflow;

  // 1. Check recursion depth
  if (ctx.currentDepth >= MAX_WORKFLOW_DEPTH) {
    const callPath = ctx.callStack.join(' → ');
    throw new WorkflowError(
      `Max recursion depth (${MAX_WORKFLOW_DEPTH}) exceeded. Call stack: ${callPath}`,
      'MAX_DEPTH_EXCEEDED'
    );
  }

  // 2. Check for circular calls
  if (ctx.callStack.includes(step.workflow)) {
    const callPath = `${ctx.callStack.join(' → ')} → ${step.workflow}`;
    throw new WorkflowError(
      `Circular workflow call detected: ${callPath}`,
      'CIRCULAR_CALL'
    );
  }

  ctx.emitLog('info', `Calling workflow: ${step.workflow} (as: ${namespace})`);

  // 3. Find the child workflow
  let childWorkflow = ctx.actionsRegistry.find((a) => a.id === step.workflow);
  if (!childWorkflow) {
    childWorkflow = ctx.workflowsRegistry.find((w) => w.id === step.workflow);
  }

  if (!childWorkflow) {
    throw new WorkflowError(
      `Workflow not found: ${step.workflow}`,
      'WORKFLOW_NOT_FOUND'
    );
  }

  // 4. Create child context with interpolated params
  const childCtx = ctx.createChildContext();
  childCtx.callStack.push(step.workflow);

  // Interpolate and add params
  if (step.params) {
    for (const [key, value] of Object.entries(step.params)) {
      childCtx.params[key] = ctx.interpolate(value);
    }
  }

  // 5. Execute child workflow
  try {
    await executeWorkflowImpl(childWorkflow, childCtx);
  } catch (error) {
    if (error instanceof WorkflowError && error.code === 'STOPPED') {
      // control.stop is a successful completion
    } else {
      throw new WorkflowError(
        `Nested workflow '${step.workflow}' failed: ${error}`,
        'NESTED_ERROR'
      );
    }
  }

  // 6. Merge child variables with namespacing
  for (const [varName, varValue] of Object.entries(childCtx.variables)) {
    const namespacedKey = `${namespace}.${varName}`;
    ctx.emitLog('info', `Variable: ${namespacedKey} = ${varValue}`);
    ctx.variables[namespacedKey] = varValue;
  }

  // Merge events
  ctx.mergeChildEvents(childCtx);

  ctx.emitLog('info', `Completed workflow: ${step.workflow}`);
}
