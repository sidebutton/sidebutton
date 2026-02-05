/**
 * Control flow step executors
 * Implements: control.if, control.retry, control.stop
 */

import type { Step } from '../types.js';
import type { ExecutionContext } from '../context.js';
import { WorkflowError } from '../types.js';
import { evaluateCondition } from '../interpolate.js';
import { resolveDelay } from '../delay.js';

type ControlIf = Extract<Step, { type: 'control.if' }>;
type ControlRetry = Extract<Step, { type: 'control.retry' }>;
type ControlForeach = Extract<Step, { type: 'control.foreach' }>;
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
  const delayMs = resolveDelay(step.delay_ms ?? 1000);

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

export async function executeControlForeach(
  step: ControlForeach,
  ctx: ExecutionContext
): Promise<void> {
  const raw = ctx.interpolate(step.items);
  const separator = step.separator ?? ',';
  const maxItems = step.max_items ?? 1000;
  const delayMs = resolveDelay(step.delay_ms ?? 0);

  const items = raw.split(separator).map((s) => s.trim()).filter((s) => s.length > 0);
  const count = Math.min(items.length, maxItems);

  ctx.emitLog('info', `Foreach: ${count} items (separator: '${separator}')`);

  for (let i = 0; i < count; i++) {
    if (ctx.isCancelled()) {
      throw new WorkflowError('Workflow cancelled by user', 'CANCELLED');
    }

    ctx.variables[step.as] = items[i];
    if (step.index_as) {
      ctx.variables[step.index_as] = String(i);
    }

    ctx.emitLog('info', `Foreach [${i + 1}/${count}]: ${step.as} = ${items[i].substring(0, 80)}`);

    if (step.continue_on_error) {
      try {
        await executeStepsImpl(step.steps, ctx);
      } catch (error) {
        if (error instanceof WorkflowError && error.code === 'CANCELLED') {
          throw error; // Never swallow cancellation
        }
        const msg = error instanceof Error ? error.message : String(error);
        ctx.emitLog('warn', `Foreach [${i + 1}/${count}] failed, skipping: ${msg}`);
      }
    } else {
      await executeStepsImpl(step.steps, ctx);
    }

    if (delayMs > 0 && i < count - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
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
