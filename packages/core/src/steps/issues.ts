/**
 * Abstract issues.* step executors.
 * Delegates to the concrete IssuesProvider detected from ctx.envVars.
 */

import type { Step } from '../types.js';
import type { ExecutionContext } from '../context.js';
import { WorkflowError } from '../types.js';
import { getIssuesProvider } from '../providers/registry.js';

type IssuesCreate = Extract<Step, { type: 'issues.create' }>;
type IssuesGet = Extract<Step, { type: 'issues.get' }>;
type IssuesSearch = Extract<Step, { type: 'issues.search' }>;
type IssuesAttach = Extract<Step, { type: 'issues.attach' }>;
type IssuesTransition = Extract<Step, { type: 'issues.transition' }>;
type IssuesComment = Extract<Step, { type: 'issues.comment' }>;

export async function executeIssuesCreate(
  step: IssuesCreate,
  ctx: ExecutionContext,
): Promise<void> {
  const project = ctx.interpolate(step.project);
  const summary = ctx.interpolate(step.summary);
  const description = step.description ? ctx.interpolate(step.description) : undefined;
  const issueType = step.issue_type ? ctx.interpolate(step.issue_type) : undefined;
  const labels = step.labels?.map((l) => ctx.interpolate(l));

  ctx.emitLog('info', `issues.create: ${project} — "${summary}"`);

  try {
    const provider = getIssuesProvider(ctx.envVars, step.provider, step.site);
    const result = await provider.create({ project, summary, description, issueType, labels });

    ctx.emitLog('info', `Created issue ${result.key} → ${result.url}`);
    ctx.lastStepResult = result.key;
    if (step.as) {
      ctx.variables[step.as] = result.key;
    }
  } catch (err) {
    throw new WorkflowError(
      `issues.create failed: ${(err as Error).message}`,
      'PROVIDER_ERROR',
    );
  }
}

export async function executeIssuesGet(
  step: IssuesGet,
  ctx: ExecutionContext,
): Promise<void> {
  const issueKey = ctx.interpolate(step.issue_key);
  const fields = step.fields ? ctx.interpolate(step.fields) : undefined;

  ctx.emitLog('info', `issues.get: ${issueKey}`);

  try {
    const provider = getIssuesProvider(ctx.envVars, step.provider, step.site);
    const result = await provider.get({ issueKey, fields });

    ctx.lastStepResult = result;
    if (step.as) {
      ctx.variables[step.as] = result;
    }
  } catch (err) {
    throw new WorkflowError(
      `issues.get failed: ${(err as Error).message}`,
      'PROVIDER_ERROR',
    );
  }
}

export async function executeIssuesSearch(
  step: IssuesSearch,
  ctx: ExecutionContext,
): Promise<void> {
  const query = ctx.interpolate(step.query);
  const maxResults = step.max_results;
  const fields = step.fields ? ctx.interpolate(step.fields) : undefined;

  ctx.emitLog('info', `issues.search: ${query}`);

  try {
    const provider = getIssuesProvider(ctx.envVars, step.provider, step.site);
    const result = await provider.search({ query, maxResults, fields });

    ctx.lastStepResult = result;
    if (step.as) {
      ctx.variables[step.as] = result;
    }
  } catch (err) {
    throw new WorkflowError(
      `issues.search failed: ${(err as Error).message}`,
      'PROVIDER_ERROR',
    );
  }
}

export async function executeIssuesAttach(
  step: IssuesAttach,
  ctx: ExecutionContext,
): Promise<void> {
  const issueKey = ctx.interpolate(step.issue_key);
  const attachments = step.files.map((f) => ({
    filename: ctx.interpolate(f.filename),
    data: ctx.interpolate(f.data),
    contentType: f.content_type ? ctx.interpolate(f.content_type) : undefined,
  }));

  ctx.emitLog('info', `issues.attach: ${issueKey} (${attachments.length} file${attachments.length === 1 ? '' : 's'})`);

  try {
    const provider = getIssuesProvider(ctx.envVars, step.provider, step.site);
    const results = await provider.attach({ issueKey, attachments });

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success);
    const summary = `Attached ${succeeded}/${results.length} files to ${issueKey}`;

    if (failed.length > 0) {
      ctx.emitLog('warn', `${summary}. Failures: ${failed.map((f) => `${f.name}: ${f.error}`).join('; ')}`);
    } else {
      ctx.emitLog('info', summary);
    }

    ctx.lastStepResult = summary;
    if (step.as) {
      ctx.variables[step.as] = summary;
    }
  } catch (err) {
    throw new WorkflowError(
      `issues.attach failed: ${(err as Error).message}`,
      'PROVIDER_ERROR',
    );
  }
}

export async function executeIssuesTransition(
  step: IssuesTransition,
  ctx: ExecutionContext,
): Promise<void> {
  const issueKey = ctx.interpolate(step.issue_key);
  const status = ctx.interpolate(step.status);

  ctx.emitLog('info', `issues.transition: ${issueKey} → "${status}"`);

  try {
    const provider = getIssuesProvider(ctx.envVars, step.provider, step.site);
    await provider.transition({ issueKey, status });

    const result = `Transitioned ${issueKey} to "${status}"`;
    ctx.emitLog('info', result);
    ctx.lastStepResult = result;
    if (step.as) {
      ctx.variables[step.as] = result;
    }
  } catch (err) {
    throw new WorkflowError(
      `issues.transition failed: ${(err as Error).message}`,
      'PROVIDER_ERROR',
    );
  }
}

export async function executeIssuesComment(
  step: IssuesComment,
  ctx: ExecutionContext,
): Promise<void> {
  const issueKey = ctx.interpolate(step.issue_key);
  const body = ctx.interpolate(step.body);

  ctx.emitLog('info', `issues.comment: ${issueKey}`);

  try {
    const provider = getIssuesProvider(ctx.envVars, step.provider, step.site);
    const result = await provider.comment({ issueKey, body });

    ctx.emitLog('info', `Added comment ${result.commentId} to ${issueKey}`);
    ctx.lastStepResult = result.commentId;
    if (step.as) {
      ctx.variables[step.as] = result.commentId;
    }
  } catch (err) {
    throw new WorkflowError(
      `issues.comment failed: ${(err as Error).message}`,
      'PROVIDER_ERROR',
    );
  }
}
