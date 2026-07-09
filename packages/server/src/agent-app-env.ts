/**
 * Live reconcile of the per-app env directory `~/.agent-env.d/` for the agent bridge (AAP-21 / SCRUM-1659).
 *
 * The portal's `POST /api/config/apply` now carries `agent_app_env` — the account's full NATIVE per-app
 * env keyed by each app's non-secret slug: `{ "<slug>": { "ANTHROPIC_AUTH_TOKEN": "…", … }, … }`. Before
 * AAP-21 this env rode ONLY the first-boot path (`GET /api/agents/secrets` → `base/19-secrets.sh`, which
 * is deliberately excluded from the `sb-self-update` refresh), so an app created / edited / key-rotated
 * after an agent was provisioned never reached that running agent (the "in effect on 0 agents / drift"
 * symptom). `applyAgentAppEnv` closes that gap on the live config-apply channel.
 *
 * FORMAT IS A HARD CONTRACT — byte-for-byte identical to what `base/19-secrets.sh` writes at first boot,
 * because the ops-YAML `source`s these files and the health reporter parses EVERY file in the dir as a
 * slug (`report-health-snapshot.sh`):
 *   - dir mode `0700`; each file `~/.agent-env.d/<slug>` mode `0600`;
 *   - each line `export KEY="VALUE"` (exported — the launch shell `source`s it), keys sorted (as `jq keys`
 *     emits them in 19-secrets), one trailing newline per line;
 *   - a slug delivered with an EMPTY env writes NO file (an empty file would be `-f` true yet skip the
 *     ops-YAML unset branch, leaking a stray provider var into that run);
 *   - any pre-existing file whose slug is NOT in the delivered set is REMOVED (reconcile-to-zero: a
 *     deleted app tears down; a subscription-only account clears the dir).
 *
 * BACK-COMPAT: `agent_app_env === undefined` (an older portal that never sends the field) is a NO-OP —
 * the dir is never touched. A malformed field (non-object / array / null) is treated the same, so a bad
 * body can never wipe a running agent's staged env.
 *
 * BLAST RADIUS: `~/.agent-env.d/` is EXCLUSIVELY app-env — only `base/19-secrets.sh` and this writer touch
 * it, the reporter reads every file as a slug, per-run dispatch only `source`s (never writes), and CCR
 * isolation uses a separate `~/.agent-env.ccr`. So reconcile-to-zero can safely remove any non-delivered
 * file. The directory IS the manifest; NO marker file is written inside it (the reporter would mis-read it
 * as a bogus slug).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** The dir (relative to `$HOME`) that stages per-app env, keyed by slug. Mirrors `${ENV_FILE}.d` in 19-secrets. */
const APP_ENV_DIRNAME = '.agent-env.d';

export interface AgentAppEnvResult {
  slug: string;
  ok: boolean;
  status: 'written' | 'removed' | 'error';
  error?: string;
}

/**
 * A slug must be a single safe path segment (the portal's `slugify` emits `[a-z0-9-]+`). Rejects anything
 * that could escape the dir — separators, `.` / `..`, empty, or absurdly long. Defence-in-depth: the
 * portal already constrains slugs, but this writer runs on a value delivered over the network.
 */
function isSafeSlug(slug: string): boolean {
  return (
    typeof slug === 'string' &&
    slug.length > 0 &&
    slug.length <= 255 &&
    slug !== '.' &&
    slug !== '..' &&
    !/[/\\]/.test(slug)
  );
}

/**
 * Serialize one app's env to the exact `export KEY="VALUE"` lines `base/19-secrets.sh` writes. Keys are
 * sorted so the bytes match the shell (`jq … | keys[]` emits sorted); values are wrapped verbatim in
 * double quotes with NO extra escaping, matching the shell's `echo "export ${key}=\"${val}\""`.
 */
function serializeAppEnv(env: Record<string, string>): string {
  return Object.keys(env)
    .sort()
    .map((key) => `export ${key}="${env[key]}"\n`)
    .join('');
}

/**
 * Reconcile `~/.agent-env.d/` to EXACTLY the delivered `agentAppEnv` map. Returns a per-slug result list
 * for the caller to fold into the config-apply response (logging / diagnostics only). See the module
 * header for the format + back-compat contract.
 */
export function applyAgentAppEnv(
  agentAppEnv: unknown,
  homeDir: string,
): AgentAppEnvResult[] {
  // Older portal (field absent) or a malformed body → never touch the dir. Only a plain object reconciles.
  if (agentAppEnv === undefined) return [];
  if (agentAppEnv === null || typeof agentAppEnv !== 'object' || Array.isArray(agentAppEnv)) return [];

  const results: AgentAppEnvResult[] = [];
  const dir = path.join(homeDir, APP_ENV_DIRNAME);

  // The slugs we should KEEP on disk: those delivered with a NON-EMPTY env (an empty app writes no file,
  // matching 19-secrets' "never stage an empty file"). A delivered-but-empty slug is thus reconciled away
  // like any other orphan.
  const keep = new Set<string>();

  for (const [slug, rawEnv] of Object.entries(agentAppEnv as Record<string, unknown>)) {
    if (!isSafeSlug(slug)) {
      results.push({ slug, ok: false, status: 'error', error: 'unsafe slug — rejected' });
      continue;
    }
    const env =
      rawEnv && typeof rawEnv === 'object' && !Array.isArray(rawEnv) ? (rawEnv as Record<string, string>) : {};
    if (Object.keys(env).length === 0) continue; // empty app → no file (a stale file for it is removed below)

    keep.add(slug);
    try {
      // mkdir mode is umask-masked and ignored when the dir already exists → chmod to guarantee 0700.
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.chmodSync(dir, 0o700);
      const file = path.join(dir, slug);
      // writeFileSync's mode only applies on create → chmod to guarantee 0600 on an existing file too.
      fs.writeFileSync(file, serializeAppEnv(env), { mode: 0o600 });
      fs.chmodSync(file, 0o600);
      results.push({ slug, ok: true, status: 'written' });
    } catch (err: unknown) {
      results.push({ slug, ok: false, status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Reconcile-to-zero: remove any regular file in the dir whose slug is not in the keep set. Non-existent
  // dir (nothing delivered, nothing ever staged) → nothing to reconcile.
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue; // the reporter only inventories regular files; leave anything else alone
    if (keep.has(entry.name)) continue;
    try {
      fs.rmSync(path.join(dir, entry.name), { force: true });
      results.push({ slug: entry.name, ok: true, status: 'removed' });
    } catch (err: unknown) {
      results.push({ slug: entry.name, ok: false, status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  return results;
}
