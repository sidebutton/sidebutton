import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { parseClaudeSessions, classifyProbeFailure } from './claude-probe.js';

/**
 * SCRUM-1983 — the whole point of this module is one distinction: an EMPTY answer versus NO
 * answer. The RCA measured four `listClaudeSessions()` outcomes on a loaded box and found three
 * of them indistinguishable from an idle machine:
 *
 *   A. normal              -> 2 sessions; claude_running = true
 *   B. probe TIMES OUT     -> 0 sessions; claude_running = false   <- fiction
 *   C. probe CANNOT RUN    -> 0 sessions; claude_running = false   <- fiction
 *   D. output OVERFLOWS    -> 0 sessions; claude_running = false   <- fiction
 *
 * These tests pin B/C/D to `sessions: null` and keep the one genuine empty answer (pgrep exit 1,
 * "no process matched") reporting `[]`. Each failure case is raised by a REAL `execSync` throw,
 * not a hand-built object, so the assertions track what Node actually puts on the error.
 */

/** Run something through execSync and hand back whatever it threw. */
function thrownBy(cmd: string, opts: Parameters<typeof execSync>[1] = {}): unknown {
  try {
    execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts });
    throw new Error(`expected \`${cmd}\` to fail`);
  } catch (err) {
    return err;
  }
}

describe('parseClaudeSessions', () => {
  it('splits "<pid> <cmdline>" lines, keeping the full command line intact', () => {
    expect(parseClaudeSessions('4242 claude --session-id abc --model opus\n5001 claude\n')).toEqual([
      { pid: 4242, cmd: 'claude --session-id abc --model opus' },
      { pid: 5001, cmd: 'claude' },
    ]);
  });

  it('reads a clean exit with no output as an empty box', () => {
    expect(parseClaudeSessions('')).toEqual([]);
    expect(parseClaudeSessions('\n')).toEqual([]);
  });
});

describe('classifyProbeFailure', () => {
  it('A/idle: exit 1 with no output is an ANSWER — pgrep ran and matched nothing', () => {
    // Exactly what `pgrep -a claude` does on a box with no Claude running.
    const probe = classifyProbeFailure(thrownBy('exit 1'));
    expect(probe.sessions).toEqual([]);
    expect(probe.error).toBeUndefined();
  });

  it('B: a probe killed by the timeout reports NO answer, not an idle box', () => {
    const probe = classifyProbeFailure(thrownBy('sleep 5', { timeout: 150 }));
    expect(probe.sessions).toBeNull();
    expect(probe.error).toBe('pgrep failed: ETIMEDOUT');
  });

  it('C: a probe that cannot run at all reports NO answer', () => {
    const probe = classifyProbeFailure(thrownBy('sb-no-such-binary-1983'));
    expect(probe.sessions).toBeNull();
    expect(probe.error).toBeTruthy();
  });

  it('D: output overflowing maxBuffer reports NO answer, and says ENOBUFS not "timed out"', () => {
    // Node kills a maxBuffer overrun with SIGTERM and sets code ENOBUFS — the same signal the
    // 3s timeout produces (ETIMEDOUT). Reading the signal first reported every overflow as a
    // timeout, which is the wrong cause to hand an operator diagnosing a silent probe.
    const probe = classifyProbeFailure(thrownBy('yes claude', { maxBuffer: 64 }));
    expect(probe.sessions).toBeNull();
    expect(probe.error).toBe('pgrep failed: ENOBUFS');
  });

  it('distinguishes pgrep exit 1 from its other exit codes (2 = syntax, 3 = fatal)', () => {
    expect(classifyProbeFailure(thrownBy('exit 2')).sessions).toBeNull();
    expect(classifyProbeFailure(thrownBy('exit 3')).sessions).toBeNull();
  });

  it('treats a signalled exit-1 as a failure — the signal is the real story', () => {
    // A synthetic case: `status` alone would say "no match", but the process was killed.
    expect(classifyProbeFailure({ status: 1, signal: 'SIGKILL' }).sessions).toBeNull();
  });

  it('never throws on a malformed error value', () => {
    for (const junk of [null, undefined, 'boom', 42]) {
      expect(classifyProbeFailure(junk).sessions).toBeNull();
    }
  });
});
