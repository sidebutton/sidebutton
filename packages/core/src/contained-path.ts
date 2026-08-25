/**
 * Containment for agent-supplied output paths, and the write that follows it.
 *
 * Both writers of agent-produced files — the `browser.screenshot` DSL step and the
 * `screenshot` MCP tool's `path` option — funnel through here so there is exactly one
 * containment rule to audit and it cannot drift between the two call sites. The decode
 * and the write live here too (`writeCapturedImage`), for the same reason: the data-URL
 * strip and the 0600 mode are security-relevant and were previously duplicated.
 *
 * Why this is a hard gate rather than a nicety: POST /mcp sits outside the bearer hook
 * (server.ts guards only /api/*), so on a wide bind `run_workflow` is reachable without a
 * token. An unconstrained output path would compose that into a remotely reachable
 * arbitrary file write. Mirrors the rule publish_artifact already enforces on the read
 * side, so anything written here is directly publishable.
 */

import { chmodSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { WorkflowError } from './types.js';

function expandHome(p: string, home: string): string {
  if (p === '~') return home;
  if (p.startsWith('~/')) return home + p.slice(1);
  return p;
}

/** Strictly below `parent` — excludes `parent` itself, which is never a valid file target. */
function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/** Below `parent`, or `parent` itself — the home directory is a legitimate place to write into. */
function isAtOrInside(parent: string, child: string): boolean {
  return child === parent || isInside(parent, child);
}

/**
 * Walk up from `p` to the first path that exists on disk (lstat, so a symlink counts as
 * existing and its target is resolved by the caller). Always terminates: dirname() is a
 * fixed point at the filesystem root, which always exists.
 */
function deepestExisting(p: string): string {
  let cur = p;
  for (;;) {
    try {
      lstatSync(cur);
      return cur;
    } catch {
      const up = dirname(cur);
      if (up === cur) return cur;
      cur = up;
    }
  }
}

/**
 * Resolve an agent-supplied output path, contain it to the home directory, and make sure
 * its parent directory exists so the caller can write straight to the returned path.
 *
 * - `~/…` expands; a relative path resolves against ~/workspace, matching publish_artifact
 *   so the same string means the same file to both tools.
 * - Containment is checked twice: lexically before any directory is created, then again on
 *   the realpath of the parent, which is what catches a symlinked directory escape.
 * - An existing symlink at the target is refused outright — writeFileSync would follow it
 *   out of the home directory.
 *
 * @throws WorkflowError with code PATH_ERROR when the path is empty or escapes home.
 */
export function resolveContainedPath(rawPath: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  let homeReal: string;
  try { homeReal = realpathSync(home); } catch { homeReal = home; }

  const trimmed = (rawPath ?? '').trim();
  if (!trimmed) {
    throw new WorkflowError('A "path" is required to write the file to.', 'PATH_ERROR');
  }

  const expanded = expandHome(trimmed, home);
  const target = isAbsolute(expanded)
    ? resolve(expanded)
    : resolve(join(home, 'workspace'), expanded);

  const reject = (detail: string): never => {
    throw new WorkflowError(
      `Refusing to write "${rawPath}": ${detail}. Only paths under the home directory (${homeReal}) are allowed.`,
      'PATH_ERROR'
    );
  };

  // Lexical check first — before any mkdir, so a traversal never creates directories.
  if (!isInside(homeReal, target) && !isInside(home, target)) {
    reject(`it resolves to ${target}, outside the home directory`);
  }

  const parent = dirname(target);

  // Containment on the deepest ancestor that already exists, BEFORE mkdir. The lexical check
  // above cannot see a symlink: `~/link/a/b.png` where ~/link points at /var/tmp is lexically
  // inside home, and a recursive mkdir would follow the link and create /var/tmp/a for real
  // before the post-mkdir realpath check below rejected it. Resolving the existing anchor
  // first means a refused path leaves nothing behind anywhere.
  const anchor = deepestExisting(parent);
  let anchorReal: string;
  try { anchorReal = realpathSync(anchor); } catch { anchorReal = anchor; }
  if (!isAtOrInside(homeReal, anchorReal)) {
    reject(`its nearest existing directory resolves to ${anchorReal}, outside the home directory`);
  }

  try {
    mkdirSync(parent, { recursive: true });
  } catch (err) {
    throw new WorkflowError(
      `Could not create directory ${parent}: ${err instanceof Error ? err.message : String(err)}`,
      'PATH_ERROR'
    );
  }

  // Second check on the real parent: catches an escape through a symlinked directory.
  let parentReal: string;
  try {
    parentReal = realpathSync(parent);
  } catch (err) {
    throw new WorkflowError(
      `Could not resolve directory ${parent}: ${err instanceof Error ? err.message : String(err)}`,
      'PATH_ERROR'
    );
  }
  if (!isAtOrInside(homeReal, parentReal)) {
    reject(`its directory resolves to ${parentReal}, outside the home directory`);
  }

  // basename, not a slice off `parent`: when the parent is the filesystem root, `parent` is
  // "/" and a length-based slice eats the first character of the filename.
  const finalPath = join(parentReal, basename(target));

  // A symlink sitting at the target would be followed by writeFileSync, so it escapes even
  // though the parent directory is contained. Note the lstat is kept out of the rejection
  // path: throwing inside the try would be swallowed by its own catch.
  let targetIsSymlink = false;
  try {
    targetIsSymlink = lstatSync(finalPath).isSymbolicLink();
  } catch {
    // Does not exist yet — the normal case.
  }
  if (targetIsSymlink) {
    reject('the target is a symlink');
  }

  return finalPath;
}

/**
 * Decode a captured PNG and write it to an already-contained path. Returns the byte count.
 *
 * Shared by the `browser.screenshot` step and the `screenshot` MCP tool so the two cannot
 * drift on the parts that matter:
 *
 * - The extension may send a bare base64 payload or a full data URL. Keeping the prefix
 *   yields a corrupt PNG that still reports success, so it is stripped here.
 * - An explicit chmod follows the write. `writeFileSync`'s `mode` applies only when the file
 *   is CREATED — overwriting an existing 0644 file silently leaves it 0644, and a shot can
 *   hold pre-redaction pixels, so the tightening has to be unconditional.
 * - The write is a full overwrite of a fixed path, never a timestamped name: every
 *   non-control step is retried up to MAX_RETRIES times, and a retry must land on the same
 *   file rather than leaving a numbered trail.
 *
 * @throws WorkflowError with code EXTENSION_ERROR when the capture came back empty.
 */
export function writeCapturedImage(imageData: string, outPath: string): number {
  const base64 = (imageData ?? '').replace(/^data:image\/png;base64,/, '');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) {
    throw new WorkflowError('Screenshot returned empty image data', 'EXTENSION_ERROR');
  }

  writeFileSync(outPath, bytes, { mode: 0o600 });
  chmodSync(outPath, 0o600);
  return bytes.length;
}
