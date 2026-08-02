/**
 * Agent-resident tracker-credential injection for job sessions — the T2 consumer of
 * docs/plans/JIRA-AGENT-VM-ACCESS.md §4 (SCRUM-1830), tracker-neutral by design.
 *
 * The portal owns integration credentials; how they reach a Claude session depends on what the
 * Integrations page holds, and every lane converges HERE rather than in per-workflow YAML:
 *
 *   - Jira `api_key` (PAT): the portal delivers the static Basic set into `~/.agent-env` and the job
 *     script `source`s it — this module vends NOTHING for those accounts (the endpoint 204s) and the
 *     sourced file wins, exactly as before.
 *   - Jira `forge` (Marketplace app): the credential is a short-lived Bearer app token that must not
 *     live in a file, so this module pulls it from `GET /api/agents/jira-token` and injects
 *     JIRA_BEARER_TOKEN / JIRA_BASE_URL / JIRA_SITE_URL into the session environment only.
 *   - Linear: `GET /api/agents/linear-token` (shipped with SCRUM-1623) serves the current OAuth
 *     token; injecting it here gives sessions a fresh LINEAR_ACCESS_TOKEN even when the on-disk copy
 *     lagged a rotation. Keys present in `~/.agent-env` still win for scripts that `source` it —
 *     this is a floor, not an override.
 *   - No tracker at all: both endpoints 204, nothing is injected, nothing is touched.
 *
 * "Stays at the agent, not at every job": the engine process caches each vend in memory and only
 * re-fetches when the cache goes stale (Jira: ahead of the token's own `expiresAt`; Linear: a fixed
 * refresh window), so launching a job normally costs ZERO portal calls. Freshness rides the cache
 * deadline, not the job rate.
 *
 * Injection has two halves, and both are needed because job sessions run under tmux:
 *   1. `tmux set-environment -g` — new sessions inherit the tmux SERVER's global environment (the
 *      frozen-env layer), so updating it is what actually reaches the next `tmux new-session`;
 *   2. the returned map is merged into the launcher's spawn env — which is what seeds the server's
 *      environment when THIS launch is the one that starts the tmux server.
 * Values pass through process/tmux memory only: never written to the generated script, to
 * `~/.agent-env`, or to any file the health report uploads. The Jira keys are exclusively ours, so
 * a vend that goes away un-sets them globally; LINEAR_ACCESS_TOKEN is shared with the env-file lane
 * (api_key Linear + boot-inherited copies), so it is set when vended but never un-set here.
 *
 * Never throws, never logs token material: a vend failure degrades the session to whatever the env
 * file provides, which is the documented posture (a refused vend fails at the gate; a served corpse
 * fails deep inside a run).
 */
import { spawnSync } from 'node:child_process';

/** Jira keys this module owns exclusively — set AND un-set in the tmux global environment. */
export const JIRA_SESSION_ENV_KEYS = ['JIRA_BEARER_TOKEN', 'JIRA_BASE_URL', 'JIRA_SITE_URL'] as const;
/** Shared with the env-file lane — set when vended, never un-set (the file copy is not ours to kill). */
export const LINEAR_SESSION_ENV_KEY = 'LINEAR_ACCESS_TOKEN';

/** Re-vend Jira this far ahead of the token's own expiry — a session must never start on a corpse. */
const JIRA_EXPIRY_MARGIN_MS = 10 * 60_000;
/** Upper bound between Jira re-checks even when the token claims a long life. */
const JIRA_MAX_TTL_MS = 30 * 60_000;
/** Linear tokens rotate ~daily; a fixed window keeps sessions comfortably fresh. */
const LINEAR_TTL_MS = 15 * 60_000;
/** How long a 204 ("nothing to vend") is believed before asking again. */
const NEGATIVE_TTL_MS = 5 * 60_000;
/** How long a transport failure backs off before retrying (stale-cache grace). */
const ERROR_RETRY_MS = 60_000;

interface CacheEntry {
  env: Record<string, string>;
  refreshAfterMs: number;
}

let jiraCache: CacheEntry | null = null;
let linearCache: CacheEntry | null = null;
let tmuxUnavailableLogged = false;

/** Test seam: drop the in-process caches (module state survives across tests otherwise). */
export function resetTrackerSessionEnvForTests(): void {
  jiraCache = null;
  linearCache = null;
  tmuxUnavailableLogged = false;
}

export interface TrackerSessionEnvOptions {
  log?: (level: 'info' | 'warn', message: string) => void;
  /** Test seam for the portal fetch. */
  fetchImpl?: typeof fetch;
  /** Test seam for the clock. */
  now?: () => number;
  /** Skip the tmux half (tests / platforms without tmux); the returned map is unaffected. */
  applyTmux?: boolean;
}

function portalBase(): string {
  return (process.env.PORTAL_URL || 'https://sidebutton.com').replace(/\/+$/, '');
}

function agentToken(): string {
  return process.env.SIDEBUTTON_AGENT_TOKEN || process.env.AGENT_TOKEN || '';
}

