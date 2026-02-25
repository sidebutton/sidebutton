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
  executeBrowserExtractMap,
  executeBrowserWait,
  executeBrowserExists,
  executeBrowserHover,
  executeBrowserKey,
  executeBrowserSnapshot,
  executeBrowserInjectCSS,
  executeBrowserInjectJS,
  executeBrowserSelectOption,
  executeBrowserScrollIntoView,
  executeBrowserFill,
} from './browser.js';

import {
  executeShellRun,
  executeTerminalOpen,
  executeTerminalRun,
} from './shell.js';

import {
  executeLlmClassify,
  executeLlmGenerate,
  executeLlmDecide,
} from './llm.js';

import {
  executeControlIf,
  executeControlRetry,
  executeControlForeach,
  executeControlStop,
  setExecuteStepsImpl,
} from './control.js';

import {
  executeWorkflowCall,
  setExecuteWorkflowImpl,
} from './workflow.js';

import { executeDataFirst, executeDataGet, executeVariableSet } from './data.js';

import {
  executeIssuesCreate,
  executeIssuesGet,
  executeIssuesSearch,
  executeIssuesAttach,
  executeIssuesTransition,
  executeIssuesComment,
} from './issues.js';

import {
  executeGitListPRs,
  executeGitGetPR,
  executeGitCreatePR,
  executeGitListIssues,
  executeGitGetIssue,
} from './git.js';

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
    case 'browser.extractMap':
      return executeBrowserExtractMap(step, ctx);
    case 'browser.wait':
      return executeBrowserWait(step, ctx);
    case 'browser.exists':
      return executeBrowserExists(step, ctx);
    case 'browser.hover':
      return executeBrowserHover(step, ctx);
    case 'browser.key':
      return executeBrowserKey(step, ctx);
    case 'browser.snapshot':
      return executeBrowserSnapshot(step, ctx);
    case 'browser.injectCSS':
      return executeBrowserInjectCSS(step, ctx);
    case 'browser.injectJS':
      return executeBrowserInjectJS(step, ctx);
    case 'browser.select_option':
      return executeBrowserSelectOption(step, ctx);
    case 'browser.scrollIntoView':
      return executeBrowserScrollIntoView(step, ctx);
    case 'browser.fill':
      return executeBrowserFill(step, ctx);
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
    case 'llm.decide':
      return executeLlmDecide(step, ctx);
    case 'control.if':
      return executeControlIf(step, ctx);
    case 'control.retry':
      return executeControlRetry(step, ctx);
    case 'control.foreach':
      return executeControlForeach(step, ctx);
    case 'control.stop':
      return executeControlStop(step, ctx);
    case 'workflow.call':
      return executeWorkflowCall(step, ctx);
    case 'data.first':
      return executeDataFirst(step, ctx);
    case 'data.get':
      return executeDataGet(step, ctx);
    case 'variable.set':
      return executeVariableSet(step, ctx);
    case 'issues.create':
      return executeIssuesCreate(step, ctx);
    case 'issues.get':
      return executeIssuesGet(step, ctx);
    case 'issues.search':
      return executeIssuesSearch(step, ctx);
    case 'issues.attach':
      return executeIssuesAttach(step, ctx);
    case 'issues.transition':
      return executeIssuesTransition(step, ctx);
    case 'issues.comment':
      return executeIssuesComment(step, ctx);
    case 'git.listPRs':
      return executeGitListPRs(step, ctx);
    case 'git.getPR':
      return executeGitGetPR(step, ctx);
    case 'git.createPR':
      return executeGitCreatePR(step, ctx);
    case 'git.listIssues':
      return executeGitListIssues(step, ctx);
    case 'git.getIssue':
      return executeGitGetIssue(step, ctx);
    case 'chat.listChannels':
    case 'chat.readChannel':
    case 'chat.readThread':
      throw new WorkflowError(
        `${step.type} requires a chat provider (Slack). Coming soon.`,
        'NOT_IMPLEMENTED',
      );
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
    if (step.type === 'control.retry' || step.type === 'control.foreach') {
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
    step.type === 'control.foreach' ||
    step.type === 'control.if' ||
    step.type === 'workflow.call'
  );
}

/**
 * Return every step type the engine supports (for dynamic _system.md).
 */
export function getAllStepTypes(): string[] {
  return [
    'browser.navigate', 'browser.click', 'browser.type', 'browser.scroll',
    'browser.extract', 'browser.extractAll', 'browser.extractMap',
    'browser.wait', 'browser.exists', 'browser.hover', 'browser.key',
    'browser.snapshot', 'browser.injectCSS', 'browser.injectJS',
    'browser.select_option', 'browser.scrollIntoView', 'browser.fill',
    'shell.run', 'terminal.open', 'terminal.run',
    'llm.classify', 'llm.generate', 'llm.decide',
    'control.if', 'control.retry', 'control.foreach', 'control.stop',
    'workflow.call',
    'data.first', 'data.get', 'variable.set',
    'issues.create', 'issues.get', 'issues.search', 'issues.attach',
    'issues.transition', 'issues.comment',
    'chat.listChannels', 'chat.readChannel', 'chat.readThread',
    'git.listPRs', 'git.getPR', 'git.createPR', 'git.listIssues', 'git.getIssue',
  ];
}

// Export setter functions for circular dependency resolution
export { setExecuteStepsImpl, setExecuteWorkflowImpl };
