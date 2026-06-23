import { describe, it, expect } from 'vitest';
import { injectClaudeCliFlags, tmuxJobSessionName, buildTerminalLaunch } from './shell.js';

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

describe('tmuxJobSessionName', () => {
  it('keys the session on the pre-assigned --session-id UUID', () => {
    expect(tmuxJobSessionName(SID, 1234)).toBe(`sbjob-${SID}`);
  });

  it('falls back to the timestamp suffix when no session id is set', () => {
    expect(tmuxJobSessionName(undefined, 1234)).toBe('sbjob-1234');
  });

  it('rejects a non-UUID session id and uses the fallback (shell/tmux-safety)', () => {
    expect(tmuxJobSessionName('not-a-uuid"; rm -rf /', 1234)).toBe('sbjob-1234');
  });
});

describe('buildTerminalLaunch', () => {
  const scriptPath = '/tmp/sb-terminal-1234.sh';
  const sessionName = `sbjob-${SID}`;

  it('GUI path runs the script under tmux via xfce4-terminal (-x, attach-or-create)', () => {
    const launch = buildTerminalLaunch({ hasX: true, sessionName, scriptPath, title: 'Job 42' });
    expect(launch.sessionName).toBe(sessionName);
    expect(launch.file).toBe('xfce4-terminal');
    expect(launch.args).toEqual([
      '--disable-server', '--title=Job 42', '-x',
      'tmux', 'new-session', '-A', '-s', sessionName, scriptPath,
    ]);
  });

  it('GUI path omits --title when none is given', () => {
    const launch = buildTerminalLaunch({ hasX: true, sessionName, scriptPath });
    expect(launch.args).not.toContain('--title=');
    expect(launch.args).toEqual([
      '--disable-server', '-x',
      'tmux', 'new-session', '-A', '-s', sessionName, scriptPath,
    ]);
  });

  it('headless path creates a detached tmux session directly', () => {
    const launch = buildTerminalLaunch({ hasX: false, sessionName, scriptPath, title: 'ignored' });
    expect(launch.file).toBe('tmux');
    expect(launch.args).toEqual(['new-session', '-d', '-s', sessionName, scriptPath]);
  });

  it('spawns argv directly (no shell) — title is never interpolated into a shell string', () => {
    const launch = buildTerminalLaunch({ hasX: true, sessionName, scriptPath, title: '"$(boom)"' });
    // The dangerous title is a single, inert argv element, not a shell fragment.
    expect(launch.args).toContain('--title="$(boom)"');
    expect(launch.file).toBe('xfce4-terminal');
  });
});
