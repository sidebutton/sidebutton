/**
 * Provider registry — connector-aware provider definitions and status.
 * Each provider can have multiple connectors (api, cli, browser).
 * Only one connector per provider is active at a time.
 */

import { execFile } from 'node:child_process';
import type { IssuesProvider, ChatProvider, GitProvider } from './types.js';
import type { ConnectorType, ProviderDefinition, ProviderStatus, ConnectorStatus } from '../types.js';
import { JiraProvider } from './jira.js';
import { LinearProvider } from './linear.js';
import { AcliJiraProvider } from './jira-acli.js';
import { GhCliProvider } from './github.js';
import { GlabCliProvider } from './gitlab.js';

// ============================================================================
// Provider Definitions (with connector arrays)
// ============================================================================

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: 'jira',
    name: 'Jira',
    type: 'issues',
    connectors: [
      {
        id: 'api',
        name: 'REST API',
        featureLevel: 'full',
        requiredEnvVars: ['JIRA_USER_EMAIL', 'JIRA_API_TOKEN'],
        optionalEnvVars: ['JIRA_URL'],
        stepTypes: ['issues.create', 'issues.get', 'issues.search', 'issues.attach', 'issues.transition', 'issues.comment'],
        setupInstructions: 'Add JIRA_USER_EMAIL and JIRA_API_TOKEN in Settings → Environment Variables. Optionally set JIRA_URL for your Atlassian site.',
        usageFile: '_provider-jira-api.md',
      },
      {
        id: 'cli',
        name: 'CLI (acli)',
        featureLevel: 'full',
        requiredEnvVars: [],
        optionalEnvVars: [],
        detectCommand: 'acli --version',
        stepTypes: ['issues.create', 'issues.get', 'issues.search', 'issues.attach', 'issues.transition', 'issues.comment'],
        setupInstructions: 'Install the Atlassian CLI (acli) and run `acli jira auth login` to authenticate via browser OAuth.',
        usageFile: '_provider-jira-cli.md',
      },
      {
        id: 'browser',
        name: 'Browser',
        featureLevel: 'basic',
        requiredEnvVars: ['JIRA_BROWSER_URL'],
        optionalEnvVars: [],
        stepTypes: [],
        setupInstructions: 'Set JIRA_BROWSER_URL to your Jira board URL (e.g. https://yoursite.atlassian.net). Make sure you are logged in to Jira in the browser.',
        usageFile: '_provider-jira-browser.md',
      },
    ],
  },
  {
    id: 'linear',
    name: 'Linear',
    type: 'issues',
    connectors: [
      {
        id: 'api',
        name: 'GraphQL API',
        featureLevel: 'full',
        requiredEnvVars: ['LINEAR_API_KEY'],
        optionalEnvVars: [],
        // OAuth-connected accounts authenticate with LINEAR_ACCESS_TOKEN (Bearer) instead of the raw
        // personal key. It is an ALTERNATIVE credential — either one on its own satisfies the connector
        // (§11) — so it counts toward availability in getProviderStatuses, unlike a plain optional var.
        altCredentialEnvVars: ['LINEAR_ACCESS_TOKEN'],
        stepTypes: ['issues.create', 'issues.get', 'issues.search', 'issues.attach', 'issues.transition', 'issues.comment'],
        setupInstructions: 'Add LINEAR_API_KEY (a Linear personal API key) in Settings → Environment Variables. The key identifies the workspace — no URL needed. Accounts connected via "Connect with Linear" (OAuth) instead receive a LINEAR_ACCESS_TOKEN, sent as a Bearer token and preferred when both are set.',
        usageFile: '_provider-linear-api.md',
      },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    type: ['git', 'issues'],
    connectors: [
      {
        id: 'cli',
        name: 'CLI (gh)',
        featureLevel: 'full',
        requiredEnvVars: [],
        optionalEnvVars: [],
        detectCommand: 'gh --version',
        stepTypes: ['git.listPRs', 'git.getPR', 'git.createPR', 'git.listIssues', 'git.getIssue', 'issues.create', 'issues.get', 'issues.search'],
        setupInstructions: 'Install the GitHub CLI (gh) and run `gh auth login` to authenticate.',
        usageFile: '_provider-github-cli.md',
      },
      {
        id: 'browser',
        name: 'Browser',
        featureLevel: 'basic',
        requiredEnvVars: ['GITHUB_BROWSER_URL'],
        optionalEnvVars: [],
        stepTypes: [],
        setupInstructions: 'Set GITHUB_BROWSER_URL to your GitHub URL (e.g. https://github.com). Make sure you are logged in to GitHub in the browser.',
        usageFile: '_provider-github-browser.md',
      },
    ],
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    // git only, deliberately: `getIssuesProvider` has no gitlab case, so advertising issues.* here
    // would be the same phantom capability SCRUM-1189 removed. The glab CLI does have issue
    // commands — GlabCliProvider exposes them as the git.listIssues / git.getIssue reads.
    type: 'git',
    connectors: [
      {
        id: 'cli',
        name: 'CLI (glab)',
        featureLevel: 'full',
        requiredEnvVars: [],
        optionalEnvVars: [],
        detectCommand: 'glab --version',
        stepTypes: ['git.listPRs', 'git.getPR', 'git.createPR', 'git.listIssues', 'git.getIssue'],
        setupInstructions: 'Install the GitLab CLI (glab) and authenticate it — set GITLAB_TOKEN and run `glab auth login`. Provisioned agent VMs install glab and authenticate it automatically when GITLAB_TOKEN is present (SCRUM-1952).',
        usageFile: '_provider-gitlab-cli.md',
      },
      {
        id: 'browser',
        name: 'Browser',
        featureLevel: 'basic',
        requiredEnvVars: ['GITLAB_BROWSER_URL'],
        optionalEnvVars: [],
        stepTypes: [],
        setupInstructions: 'Set GITLAB_BROWSER_URL to your GitLab URL (e.g. https://gitlab.com). Make sure you are logged in to GitLab in the browser.',
        usageFile: '_provider-gitlab-browser.md',
      },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    // 'issues' is the TYPE this provider documents, but note the empty `stepTypes` below: there is
    // no NotionProvider class in @sidebutton/core, so `getIssuesProvider` has no notion case and
    // `detectIssuesProvider` deliberately does NOT look at NOTION_TOKEN — a detection hit would
    // fall through to `default:` and throw "No issues provider detected"/"Unknown issues provider".
    // The definition exists to advertise the CONNECTOR DOCS (SCRUM-2025 / N14, SCRUM-2022 / N11): the
    // target sync (packages/server) only copies `_provider-*` files a connector names, so without this
    // entry the agent's only Notion reference would never reach a session. Same shape as the jira and
    // gitlab browser connectors — real documentation, zero advertised steps. Agent-side `issues.*` over
    // Notion is a separate ticket, and it must add the provider class, the factory case and the
    // detection rule together with its step types.
    type: 'issues',
    connectors: [
      {
        id: 'api',
        name: 'REST API',
        featureLevel: 'basic',
        requiredEnvVars: ['NOTION_TOKEN'],
        optionalEnvVars: [],
        // The operator's reserved name (website/src/lib/cloud/notion-agent-env.ts): the portal never
        // writes or strips NOTION_API_KEY, so a self-managed integration lives there. Either name on
        // its own is a working credential — Linear's LINEAR_ACCESS_TOKEN precedent — and without this
        // a self-managed setup would read as "Missing: NOTION_TOKEN" and never sync its usage file.
        altCredentialEnvVars: ['NOTION_API_KEY'],
        stepTypes: [],
        setupInstructions: 'Connect Notion in Settings → Integrations: the portal delivers the connection\'s token to the agent as NOTION_TOKEN. Self-managed setups can instead set NOTION_TOKEN (or NOTION_API_KEY, which the portal never writes) in Settings → Environment Variables. The token identifies the workspace — no URL is needed — and each database must be shared with the connection.',
        usageFile: '_provider-notion-api.md',
      },
      {
        id: 'browser',
        name: 'Browser',
        featureLevel: 'basic',
        requiredEnvVars: ['NOTION_BROWSER_URL'],
        optionalEnvVars: [],
        // Zero steps, like every other browser connector — but the reason is sharper here. This lane
        // exists for the ONE Notion operation that has no API at all: creating a webhook subscription
        // and pasting its one-time verification token back (SCRUM-2022 / N11). Everything else about
        // Notion is better done over REST, and the doc says so rather than letting an agent drive a
        // database through the UI because the browser connector happened to be the active one.
        stepTypes: [],
        setupInstructions: 'Set NOTION_BROWSER_URL to your Notion workspace URL (e.g. https://www.notion.so). Make sure you are logged in to Notion in the browser. This connector covers webhook-subscription setup, which Notion offers in the connection-settings UI only — use the REST API connector for reading and writing pages.',
        usageFile: '_provider-notion-browser.md',
      },
    ],
  },
  // NOTE (SCRUM-1189): Slack (chat) and Bitbucket (git) are intentionally NOT advertised here.
  // No SlackProvider/BitbucketProvider is wired, so getChatProvider/getGitProvider would throw at
  // runtime. Re-add an entry only once its concrete class is implemented AND wired into the
  // matching factory below, with its step types handled in executeStep and listed in
  // getAllStepTypes(). Until then, advertising them is a capability the engine cannot deliver.
];

// ============================================================================
// CLI Detection (cached)
// ============================================================================

const cliCache = new Map<string, { available: boolean; checkedAt: number }>();
const CLI_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function detectCli(command: string): Promise<boolean> {
  const cached = cliCache.get(command);
  if (cached && Date.now() - cached.checkedAt < CLI_CACHE_TTL) {
    return Promise.resolve(cached.available);
  }

  return new Promise((resolve) => {
    const [cmd, ...args] = command.split(' ');
    execFile(cmd, args, { timeout: 5000 }, (error) => {
      const available = !error;
      cliCache.set(command, { available, checkedAt: Date.now() });
      resolve(available);
    });
  });
}

// ============================================================================
// Provider Status
// ============================================================================

export interface ProviderStatusOptions {
  envVars: Record<string, string>;
  activeChoices?: Record<string, ConnectorType>;
  cliChecks?: Record<string, boolean>;
}

export function getProviderStatuses(opts: ProviderStatusOptions): ProviderStatus[] {
  const { envVars, activeChoices = {}, cliChecks = {} } = opts;

  return PROVIDER_DEFINITIONS.map((def) => {
    const activeConnectorId = activeChoices[def.id];

    const connectorStatuses: ConnectorStatus[] = def.connectors.map((conn) => {
      let available = true;
      let error: string | undefined;

      // Check env var requirements. A connector is credential-satisfied by all of requiredEnvVars,
      // OR by any single alternative credential (altCredentialEnvVars) — e.g. Linear's OAuth
      // LINEAR_ACCESS_TOKEN standing in for the raw LINEAR_API_KEY (SCRUM-1583 §11).
      const missingEnv = conn.requiredEnvVars.filter((v) => !envVars[v]);
      const hasAltCredential = (conn.altCredentialEnvVars ?? []).some((v) => envVars[v]);
      if (missingEnv.length > 0 && !hasAltCredential) {
        available = false;
        error = `Missing: ${missingEnv.join(', ')}`;
      }

      // Check CLI detection
      if (available && conn.detectCommand) {
        const cliAvailable = cliChecks[conn.detectCommand];
        if (cliAvailable === false) {
          available = false;
          error = `CLI not detected: ${conn.detectCommand.split(' ')[0]}`;
        } else if (cliAvailable === undefined) {
          // CLI check not yet run — mark as unknown but don't block
          available = false;
          error = 'CLI detection pending';
        }
      }

      return {
        id: conn.id,
        available,
        active: conn.id === activeConnectorId,
        error: available ? undefined : error,
      };
    });

    // Provider is connected if its active connector is available
    const activeStatus = connectorStatuses.find((cs) => cs.active);
    const connected = activeStatus?.available ?? false;

    return {
      ...def,
      connected,
      activeConnector: activeConnectorId,
      connectorStatuses,
      error: activeStatus && !activeStatus.available ? activeStatus.error : undefined,
    };
  });
}

// ============================================================================
// Helper: get active connector's usage file for a provider
// ============================================================================

export function getActiveUsageFile(providerId: string, activeChoices: Record<string, ConnectorType>): string | undefined {
  const def = PROVIDER_DEFINITIONS.find((p) => p.id === providerId);
  if (!def) return undefined;
  const connectorId = activeChoices[def.id];
  if (!connectorId) return undefined;
  const connector = def.connectors.find((c) => c.id === connectorId);
  return connector?.usageFile;
}

// ============================================================================
// Provider Factories
// ============================================================================

export function getIssuesProvider(
  envVars: Record<string, string>,
  override?: string,
  site?: string,
  activeConnector?: string,
): IssuesProvider {
  const name = override?.toLowerCase() ?? detectIssuesProvider(envVars);

  switch (name) {
    case 'jira':
      if (activeConnector === 'cli') return new AcliJiraProvider();
      return new JiraProvider(envVars, site);
    case 'linear':
      return new LinearProvider(envVars);
    case 'github':
      return new GhCliProvider();
    default:
      throw new Error(
        override
          ? `Unknown issues provider: "${override}". Supported: jira, linear, github`
          : 'No issues provider detected. Configure Jira (JIRA_USER_EMAIL + JIRA_API_TOKEN + JIRA_URL) or Linear (LINEAR_ACCESS_TOKEN or LINEAR_API_KEY) in Settings → Environment Variables.',
      );
  }
}

export function getGitProvider(
  override?: string,
): GitProvider {
  const name = override?.toLowerCase() ?? 'github';

  switch (name) {
    case 'github':
      return new GhCliProvider();
    case 'gitlab':
      return new GlabCliProvider();
    default:
      throw new Error(
        `Unknown git provider: "${name}". Supported: github, gitlab`,
      );
  }
}

export function getChatProvider(
  envVars: Record<string, string>,
  override?: string,
): ChatProvider {
  const name = override?.toLowerCase() ?? detectChatProvider(envVars);

  switch (name) {
    // No chat provider is wired in this build. When a SlackProvider (or other) is implemented,
    // add its `case` here and re-advertise it in PROVIDER_DEFINITIONS. See SCRUM-1189.
    default:
      throw new Error(
        override
          ? `Unknown chat provider: "${override}". Chat providers are not implemented in this build.`
          : 'Chat providers are not implemented in this build.',
      );
  }
}

function detectIssuesProvider(envVars: Record<string, string>): string | undefined {
  if (envVars.JIRA_USER_EMAIL && envVars.JIRA_API_TOKEN) return 'jira';
  // Either the OAuth app token (Bearer) or a personal key (raw) selects Linear.
  if (envVars.LINEAR_ACCESS_TOKEN || envVars.LINEAR_API_KEY) return 'linear';
  return undefined;
}

function detectChatProvider(envVars: Record<string, string>): string | undefined {
  if (envVars.SLACK_BOT_TOKEN) return 'slack';
  return undefined;
}
