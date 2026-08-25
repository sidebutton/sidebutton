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
import { JiraProvider, LinearProvider, GhCliProvider, GlabCliProvider } from './providers/index.js';
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

  it('has no duplicates and the expected count (46 - 3 chat = 43)', () => {
    expect(new Set(types).size).toBe(types.length);
    expect(types.length).toBe(43);
  });
});

describe('PROVIDER_DEFINITIONS catalogue is honest', () => {
  it('does not list providers whose concrete class is not wired (slack, bitbucket)', () => {
    const ids = PROVIDER_DEFINITIONS.map((d) => d.id);
    expect(ids).toContain('jira');
    expect(ids).toContain('github');
    expect(ids).toContain('gitlab');
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

  it('adds NO new step types — every linear step is already executable, count stays 43', () => {
    const executable = new Set(getAllStepTypes());
    const api = PROVIDER_DEFINITIONS.find((d) => d.id === 'linear')!.connectors[0];
    for (const st of api.stepTypes) expect(executable.has(st)).toBe(true);
    expect(getAllStepTypes().length).toBe(43);
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

describe('GitLab provider (SCRUM-1955) is wired honestly', () => {
  const gitlab = () => PROVIDER_DEFINITIONS.find((d) => d.id === 'gitlab')!;

  it('is advertised as a git provider with a glab cli connector and a usage file', () => {
    expect(gitlab()).toBeDefined();
    expect(gitlab().type).toBe('git');
    const cli = gitlab().connectors.find((c) => c.id === 'cli');
    expect(cli?.detectCommand).toBe('glab --version');
    expect(cli?.requiredEnvVars).toEqual([]);
    expect(cli?.usageFile).toBe('_provider-gitlab-cli.md');
    expect(cli?.stepTypes).toEqual([
      'git.listPRs', 'git.getPR', 'git.createPR', 'git.listIssues', 'git.getIssue',
    ]);
  });

  it('has a browser connector gated on GITLAB_BROWSER_URL that advertises no steps', () => {
    const browser = gitlab().connectors.find((c) => c.id === 'browser');
    expect(browser?.requiredEnvVars).toEqual(['GITLAB_BROWSER_URL']);
    expect(browser?.stepTypes).toEqual([]);
    expect(browser?.usageFile).toBe('_provider-gitlab-browser.md');
  });

  it('advertises NO issues.* steps — getIssuesProvider has no gitlab case and would throw', () => {
    for (const conn of gitlab().connectors) {
      expect(conn.stepTypes.filter((s) => s.startsWith('issues.'))).toEqual([]);
    }
    expect(() => getIssuesProvider({}, 'gitlab')).toThrow(/Unknown issues provider/);
  });

  it('adds NO new step types — every gitlab step is already executable, count stays 43', () => {
    const executable = new Set(getAllStepTypes());
    for (const conn of gitlab().connectors) {
      for (const st of conn.stepTypes) expect(executable.has(st)).toBe(true);
    }
    expect(getAllStepTypes().length).toBe(43);
  });

  it('getGitProvider resolves a GlabCliProvider and names gitlab in the unknown-provider error', () => {
    expect(getGitProvider('gitlab')).toBeInstanceOf(GlabCliProvider);
    expect(getGitProvider('GitLab')).toBeInstanceOf(GlabCliProvider);
    expect(() => getGitProvider('bitbucket')).toThrow(/Supported: github, gitlab/);
  });

  it('reports the cli connector as CLI-not-detected rather than Missing (no env vars to miss)', () => {
    const cli = getProviderStatuses({ envVars: {}, cliChecks: { 'glab --version': false } })
      .find((p) => p.id === 'gitlab')!
      .connectorStatuses.find((c) => c.id === 'cli')!;
    expect(cli.available).toBe(false);
    expect(cli.error).toBe('CLI not detected: glab');
  });

  it('reports the cli connector Ready once glab is detected', () => {
    const cli = getProviderStatuses({ envVars: {}, cliChecks: { 'glab --version': true } })
      .find((p) => p.id === 'gitlab')!
      .connectorStatuses.find((c) => c.id === 'cli')!;
    expect(cli.available).toBe(true);
  });
});

describe('Notion provider (SCRUM-2025 / N14) is advertised as documentation only', () => {
  const notion = () => PROVIDER_DEFINITIONS.find((d) => d.id === 'notion')!;

  it('has an api connector gated on NOTION_TOKEN, with the connector doc and NO step types', () => {
    expect(notion()).toBeDefined();
    expect(notion().type).toBe('issues');
    const api = notion().connectors.find((c) => c.id === 'api');
    expect(api?.requiredEnvVars).toEqual(['NOTION_TOKEN']);
    // The operator's reserved name satisfies the connector on its own (the portal never writes it).
    expect(api?.altCredentialEnvVars).toEqual(['NOTION_API_KEY']);
    expect(api?.featureLevel).toBe('basic');
    expect(api?.usageFile).toBe('_provider-notion-api.md');
    expect(api?.stepTypes).toEqual([]);
  });

  it('has a browser connector gated on NOTION_BROWSER_URL that advertises no steps', () => {
    // SCRUM-2022 / N11. It exists to advertise ONE doc for the one Notion operation with no API at
    // all — creating a webhook subscription. Same zero-step shape as the jira/gitlab browser
    // connectors, and the usage file must keep matching the name or the target sync copies nothing
    // (the sync skips a missing source silently — see provider-usage-files.test.ts).
    const browser = notion().connectors.find((c) => c.id === 'browser');
    expect(browser?.requiredEnvVars).toEqual(['NOTION_BROWSER_URL']);
    expect(browser?.featureLevel).toBe('basic');
    expect(browser?.stepTypes).toEqual([]);
    expect(browser?.usageFile).toBe('_provider-notion-browser.md');
  });

  it('advertises NO issues.* steps — getIssuesProvider has no notion case and would throw', () => {
    // The trap this guards: adding a step type here (or a NOTION_TOKEN rule to detectIssuesProvider)
    // without a NotionProvider class makes every issues.* run fall through to `default:` and throw.
    for (const conn of notion().connectors) {
      expect(conn.stepTypes.filter((s) => s.startsWith('issues.'))).toEqual([]);
    }
    expect(() => getIssuesProvider({}, 'notion')).toThrow(/Unknown issues provider/);
  });

  it('NOTION_TOKEN alone never auto-detects an issues provider (the delivered env must stay inert)', () => {
    // Every agent on a Notion-connected account carries NOTION_TOKEN in ~/.agent-env, so detection
    // must ignore it: a hit would turn a Jira-less account's issues.* steps into a hard error.
    expect(() => getIssuesProvider({ NOTION_TOKEN: 'ntn_x' })).toThrow(/No issues provider detected/);
    // …and it must not shadow a real provider on a dual-connected account either.
    expect(getIssuesProvider({ NOTION_TOKEN: 'ntn_x', LINEAR_API_KEY: 'lin_x' })).toBeInstanceOf(LinearProvider);
  });

  it('adds NO new step types — the executable count stays 43', () => {
    expect(getAllStepTypes().length).toBe(43);
  });

  it('reports the api connector Ready with either credential name, so its usage file can sync', () => {
    const status = (envVars: Record<string, string>) =>
      getProviderStatuses({ envVars })
        .find((p) => p.id === 'notion')!
        .connectorStatuses.find((c) => c.id === 'api')!;
    expect(status({ NOTION_TOKEN: 'ntn_x' }).available).toBe(true);
    expect(status({ NOTION_API_KEY: 'ntn_operator' }).available).toBe(true);
    expect(status({}).available).toBe(false);
    expect(status({}).error).toBe('Missing: NOTION_TOKEN');
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

  it('the no-arg default stays github — YAML git.* steps omit `provider:` (SCRUM-1955)', () => {
    expect(getGitProvider()).toBeInstanceOf(GhCliProvider);
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
