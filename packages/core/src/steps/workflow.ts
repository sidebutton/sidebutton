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
  // Interpolate the workflow ID so dynamic dispatch works (e.g. workflow: "{{action}}")
  const workflowId = ctx.interpolate(step.workflow);
  const namespace = step.as ?? workflowId;

  // 1. Check recursion depth
  if (ctx.currentDepth >= MAX_WORKFLOW_DEPTH) {
    const callPath = ctx.callStack.join(' → ');
    throw new WorkflowError(
      `Max recursion depth (${MAX_WORKFLOW_DEPTH}) exceeded. Call stack: ${callPath}`,
      'MAX_DEPTH_EXCEEDED'
    );
  }

  // 2. Check for circular calls
  if (ctx.callStack.includes(workflowId)) {
    const callPath = `${ctx.callStack.join(' → ')} → ${workflowId}`;
    throw new WorkflowError(
      `Circular workflow call detected: ${callPath}`,
      'CIRCULAR_CALL'
    );
  }

  ctx.emitLog('info', `Calling workflow: ${workflowId} (as: ${namespace})`);

  // 3. Find the child workflow
  let childWorkflow = ctx.actionsRegistry.find((a) => a.id === workflowId);
  if (!childWorkflow) {
    childWorkflow = ctx.workflowsRegistry.find((w) => w.id === workflowId);
  }

  if (!childWorkflow) {
    throw new WorkflowError(
      `Workflow not found: ${workflowId}`,
      'WORKFLOW_NOT_FOUND'
    );
  }

  // 4. Create child context with interpolated params
  const childCtx = ctx.createChildContext();
  childCtx.callStack.push(workflowId);

  // Interpolate and add params
  if (step.params) {
    for (const [key, value] of Object.entries(step.params)) {
      childCtx.params[key] = ctx.interpolate(value);
    }
  }

  // 5. Execute child workflow (with optional timeout)
  const execution = executeWorkflowImpl(childWorkflow, childCtx);

  try {
    if (step.timeout && step.timeout > 0) {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => {
          childCtx.cancel();
          reject(new WorkflowError(
            `Workflow '${workflowId}' timed out after ${step.timeout}ms`,
            'NESTED_ERROR'
          ));
        }, step.timeout)
      );
      await Promise.race([execution, timeoutPromise]);
    } else {
      await execution;
    }
  } catch (error) {
    if (error instanceof WorkflowError && error.code === 'STOPPED') {
      // control.stop is a successful completion
    } else {
      throw new WorkflowError(
        `Nested workflow '${workflowId}' failed: ${error}`,
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

  ctx.emitLog('info', `Completed workflow: ${workflowId}`);
}
