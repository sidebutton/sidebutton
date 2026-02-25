/**
 * Provider registry — connector-aware provider definitions and status.
 * Each provider can have multiple connectors (api, cli, browser).
 * Only one connector per provider is active at a time.
 */

import { execFile } from 'node:child_process';
import type { IssuesProvider, ChatProvider, GitProvider } from './types.js';
import type { ConnectorType, ProviderDefinition, ProviderStatus, ConnectorStatus } from '../types.js';
import { JiraProvider } from './jira.js';
import { AcliJiraProvider } from './jira-acli.js';
import { GhCliProvider } from './github.js';

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
    id: 'slack',
    name: 'Slack',
    type: 'chat',
    connectors: [
      {
        id: 'api',
        name: 'Bot Token API',
        featureLevel: 'full',
        requiredEnvVars: ['SLACK_BOT_TOKEN'],
        optionalEnvVars: [],
        stepTypes: ['chat.listChannels', 'chat.readChannel', 'chat.readThread'],
        setupInstructions: 'Create a Slack app and add a bot token (xoxb-...) in Settings → Environment Variables as SLACK_BOT_TOKEN.',
        usageFile: '_provider-slack-api.md',
      },
      {
        id: 'browser',
        name: 'Browser',
        featureLevel: 'basic',
        requiredEnvVars: ['SLACK_BROWSER_URL'],
        optionalEnvVars: [],
        stepTypes: [],
        setupInstructions: 'Set SLACK_BROWSER_URL to your Slack workspace URL (e.g. https://yourworkspace.slack.com). Make sure you are logged in to Slack in the browser.',
        usageFile: '_provider-slack-browser.md',
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
    id: 'bitbucket',
    name: 'Bitbucket',
    type: 'git',
    connectors: [
      {
        id: 'api',
        name: 'REST API 2.0',
        featureLevel: 'full',
        requiredEnvVars: ['BITBUCKET_USERNAME', 'BITBUCKET_APP_PASSWORD'],
        optionalEnvVars: [],
        stepTypes: ['git.listPRs', 'git.getPR', 'git.createPR'],
        setupInstructions: 'Add BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD in Settings → Environment Variables. Create an app password at https://bitbucket.org/account/settings/app-passwords/.',
        usageFile: '_provider-bitbucket-api.md',
      },
      {
        id: 'browser',
        name: 'Browser',
        featureLevel: 'basic',
        requiredEnvVars: ['BITBUCKET_BROWSER_URL'],
        optionalEnvVars: [],
        stepTypes: [],
        setupInstructions: 'Set BITBUCKET_BROWSER_URL to your Bitbucket URL (e.g. https://bitbucket.org). Make sure you are logged in to Bitbucket in the browser.',
        usageFile: '_provider-bitbucket-browser.md',
      },
    ],
  },
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

      // Check env var requirements
      const missingEnv = conn.requiredEnvVars.filter((v) => !envVars[v]);
      if (missingEnv.length > 0) {
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
    case 'github':
      return new GhCliProvider();
    default:
      throw new Error(
        override
          ? `Unknown issues provider: "${override}". Supported: jira, github`
          : 'No issues provider detected. Configure JIRA_USER_EMAIL + JIRA_API_TOKEN + JIRA_URL in Settings → Environment Variables.',
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
    default:
      throw new Error(
        `Unknown git provider: "${name}". Supported: github`,
      );
  }
}

export function getChatProvider(
  envVars: Record<string, string>,
  override?: string,
): ChatProvider {
  const name = override?.toLowerCase() ?? detectChatProvider(envVars);

  switch (name) {
    // SlackProvider will be added here when implemented
    default:
      throw new Error(
        override
          ? `Unknown chat provider: "${override}". Supported: (none yet — Slack coming soon)`
          : 'No chat provider detected. Slack support coming soon.',
      );
  }
}

function detectIssuesProvider(envVars: Record<string, string>): string | undefined {
  if (envVars.JIRA_USER_EMAIL && envVars.JIRA_API_TOKEN) return 'jira';
  return undefined;
}

function detectChatProvider(envVars: Record<string, string>): string | undefined {
  if (envVars.SLACK_BOT_TOKEN) return 'slack';
  return undefined;
}
