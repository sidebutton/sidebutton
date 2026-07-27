/**
 * Claude Code folder-trust pre-seeding.
 *
 * Dispatched jobs launch Claude Code INTERACTIVELY under tmux (see
 * `steps/shell.ts`). On its first start in a directory it has never seen,
 * Claude Code blocks on the native "Is this a project you created or one you
 * trust?" dialog — a first-run gate stored per directory in `~/.claude.json`
 * under `projects[<abs dir>].hasTrustDialogAccepted`, and NOT bypassed by
 * `--dangerously-skip-permissions` (that flag only covers tool permission
 * prompts; only non-interactive `-p` mode skips trust verification, which
 * dispatched sessions can't use — the live terminal depends on interactivity).
 *
 * Provisioning seeds the gate for the standard dirs (`~/workspace`, `~/ops`,
 * `~/oss` — agent-runners `base/15b`), but portal-created workspaces land on
 * any path under `$HOME`, so every launch dir must be seeded dynamically:
 * once when the portal's config push creates the folder, and again immediately
 * before each Claude launch as the catch-all.
 *
 * Posture: best-effort and non-destructive. `~/.claude.json` is Claude Code's
 * own state file — on unreadable/corrupt content we warn and leave it alone
 * (never reset it), and an already-trusted set skips the write entirely so
 * routine dispatches don't churn a file a live session may also write.
 */

import { homedir } from 'node:os';
import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type TrustSeedResult = 'seeded' | 'unchanged' | 'failed';

function expandHome(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return homedir() + p.slice(1);
  return p;
}

/**
 * Ensure `~/.claude.json` marks each of `dirs` as trusted (plus the global
 * onboarding flag, so a recreated config can't re-arm the theme-picker gate).
 *
 * Returns 'seeded' when the file was updated, 'unchanged' when every entry was
 * already present, 'failed' on any read/parse/write problem. Never throws —
 * a seeding failure must not fail the config apply or the job launch that
 * triggered it (worst case the session pauses on the dialog, as before).
 */
export function ensureClaudeFolderTrust(
  dirs: string | string[],
  configPath: string = join(homedir(), '.claude.json'),
): TrustSeedResult {
  const targets = (Array.isArray(dirs) ? dirs : [dirs])
    .filter((d) => typeof d === 'string' && d.trim() !== '')
    .map((d) => resolve(expandHome(d.trim())));
  if (targets.length === 0) return 'unchanged';

  try {
    let config: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        console.warn(`[claude-trust] ${configPath} is not a JSON object — leaving it untouched`);
        return 'failed';
      }
      config = parsed as Record<string, unknown>;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        // Unreadable or corrupt: this file holds Claude Code's own state, so
        // never "fix" it by rewriting — a lost trust seed only re-shows the
        // dialog, a clobbered config loses real state.
        console.warn(`[claude-trust] could not read ${configPath}: ${(err as Error).message}`);
        return 'failed';
      }
    }

    const rawProjects = config.projects;
    const projects: Record<string, unknown> =
      typeof rawProjects === 'object' && rawProjects !== null && !Array.isArray(rawProjects)
        ? (rawProjects as Record<string, unknown>)
        : {};

    let changed = false;
    if (config.hasCompletedOnboarding !== true) {
      config.hasCompletedOnboarding = true;
      changed = true;
    }
    for (const dir of targets) {
      const raw = projects[dir];
      const entry: Record<string, unknown> =
        typeof raw === 'object' && raw !== null && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      if (entry.hasTrustDialogAccepted !== true || entry.hasCompletedProjectOnboarding !== true) {
        projects[dir] = { ...entry, hasTrustDialogAccepted: true, hasCompletedProjectOnboarding: true };
        changed = true;
      }
    }
    if (!changed) return 'unchanged';

    config.projects = projects;

    // Atomic-ish replace: full temp write + rename, so a crash mid-write can
    // never leave Claude Code a truncated config. 0o600 matches provisioning.
    const tmpPath = `${configPath}.sb-trust-${process.pid}.tmp`;
    try {
      writeFileSync(tmpPath, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
      renameSync(tmpPath, configPath);
    } catch (err) {
      rmSync(tmpPath, { force: true });
      throw err;
    }
    return 'seeded';
  } catch (err) {
    console.warn(`[claude-trust] could not seed folder trust in ${configPath}: ${(err as Error).message}`);
    return 'failed';
  }
}
