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
import { PROVIDER_DEFINITIONS, getGitProvider, getChatProvider, getIssuesProvider, getProviderStatuses } from './providers/registry.js';
import { JiraProvider, LinearProvider } from './providers/index.js';
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

describe('Linear provider (SCRUM-1425) is wired honestly', () => {
  it('is advertised with an api connector, LINEAR_API_KEY, the issues.* steps and a usage file', () => {
    const linear = PROVIDER_DEFINITIONS.find((d) => d.id === 'linear');
    expect(linear).toBeDefined();
    expect(linear!.type).toBe('issues');
    const api = linear!.connectors.find((c) => c.id === 'api');
    expect(api?.requiredEnvVars).toEqual(['LINEAR_API_KEY']);
    // OAuth app token is an alternative credential (SCRUM-1583 D1) — either one works on its own.
    expect(api?.altCredentialEnvVars).toContain('LINEAR_ACCESS_TOKEN');
    expect(api?.usageFile).toBe('_provider-linear-api.md');
    expect(api?.stepTypes).toEqual([
      'issues.create', 'issues.get', 'issues.search', 'issues.attach', 'issues.transition', 'issues.comment',
    ]);
  });

  it('adds NO new step types — every linear step is already executable, count stays 42', () => {
    const executable = new Set(getAllStepTypes());
    const api = PROVIDER_DEFINITIONS.find((d) => d.id === 'linear')!.connectors[0];
    for (const st of api.stepTypes) expect(executable.has(st)).toBe(true);
    expect(getAllStepTypes().length).toBe(42);
  });

  it('getIssuesProvider resolves a LinearProvider (auto-detected and explicit)', () => {
    expect(getIssuesProvider({ LINEAR_API_KEY: 'lin_api_x' })).toBeInstanceOf(LinearProvider);
    expect(getIssuesProvider({ LINEAR_API_KEY: 'lin_api_x' }, 'linear')).toBeInstanceOf(LinearProvider);
  });

  it('auto-detects Linear from the OAuth token alone (SCRUM-1583 D1)', () => {
    // An OAuth-connected account has no personal key — LINEAR_ACCESS_TOKEN must select Linear on its own.
    expect(getIssuesProvider({ LINEAR_ACCESS_TOKEN: 'lin_oauth_x' })).toBeInstanceOf(LinearProvider);
  });

  it('detection is Jira-first when both are configured', () => {
    const p = getIssuesProvider({ JIRA_USER_EMAIL: 'a@b.c', JIRA_API_TOKEN: 't', LINEAR_API_KEY: 'lin' });
    expect(p).toBeInstanceOf(JiraProvider);
  });

  it('names linear in the unknown-provider error', () => {
    expect(() => getIssuesProvider({}, 'bogus')).toThrow(/Supported: jira, linear, github/);
  });
});

describe('getProviderStatuses honors alternative credentials (SCRUM-1583 D1)', () => {
  const linearApiStatus = (envVars: Record<string, string>) =>
    getProviderStatuses({ envVars })
      .find((p) => p.id === 'linear')!
      .connectorStatuses.find((c) => c.id === 'api')!;

  it('reports the Linear api connector Ready with only the OAuth token — no spurious "Missing"', () => {
    // Detection + construction already accept LINEAR_ACCESS_TOKEN alone; the status/usage-file-sync
    // surface must agree, or an OAuth-only account is wrongly shown disconnected.
    const api = linearApiStatus({ LINEAR_ACCESS_TOKEN: 'lin_oauth_x' });
    expect(api.available).toBe(true);
    expect(api.error).toBeUndefined();
  });

  it('reports it Ready with only the personal key (raw-key path unchanged, AC3)', () => {
    expect(linearApiStatus({ LINEAR_API_KEY: 'lin_api_x' }).available).toBe(true);
  });

  it('reports Missing when neither credential is set', () => {
    const api = linearApiStatus({});
    expect(api.available).toBe(false);
    expect(api.error).toMatch(/Missing: LINEAR_API_KEY/);
  });

  it('does not let a plain optional var satisfy a connector — Jira still needs its required creds', () => {
    const jiraApi = getProviderStatuses({ envVars: { JIRA_URL: 'https://x.atlassian.net' } })
      .find((p) => p.id === 'jira')!
      .connectorStatuses.find((c) => c.id === 'api')!;
    expect(jiraApi.available).toBe(false);
    expect(jiraApi.error).toMatch(/Missing: JIRA_USER_EMAIL, JIRA_API_TOKEN/);
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