async function vendJson(
  path: string,
  fetchImpl: typeof fetch,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetchImpl(`${portalBase()}${path}`, {
      headers: { Authorization: `Bearer ${agentToken()}` },
      signal: controller.signal,
    });
    if (res.status !== 200) return { status: res.status, body: null };
    return { status: 200, body: (await res.json()) as Record<string, unknown> };
  } finally {
    clearTimeout(timer);
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

async function refreshJira(fetchImpl: typeof fetch, nowMs: number): Promise<CacheEntry> {
  try {
    const { status, body } = await vendJson('/api/agents/jira-token', fetchImpl);
    if (status !== 200 || !body) return { env: {}, refreshAfterMs: nowMs + NEGATIVE_TTL_MS };
    const token = str(body.token);
    const baseUrl = str(body.baseUrl);
    if (!token || !baseUrl) return { env: {}, refreshAfterMs: nowMs + NEGATIVE_TTL_MS };
    const env: Record<string, string> = { JIRA_BEARER_TOKEN: token, JIRA_BASE_URL: baseUrl };
    const siteUrl = str(body.siteUrl);
    if (siteUrl) env.JIRA_SITE_URL = siteUrl;
    // Re-vend ahead of the token's own deadline; an unparseable expiry re-checks on the short cycle
    // rather than pinning a token of unknown remaining life for the full window.
    const expiresAtMs = Date.parse(str(body.expiresAt));
    const byExpiry = Number.isNaN(expiresAtMs) ? nowMs + NEGATIVE_TTL_MS : expiresAtMs - JIRA_EXPIRY_MARGIN_MS;
    return { env, refreshAfterMs: Math.min(nowMs + JIRA_MAX_TTL_MS, Math.max(byExpiry, nowMs + ERROR_RETRY_MS)) };
  } catch {
    // Transport failure: keep serving the previous answer briefly rather than flapping — unless the
    // previous answer was a Jira token, which must never outlive its own refresh deadline.
    return { env: {}, refreshAfterMs: nowMs + ERROR_RETRY_MS };
  }
}

async function refreshLinear(fetchImpl: typeof fetch, nowMs: number): Promise<CacheEntry> {
  try {
    const { status, body } = await vendJson('/api/agents/linear-token', fetchImpl);
    const token = status === 200 && body ? str(body.token) : '';
    if (!token) return { env: {}, refreshAfterMs: nowMs + NEGATIVE_TTL_MS };
    return { env: { [LINEAR_SESSION_ENV_KEY]: token }, refreshAfterMs: nowMs + LINEAR_TTL_MS };
  } catch {
    return { env: {}, refreshAfterMs: nowMs + ERROR_RETRY_MS };
  }
}

/**
 * Best-effort mirror of the vended map into the tmux GLOBAL environment, so the next
 * `tmux new-session` on an already-running server inherits it. No tmux / no server / non-Linux is a
 * silent no-op (logged once) — the spawn-env half still covers the fresh-server case.
 */
function applyTmuxGlobalEnv(env: Record<string, string>, log?: TrackerSessionEnvOptions['log']): void {
  const commands: string[][] = [];
  for (const key of JIRA_SESSION_ENV_KEYS) {
    commands.push(env[key] ? ['set-environment', '-g', key, env[key]] : ['set-environment', '-g', '-u', key]);
  }
  if (env[LINEAR_SESSION_ENV_KEY]) {
    commands.push(['set-environment', '-g', LINEAR_SESSION_ENV_KEY, env[LINEAR_SESSION_ENV_KEY]]);
  }
  for (const args of commands) {
    const res = spawnSync('tmux', args, { timeout: 3_000, stdio: 'ignore' });
    if (res.error || res.status !== 0) {
      if (!tmuxUnavailableLogged) {
        tmuxUnavailableLogged = true;
        log?.('info', 'tracker-env: tmux global env not updated (no tmux server yet?) — spawn env still carries it');
      }
      return; // one failure means the rest will fail the same way
    }
  }
}

/**
 * The tracker env this session should start with — cached at the agent (engine process) level, so
 * job launches normally cost zero portal calls. Returns the map for the launcher to merge into its
 * spawn env; also mirrors it into the tmux global environment unless `applyTmux` is false.
 */
export async function ensureTrackerSessionEnv(
  opts: TrackerSessionEnvOptions = {},
): Promise<Record<string, string>> {
  if (!agentToken()) return {}; // not a portal-provisioned agent — nothing to vend, touch nothing
  const fetchImpl = opts.fetchImpl ?? fetch;
  const nowMs = opts.now?.() ?? Date.now();

  if (!jiraCache || nowMs >= jiraCache.refreshAfterMs) {
    jiraCache = await refreshJira(fetchImpl, nowMs);
  }
  if (!linearCache || nowMs >= linearCache.refreshAfterMs) {
    linearCache = await refreshLinear(fetchImpl, nowMs);
  }

  const env = { ...linearCache.env, ...jiraCache.env };
  if (opts.applyTmux !== false) applyTmuxGlobalEnv(env, opts.log);
  return env;
}
