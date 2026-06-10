import { describe, it, expect } from 'vitest';
import { injectClaudeCliFlags } from './shell.js';

const SID = '0c4f9a2e-7b1d-4e3a-9f08-2d5c6b7a8e90';

describe('injectClaudeCliFlags', () => {
  it('injects --session-id into a plain claude launch', () => {
    const cmd = injectClaudeCliFlags('claude --dangerously-skip-permissions "do the thing"', { sessionId: SID });
    expect(cmd).toBe(`claude --session-id ${SID} --dangerously-skip-permissions "do the thing"`);
  });

  it('injects at the claude invocation of a compound source-then-claude command', () => {
    const cmd = injectClaudeCliFlags('source ~/.agent-env && claude "prompt"', { sessionId: SID });
    expect(cmd).toBe(`source ~/.agent-env && claude --session-id ${SID} "prompt"`);
  });

  it('stacks effort, model, and session-id on the first occurrence only', () => {
    const cmd = injectClaudeCliFlags('claude "tell me about claude usage"', {
      effortLevel: 'max',
      modelOverride: 'opus',
      sessionId: SID,
    });
    expect(cmd).toBe(`claude --session-id ${SID} --model opus --effort max "tell me about claude usage"`);
  });

  it('skips effort injection at the default medium level', () => {
    const cmd = injectClaudeCliFlags('claude "hi"', { effortLevel: 'medium', sessionId: SID });
    expect(cmd).toBe(`claude --session-id ${SID} "hi"`);
  });

  it('rejects a non-UUID session id (shell-safety guard)', () => {
    const cmd = injectClaudeCliFlags('claude "hi"', { sessionId: 'not-a-uuid"$(boom)' });
    expect(cmd).toBe('claude "hi"');
  });

  it('leaves non-claude commands untouched', () => {
    expect(injectClaudeCliFlags('htop', { sessionId: SID })).toBe('htop');
  });
});
