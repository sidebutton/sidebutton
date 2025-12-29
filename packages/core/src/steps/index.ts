/**
 * Step executor registry
 * Delegates step execution to the appropriate handler
 */

import type { Step } from '../types.js';
import type { ExecutionContext } from '../context.js';
import { WorkflowError } from '../types.js';

import {
  executeBrowserNavigate,
  executeBrowserClick,
  executeBrowserType,
  executeBrowserScroll,
  executeBrowserExtract,
  executeBrowserExtractAll,
  executeBrowserWait,
  executeBrowserExists,
  executeBrowserHover,
  executeBrowserKey,
} from './browser.js';

import {
  executeShellRun,
  executeTerminalOpen,
  executeTerminalRun,
} from './shell.js';

import {
  executeLlmClassify,
  executeLlmGenerate,
} from './llm.js';

import {
  executeControlIf,
  executeControlRetry,
  executeControlStop,
  setExecuteStepsImpl,
} from './control.js';

import {
  executeWorkflowCall,
  setExecuteWorkflowImpl,
} from './workflow.js';

import { executeDataFirst, executeVariableSet } from './data.js';

/**
 * Execute a single step
 */
export async function executeStep(
  step: Step,
  ctx: ExecutionContext
): Promise<void> {
  switch (step.type) {
    case 'browser.navigate':
      return executeBrowserNavigate(step, ctx);
    case 'browser.click':
      return executeBrowserClick(step, ctx);
    case 'browser.type':
      return executeBrowserType(step, ctx);
    case 'browser.scroll':
      return executeBrowserScroll(step, ctx);
    case 'browser.extract':
      return executeBrowserExtract(step, ctx);
    case 'browser.extractAll':
      return executeBrowserExtractAll(step, ctx);
    case 'browser.wait':
      return executeBrowserWait(step, ctx);
    case 'browser.exists':
      return executeBrowserExists(step, ctx);
    case 'browser.hover':
      return executeBrowserHover(step, ctx);
    case 'browser.key':
      return executeBrowserKey(step, ctx);
    case 'shell.run':
      return executeShellRun(step, ctx);
    case 'terminal.open':
      return executeTerminalOpen(step, ctx);
    case 'terminal.run':
      return executeTerminalRun(step, ctx);
    case 'llm.classify':
      return executeLlmClassify(step, ctx);
    case 'llm.generate':
      return executeLlmGenerate(step, ctx);
    case 'control.if':
      return executeControlIf(step, ctx);
    case 'control.retry':
      return executeControlRetry(step, ctx);
    case 'control.stop':
      return executeControlStop(step, ctx);
    case 'workflow.call':
      return executeWorkflowCall(step, ctx);
    case 'data.first':
      return executeDataFirst(step, ctx);
    case 'variable.set':
      return executeVariableSet(step, ctx);
    default:
      throw new WorkflowError(
        `Unknown step type: ${(step as { type: string }).type}`,
        'NOT_IMPLEMENTED'
      );
  }
}

/**
 * Check if a step has browser steps (for focus handling)
 */
export function hasBrowserSteps(steps: Step[]): boolean {
  for (const step of steps) {
    if (step.type.startsWith('browser.')) {
      return true;
    }
    if (step.type === 'control.if') {
      if (hasBrowserSteps(step.then)) return true;
      if (step.else_steps && hasBrowserSteps(step.else_steps)) return true;
    }
    if (step.type === 'control.retry') {
      if (hasBrowserSteps(step.steps)) return true;
    }
  }
  return false;
}

/**
 * Check if a step has its own retry logic (shouldn't be auto-retried)
 */
export function hasOwnRetryLogic(step: Step): boolean {
  return (
    step.type === 'control.retry' ||
    step.type === 'control.if' ||
    step.type === 'workflow.call'
  );
}

// Export setter functions for circular dependency resolution
export { setExecuteStepsImpl, setExecuteWorkflowImpl };
