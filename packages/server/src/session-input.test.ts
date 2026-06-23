import { describe, it, expect } from 'vitest';
import {
  isUuid,
  tmuxSessionName,
  findClaudeSessionPid,
  buildInputCommands,
  type ClaudeSession,
} from './session-input.js';

const SID = '0c4f9a2e-7b1d-4e3a-9f08-2d5c6b7a8e90';

describe('isUuid', () => {
  it('accepts a v4-shaped session UUID', () => {
    expect(isUuid(SID)).toBe(true);
  });

  it('rejects non-UUIDs and non-strings (shell/tmux-target safety)', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('0c4f9a2e-7b1d-4e3a-9f08-2d5c6b7a8e90; rm -rf /')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});

describe('tmuxSessionName', () => {
  it('keys the tmux session as sbjob-<session_id>', () => {
    expect(tmuxSessionName(SID)).toBe(`sbjob-${SID}`);
  });
});

describe('findClaudeSessionPid', () => {
  const sessions: ClaudeSession[] = [
    { pid: 100, cmd: 'claude --session-id 11111111-1111-4111-8111-111111111111 "other job"' },
    { pid: 200, cmd: `claude --dangerously-skip-permissions --session-id ${SID} "the job"` },
    { pid: 300, cmd: 'claude' }, // operator session, no --session-id
  ];

  it('returns the pid of the process whose cmdline carries --session-id <id>', () => {
    expect(findClaudeSessionPid(sessions, SID)).toBe(200);
  });

  it('returns undefined when no live process carries the id (→ 410)', () => {
    expect(findClaudeSessionPid(sessions, '99999999-9999-4999-8999-999999999999')).toBeUndefined();
  });

  it('returns undefined for a non-UUID id without scanning (guard)', () => {
    const evil: ClaudeSession[] = [{ pid: 1, cmd: 'claude --session-id x' }];
    expect(findClaudeSessionPid(evil, 'x')).toBeUndefined();
  });

  it('does not match a different session id that is a substring-adjacent flag', () => {
    expect(findClaudeSessionPid(sessions, '11111111-1111-4111-8111-111111111111')).toBe(100);
  });
});

describe('buildInputCommands', () => {
  const name = `sbjob-${SID}`;
  const buf = 'sb-input-123-456';

  it('loads via stdin then bracketed-pastes; submit adds a discrete Enter', () => {
    expect(buildInputCommands(name, buf, true)).toEqual([
      ['load-buffer', '-b', buf, '-'],
      ['paste-buffer', '-d', '-p', '-b', buf, '-t', name],
      ['send-keys', '-t', name, 'Enter'],
    ]);
  });

  it('omits the Enter when submit is false (text left unsubmitted in the box)', () => {
    const cmds = buildInputCommands(name, buf, false);
    expect(cmds).toHaveLength(2);
    expect(cmds.some((c) => c.includes('send-keys'))).toBe(false);
  });

  it('marks the load-buffer command for stdin with a trailing "-" (text never an argv token)', () => {
    const [load] = buildInputCommands(name, buf, false);
    expect(load[load.length - 1]).toBe('-');
    // the turn text appears in no argv element
    expect(buildInputCommands(name, buf, true).flat()).not.toContain('the job');
  });
});
