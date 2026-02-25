/**
 * Abstract git.* step executors.
 * Delegates to the concrete GitProvider detected from the registry.
 */

import type { Step } from '../types.js';
import type { ExecutionContext } from '../context.js';
import { WorkflowError } from '../types.js';
import { getGitProvider } from '../providers/registry.js';

type GitListPRs = Extract<Step, { type: 'git.listPRs' }>;
type GitGetPR = Extract<Step, { type: 'git.getPR' }>;
type GitCreatePR = Extract<Step, { type: 'git.createPR' }>;
type GitListIssues = Extract<Step, { type: 'git.listIssues' }>;
type GitGetIssue = Extract<Step, { type: 'git.getIssue' }>;

export async function executeGitListPRs(
  step: GitListPRs,
  ctx: ExecutionContext,
): Promise<void> {
  const repo = step.repo ? ctx.interpolate(step.repo) : undefined;
  const state = step.state ? ctx.interpolate(step.state) : undefined;

  ctx.emitLog('info', `git.listPRs${repo ? `: ${repo}` : ''}`);

  try {
    const provider = getGitProvider(step.provider);
    const result = await provider.listPullRequests({ repo, state, limit: step.limit });

    ctx.lastStepResult = result;
    if (step.as) {
      ctx.variables[step.as] = result;
    }
  } catch (err) {
    throw new WorkflowError(
      `git.listPRs failed: ${(err as Error).message}`,
      'PROVIDER_ERROR',
    );
  }
}

export async function executeGitGetPR(
  step: GitGetPR,
  ctx: ExecutionContext,
): Promise<void> {
  const repo = step.repo ? ctx.interpolate(step.repo) : undefined;

  ctx.emitLog('info', `git.getPR: #${step.number}`);

  try {
    const provider = getGitProvider(step.provider);
    const result = await provider.getPullRequest({ repo, number: step.number });

    ctx.lastStepResult = result;
    if (step.as) {
      ctx.variables[step.as] = result;
    }
  } catch (err) {
    throw new WorkflowError(
      `git.getPR failed: ${(err as Error).message}`,
      'PROVIDER_ERROR',
    );
  }
}

export async function executeGitCreatePR(
  step: GitCreatePR,
  ctx: ExecutionContext,
): Promise<void> {
  const repo = step.repo ? ctx.interpolate(step.repo) : undefined;
  const title = ctx.interpolate(step.title);
  const body = step.body ? ctx.interpolate(step.body) : undefined;
  const head = ctx.interpolate(step.head);
  const base = step.base ? ctx.interpolate(step.base) : undefined;

  ctx.emitLog('info', `git.createPR: "${title}" (${head})`);

  try {
    const provider = getGitProvider(step.provider);
    const result = await provider.createPullRequest({ repo, title, body, head, base });

    ctx.emitLog('info', `Created PR #${result.number} → ${result.url}`);
    ctx.lastStepResult = result.url;
    if (step.as) {
      ctx.variables[step.as] = result.url;
    }
  } catch (err) {
    throw new WorkflowError(
      `git.createPR failed: ${(err as Error).message}`,
      'PROVIDER_ERROR',
    );
  }
}

export async function executeGitListIssues(
  step: GitListIssues,
  ctx: ExecutionContext,
): Promise<void> {
  const repo = step.repo ? ctx.interpolate(step.repo) : undefined;
  const state = step.state ? ctx.interpolate(step.state) : undefined;
  const labels = step.labels ? ctx.interpolate(step.labels) : undefined;

  ctx.emitLog('info', `git.listIssues${repo ? `: ${repo}` : ''}`);

  try {
    const provider = getGitProvider(step.provider);
    const result = await provider.listIssues({ repo, state, labels, limit: step.limit });

    ctx.lastStepResult = result;
    if (step.as) {
      ctx.variables[step.as] = result;
    }
  } catch (err) {
    throw new WorkflowError(
      `git.listIssues failed: ${(err as Error).message}`,
      'PROVIDER_ERROR',
    );
  }
}

export async function executeGitGetIssue(
  step: GitGetIssue,
  ctx: ExecutionContext,
): Promise<void> {
  const repo = step.repo ? ctx.interpolate(step.repo) : undefined;

  ctx.emitLog('info', `git.getIssue: #${step.number}`);

  try {
    const provider = getGitProvider(step.provider);
    const result = await provider.getIssue({ repo, number: step.number });

    ctx.lastStepResult = result;
    if (step.as) {
      ctx.variables[step.as] = result;
    }
  } catch (err) {
    throw new WorkflowError(
      `git.getIssue failed: ${(err as Error).message}`,
      'PROVIDER_ERROR',
    );
  }
}
