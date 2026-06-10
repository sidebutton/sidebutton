/**
 * Regression tests for SCRUM-1189: the engine must not advertise providers/steps it cannot run.
 *
 * The two invariants below are the real guard rails — they would have failed on the original
 * catalogue (Slack `chat.*` + Bitbucket `git.*` were advertised but unwired) and will fail again
 * if anyone re-introduces a phantom capability:
 *   1. every step type any connector advertises must be in getAllStepTypes() (executable), and
 *   2. every git/chat provider a connector advertises must actually resolve in its factory.
 */
import { describe, it, expect } from 'vitest';
import { parseWorkflow } from './parser.js';
import { getAllStepTypes } from './steps/index.js';
import { PROVIDER_DEFINITIONS, getGitProvider, getChatProvider } from './providers/registry.js';
import { WorkflowError } from './types.js';

/** Run `fn`, return the error it throws (fails the test if it does not throw). */
function catchError(fn: () => unknown): WorkflowError {
  try {
    fn();
  } catch (e) {
    return e as WorkflowError;
  }
  throw new Error('expected function to throw, but it did not');
}

const yaml = (...lines: string[]): string => lines.join('\n') + '\n';

describe('getAllStepTypes()', () => {
  const types = getAllStepTypes();

  it('no longer advertises the unimplemented chat.* steps', () => {
    expect(types.filter((t) => t.startsWith('chat.'))).toEqual([]);
  });

  it('still advertises the wired namespaces', () => {
    for (const t of ['browser.navigate', 'issues.comment', 'git.createPR', 'git.getIssue']) {
      expect(types).toContain(t);
    }
  });

  it('has no duplicates and the expected count (45 - 3 chat = 42)', () => {
    expect(new Set(types).size).toBe(types.length);
    expect(types.length).toBe(42);
  });
});

describe('PROVIDER_DEFINITIONS catalogue is honest', () => {
  it('does not list providers whose concrete class is not wired (slack, bitbucket)', () => {
    const ids = PROVIDER_DEFINITIONS.map((d) => d.id);
    expect(ids).toContain('jira');
    expect(ids).toContain('github');
    expect(ids).not.toContain('slack');
    expect(ids).not.toContain('bitbucket');
  });

  it('invariant: every advertised connector step type is executable (in getAllStepTypes)', () => {
    const executable = new Set(getAllStepTypes());
    const phantom: string[] = [];
    for (const def of PROVIDER_DEFINITIONS) {
      for (const conn of def.connectors) {
        for (const st of conn.stepTypes) {
          if (!executable.has(st)) phantom.push(`${def.id}/${conn.id}: ${st}`);
        }
      }
    }
    expect(phantom).toEqual([]);
  });

  it('invariant: every advertised git/chat provider resolves in its factory', () => {
    for (const def of PROVIDER_DEFINITIONS) {
      for (const conn of def.connectors) {
        if (conn.stepTypes.some((s) => s.startsWith('git.'))) {
          expect(() => getGitProvider(def.id)).not.toThrow();
        }
        if (conn.stepTypes.some((s) => s.startsWith('chat.'))) {
          expect(() => getChatProvider({}, def.id)).not.toThrow();
        }
      }
    }
  });
});

describe('provider factories', () => {
  it('getGitProvider resolves github (default and explicit), throws for bitbucket', () => {
    expect(() => getGitProvider()).not.toThrow();
    expect(() => getGitProvider('github')).not.toThrow();
    expect(() => getGitProvider('bitbucket')).toThrow(/Unknown git provider/);
  });

  it('getChatProvider throws (not implemented), even with SLACK_BOT_TOKEN set', () => {
    expect(() => getChatProvider({})).toThrow(/not implemented in this build/);
    expect(() => getChatProvider({ SLACK_BOT_TOKEN: 'xoxb-test' })).toThrow(/not implemented in this build/);
  });
});

describe('parseWorkflow fails fast on unsupported steps', () => {
  it('rejects an unimplemented chat.* step with a clear PARSE_ERROR', () => {
    const err = catchError(() =>
      parseWorkflow(yaml('id: t', 'title: T', 'steps:', '  - type: chat.listChannels')),
    );
    expect(err).toBeInstanceOf(WorkflowError);
    expect(err.code).toBe('PARSE_ERROR');
    expect(err.message).toMatch(/chat\.listChannels/);
    expect(err.message).toMatch(/not implemented in this build/);
  });

  it('rejects an unknown step type', () => {
    const err = catchError(() =>
      parseWorkflow(yaml('id: t', 'title: T', 'steps:', '  - type: bogus.step')),
    );
    expect(err.code).toBe('PARSE_ERROR');
    expect(err.message).toMatch(/Unknown step type "bogus\.step"/);
  });

  it('recurses into nested control bodies (catches a chat step inside control.if.then)', () => {
    const err = catchError(() =>
      parseWorkflow(
        yaml('id: t', 'title: T', 'steps:', '  - type: control.if', '    then:', '      - type: chat.readThread'),
      ),
    );
    expect(err.code).toBe('PARSE_ERROR');
    expect(err.message).toMatch(/steps\[0\]\.then\[0\]/);
    expect(err.message).toMatch(/chat\.readThread/);
  });

  it('accepts a valid workflow, including valid nested steps', () => {
    const wf = parseWorkflow(
      yaml(
        'id: demo',
        'title: Demo',
        'steps:',
        '  - type: issues.search',
        '    query: "project = X"',
        '  - type: control.if',
        '    condition: "{{x}} == 1"',
        '    then:',
        '      - type: git.createPR',
        '        title: T',
        '        head: feature',
      ),
    );
    expect(wf.id).toBe('demo');
    expect(wf.steps).toHaveLength(2);
  });

  it('still enforces the existing shape checks (missing id)', () => {
    const err = catchError(() => parseWorkflow(yaml('title: T', 'steps: []')));
    expect(err.code).toBe('PARSE_ERROR');
    expect(err.message).toMatch(/missing id/);
  });
});
