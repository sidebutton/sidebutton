/**
 * The Claude Code plugin ledger, surfaced on /health (SCRUM-1982).
 *
 * agent-runners `base/19i-claude-plugins.sh` installs the plugins the operator
 * picked in the Create-Agent wizard (`claude plugin install name@marketplace`)
 * and writes what happened to `~/.sidebutton/claude-plugins.json`. Without this
 * reader the result is a log line on a VM nobody reads: a plugin that failed to
 * install looks exactly like one that worked, because the box still reports
 * online and the portal only ever knew what was *requested*.
 *
 * Do not confuse it with `HealthResponse.plugins`, which is the SideButton MCP
 * plugin list from `~/.sidebutton/plugins/`. Two different plugin systems; this
 * one is Claude Code's own store.
 *
 * The reader is deliberately strict about what it emits. The ledger is a file on
 * a box the portal does not control, so an oversized or malformed one must not
 * become an oversized or malformed /health body. The portal re-validates on
 * ingest anyway (it must never trust an agent), but "be strict about what you
 * send" is this side's job, not a duplicate of that one.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** How a single requested plugin ended up on the box. */
export type ClaudePluginStatus = 'installed' | 'failed' | 'rejected';

/** One ledger entry — the shape `base/19i-claude-plugins.sh` writes. */
export interface ClaudePluginReport {
  /** Plugin name as requested (a `rejected` entry carries the raw token instead). */
  name: string;
  /** Marketplace alias as REQUESTED — what the portal stored. Null on a rejected entry. */
  marketplace: string | null;
  status: ClaudePluginStatus;
  /** Version from `claude plugin list --json`; null unless installed. */
  version: string | null;
  /** The CLI's own failure message, or why the entry was rejected. */
  error: string | null;
}

/**
 * Caps. The step itself refuses more than 20 plugins (MAX_CLAUDE_PLUGINS in the
 * portal), but it also records a `rejected` entry per unusable token, so a
 * legitimate ledger can be longer than the request cap — hence 2x rather than
 * exactly 20. Everything past the cap is dropped rather than truncated
 * mid-entry, and the file itself is size-checked before it is parsed at all.
 */
export const MAX_LEDGER_ENTRIES = 40;
export const MAX_LEDGER_BYTES = 128 * 1024;

const STATUSES = new Set<string>(['installed', 'failed', 'rejected']);

/** Trim, drop empties, and bound the length. Anything non-string reads as absent. */
function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Coerce a parsed ledger body into entries. Bad entries are skipped, never thrown on. */
export function normalizeClaudePluginLedger(value: unknown): ClaudePluginReport[] {
  if (!Array.isArray(value)) return [];
  const out: ClaudePluginReport[] = [];
  for (const raw of value) {
    if (out.length >= MAX_LEDGER_ENTRIES) break;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const name = str(entry.name, 129);
    if (!name) continue; // an entry with no name identifies nothing — drop it
    const rawStatus = typeof entry.status === 'string' ? entry.status : '';
    // Unknown status reads as `failed`, never as installed: the safe default for
    // a signal whose whole purpose is to surface plugins the operator did NOT get.
    const status = (STATUSES.has(rawStatus) ? rawStatus : 'failed') as ClaudePluginStatus;
    out.push({
      name,
      marketplace: str(entry.marketplace, 64),
      status,
      version: str(entry.version, 64),
      error: str(entry.error, 300),
    });
  }
  return out;
}

/**
 * Read + normalize `<sidebuttonDir>/claude-plugins.json`.
 *
 * Returns null when there is nothing to report — no file (an agent provisioned
 * before SCRUM-1982, or one that requested no plugins), an unreadable/oversized
 * file, or a body that yields no usable entry. Null keeps the key off /health
 * entirely, so "not reported" stays distinguishable from "reported empty".
 *
 * Read per request, not cached at boot: `base/19i` re-runs on the refresh
 * cadence, and the point of the ledger is to reflect the box as it is now.
 */
export function readClaudePluginLedger(sidebuttonDir: string): ClaudePluginReport[] | null {
  try {
    const file = path.join(sidebuttonDir, 'claude-plugins.json');
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_LEDGER_BYTES) return null;
    const entries = normalizeClaudePluginLedger(JSON.parse(fs.readFileSync(file, 'utf8')));
    return entries.length > 0 ? entries : null;
  } catch {
    return null; // absent, unreadable or unparseable — all "nothing to report"
  }
}
