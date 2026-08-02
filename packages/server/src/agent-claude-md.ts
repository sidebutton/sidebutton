/**
 * Engine-managed block in the agent's user-global `~/.claude/CLAUDE.md` (SCRUM-1830 T3).
 *
 * Claude Code loads `~/.claude/CLAUDE.md` into EVERY session's context, whatever the cwd — which
 * makes it the right home for agent-wide operating instructions like tracker access. Putting them
 * here instead of into workflow prompts is deliberate policy: prompts describe the TASK, context
 * describes the ENVIRONMENT, and an auth instruction embedded in N workflow YAMLs across the engine
 * defaults and every pack registry is N copies that drift (the 2026-08-01 incident shipped a prompt
 * fix that reached none of them). One canonical file, delivered by the engine the fleet already
 * self-updates, replaces all of that.
 *
 * The canonical text lives at `defaults/claude/CLAUDE.md` — markers included — so the same file can
 * be appended verbatim to a WORKSPACE-level CLAUDE.md where a repo wants it pinned locally (the
 * portal side can vendor it for workspace applies; this module only manages the user-global copy).
 *
 * Write semantics (the reconcile contract):
 *  - the managed span is delimited by `<!-- sidebutton:tracker-access:<ver>:begin/end -->` markers;
 *    matching is on the marker NAME, not the version, so shipping a v2 replaces a v1 block instead
 *    of stacking beside it;
 *  - text outside the span — the operator's own instructions — is NEVER touched; a missing span is
 *    appended at the end, a stale span is replaced in place, an identical span is a no-op (so the
 *    serve-start call is idempotent and journal-quiet);
 *  - best-effort by contract: every failure path returns a status instead of throwing, because
 *    server startup must never die on a context nicety.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const MARKER_SPAN_RE =
  /<!-- sidebutton:tracker-access:[\w.-]+:begin -->[\s\S]*?<!-- sidebutton:tracker-access:[\w.-]+:end -->/;

export interface EnsureClaudeMdResult {
  status: 'created' | 'updated' | 'unchanged' | 'skipped' | 'failed';
  detail?: string;
}

/** `defaults/claude/CLAUDE.md` resolved from both src/ and dist/ layouts (the cli.ts pattern). */
export function defaultAgentClaudeMdPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../defaults/claude/CLAUDE.md');
}

/**
 * Ensure `~/.claude/CLAUDE.md` carries the current canonical managed block. Returns what happened;
 * never throws.
 */
export function ensureAgentClaudeMd(
  opts: { homeDir?: string; canonicalFile?: string } = {},
): EnsureClaudeMdResult {
  try {
    const canonicalFile = opts.canonicalFile ?? defaultAgentClaudeMdPath();
    if (!fs.existsSync(canonicalFile)) {
      return { status: 'skipped', detail: `no canonical file at ${canonicalFile}` };
    }
    const canonical = fs.readFileSync(canonicalFile, 'utf8').trim();
    if (!MARKER_SPAN_RE.test(canonical)) {
      return { status: 'skipped', detail: 'canonical file carries no managed-block markers' };
    }

    const claudeDir = path.join(opts.homeDir ?? os.homedir(), '.claude');
    const target = path.join(claudeDir, 'CLAUDE.md');

    if (!fs.existsSync(target)) {
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(target, `${canonical}\n`);
      return { status: 'created' };
    }

    const existing = fs.readFileSync(target, 'utf8');
    const span = existing.match(MARKER_SPAN_RE);
    if (!span) {
      const sep = existing.endsWith('\n') ? '\n' : '\n\n';
      fs.writeFileSync(target, `${existing}${sep}${canonical}\n`);
      return { status: 'updated', detail: 'block appended' };
    }
    if (span[0] === canonical) {
      return { status: 'unchanged' };
    }
    fs.writeFileSync(target, existing.replace(MARKER_SPAN_RE, canonical));
    return { status: 'updated', detail: 'block replaced' };
  } catch (err) {
    return { status: 'failed', detail: err instanceof Error ? err.message : String(err) };
  }
}
