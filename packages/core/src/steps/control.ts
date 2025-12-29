/**
 * Control flow step executors
 * Implements: control.if, control.retry, control.stop
 */

import type { Step } from '../types.js';
import type { ExecutionContext } from '../context.js';
import { WorkflowError } from '../types.js';
import { evaluateCondition } from '../interpolate.js';

type ControlIf = Extract<Step, { type: 'control.if' }>;
type ControlRetry = Extract<Step, { type: 'control.retry' }>;
type ControlStop = Extract<Step, { type: 'control.stop' }>;

// Forward declaration - will be set by executor to avoid circular import
let executeStepsImpl: (steps: Step[], ctx: ExecutionContext) => Promise<void>;

export function setExecuteStepsImpl(fn: typeof executeStepsImpl): void {
  executeStepsImpl = fn;
}

export async function executeControlIf(
  step: ControlIf,
  ctx: ExecutionContext
): Promise<void> {
  const condition = ctx.interpolate(step.condition);
  const isTrue = evaluateCondition(condition);

  ctx.emitLog('info', `Condition '${condition}' = ${isTrue}`);

  if (isTrue) {
    await executeStepsImpl(step.then, ctx);
  } else if (step.else_steps) {
    await executeStepsImpl(step.else_steps, ctx);
  }
}

export async function executeControlRetry(
  step: ControlRetry,
  ctx: ExecutionContext
): Promise<void> {
  const maxAttempts = step.max_attempts ?? 3;
  const delayMs = step.delay_ms ?? 1000;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    ctx.emitLog('info', `Retry attempt ${attempt}/${maxAttempts}`);

    try {
      await executeStepsImpl(step.steps, ctx);
      return; // Success
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError ?? new WorkflowError('Retry exhausted', 'RETRY_EXHAUSTED');
}

export async function executeControlStop(
  step: ControlStop,
  ctx: ExecutionContext
): Promise<void> {
  const message = step.message ? ctx.interpolate(step.message) : undefined;
  ctx.emitLog('info', message ?? 'Workflow stopped');

  // Set output message for the workflow
  ctx.outputMessage = message;

  // Throw a special error that signals successful stop
  throw new WorkflowError(message ?? 'Workflow stopped', 'STOPPED');
}
