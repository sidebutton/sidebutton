/**
 * Executor error-code propagation tests (SCRUM-1188).
 *
 * Regression guard for the bug where `executeSteps` / `executeWorkflow` re-wrapped
 * every failure as `SHELL_ERROR`, so the granular `WorkflowError` codes never
 * reached callers (the server + dashboard run-log UI had to parse `err.message`).
 *
 * These tests assert that:
 *  - the originating `WorkflowError.code` now survives to the caller, and
 *  - a genuinely-unknown (non-`WorkflowError`) failure still surfaces as `SHELL_ERROR`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { executeWorkflow, ExecutionContext } from './executor.js';
import { WorkflowError } from './types.js';
import type { Step, Workflow } from './types.js';

function wf(steps: Step[]): Workflow {
  return { id: 'test-wf', title: 'Test Workflow', steps };
}

/** Execute a workflow and return the thrown error, or `null` if it resolved. */
async function runAndCatch(
  steps: Step[],
  setup?: (ctx: ExecutionContext) => void
): Promise<unknown> {
  const ctx = new ExecutionContext('run-1');
  setup?.(ctx);
  try {
    await executeWorkflow(wf(steps), ctx);
    return null;
  } catch (err) {
    return err;
  }
}

const codeOf = (err: unknown): string | undefined =>
  err instanceof WorkflowError ? err.code : undefined;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('executeWorkflow error-code propagation (SCRUM-1188)', () => {
  it('surfaces EXTENSION_ERROR when a browser step runs with no extension client', async () => {
    const err = await runAndCatch([{ type: 'browser.navigate', url: 'https://example.com' }]);
    expect(err).toBeInstanceOf(WorkflowError);
    expect(codeOf(err)).toBe('EXTENSION_ERROR');
  });

  it('surfaces LLM_ERROR when the LLM API key is missing', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const err = await runAndCatch(
      [{ type: 'llm.generate', prompt: 'hello', as: 'out' }],
      (ctx) => {
        ctx.llmConfig = { provider: 'openai', api_key: '' };
      }
    );
    expect(codeOf(err)).toBe('LLM_ERROR');
  });

  it('surfaces WORKFLOW_NOT_FOUND for a workflow.call to an unknown id', async () => {
    const err = await runAndCatch([{ type: 'workflow.call', workflow: 'no-such-workflow' }]);
    expect(codeOf(err)).toBe('WORKFLOW_NOT_FOUND');
  });

  it('surfaces CIRCULAR_CALL when a workflow.call re-enters the call stack', async () => {
    const err = await runAndCatch(
      [{ type: 'workflow.call', workflow: 'loop' }],
      (ctx) => {
        ctx.callStack = ['loop'];
      }
    );
    expect(codeOf(err)).toBe('CIRCULAR_CALL');
  });

  it('surfaces CANCELLED for a mid-run cancel (the headline regression)', async () => {
    // Cancel between step 0 and step 1 — exactly what the server does when a
    // user stops a running workflow. Pre-run cancel already surfaced CANCELLED;
    // the bug was that a *mid-run* cancel flattened to SHELL_ERROR.
    const err = await runAndCatch(
      [
        { type: 'variable.set', name: 'x', value: '1' },
        { type: 'variable.set', name: 'y', value: '2' },
      ],
      (ctx) => {
        ctx.onEvent((e) => {
          if (e.type === 'step_end' && e.step_index === 0) ctx.cancel();
        });
      }
    );
    expect(codeOf(err)).toBe('CANCELLED');
    // The message still contains "cancelled" so the server's message-based
    // run-status classification keeps working after the fix.
    expect((err as Error).message.toLowerCase()).toContain('cancelled');
  });

  it('treats control.stop as a successful completion, not an error', async () => {
    const ctx = new ExecutionContext('run-1');
    await expect(
      executeWorkflow(wf([{ type: 'control.stop', message: 'all done' }]), ctx)
    ).resolves.toBeUndefined();
    expect(ctx.outputMessage).toBe('all done');
  });

  it('wraps a genuinely-unknown (non-WorkflowError) failure as SHELL_ERROR', async () => {
    const err = await runAndCatch(
      [{ type: 'variable.set', name: 'x', value: 'v' }],
      (ctx) => {
        // Simulate an unexpected internal failure that is NOT a WorkflowError;
        // callers should still receive a WorkflowError they can catch.
        ctx.interpolate = () => {
          throw new Error('boom: not a WorkflowError');
        };
      }
    );
    expect(err).toBeInstanceOf(WorkflowError);
    expect(codeOf(err)).toBe('SHELL_ERROR');
    expect((err as Error).message).toContain('boom');
  });
});
