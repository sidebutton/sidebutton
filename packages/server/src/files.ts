/**
 * Shared-file operations for the agent bridge (SCRUM-1369).
 *
 * Pure helpers used by `POST /api/files/apply`. The portal sends the full set of a workspace's shared
 * files; applyFiles writes each one flat to `WORKSPACE/shared/<name>` and reconciles to that set.
 *
 * Unlike skills (one managed *directory* per skill, marked with an in-dir `.sb-skill-sha` file), the
 * shared files are flat siblings of any user/agent-created file in `shared/`. So ownership is tracked
 * in a single hidden manifest `shared/.sb-files` (a JSON map of name → sha): reconcile only deletes
 * files listed there, never a file the agent itself dropped into `shared/`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { expandHome } from './projects.js';

const SHARED_DIR = 'shared';
/** Hidden ownership manifest (name → sha). Keep in sync with FILES_MANIFEST_NAME in the portal. */
const MANIFEST_NAME = '.sb-files';

// Allowed file names: a single safe path segment. A leading dot IS allowed (e.g. ".env.example"),
// but "." / ".." / separators / the reserved manifest name are not. Keep in sync with the portal's
// isSafeFileName in website/src/lib/workspace-files.ts.
const SAFE_NAME_RE = /^[A-Za-z0-9._][A-Za-z0-9._-]*$/;

/**
 * Per-route body limit for POST /api/files/apply. A single apply carries the full base64-encoded set
 * of a workspace's shared files, so this must exceed the portal's 50 MB/workspace cap once base64-
 * inflated (~67 MB), with headroom. Fastify's default 1 MB limit would 413 even one large file.
 */
export const FILES_APPLY_BODY_LIMIT = 100 * 1024 * 1024; // 100 MB

export interface ApplyFile {
  name: string;
  sha: string;
  content_b64: string;
}

export interface FileResult {
  name: string;
  ok: boolean;
  status: 'added' | 'updated' | 'skipped' | 'removed' | 'error';
  error?: string;
}

function isSafeName(name: string): boolean {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 255 &&
    name !== '.' &&
    name !== '..' &&
    name !== MANIFEST_NAME &&
    !/[/\\]/.test(name) &&
    SAFE_NAME_RE.test(name)
  );
}

/**
 * Validate a file name and resolve it to an absolute path inside WORKSPACE/shared/.
 * The name must be a single safe segment so it cannot escape the shared directory.
 */
export function resolveFileTarget(
  workspace_path: string,
  name: string,
): { ok: true; sharedDir: string; target: string } | { ok: false; error: string } {
  if (!workspace_path || typeof workspace_path !== 'string') {
    return { ok: false, error: 'workspace_path is required' };
  }
  if (!name || typeof name !== 'string') {
    return { ok: false, error: 'file name is required' };
  }
  if (!isSafeName(name)) {
    return { ok: false, error: `file name "${name}" is not a safe single path segment` };
  }
  const workspaceAbs = path.resolve(expandHome(workspace_path));
  const sharedDir = path.join(workspaceAbs, SHARED_DIR);
  const target = path.join(sharedDir, name);
  // Defence-in-depth: a shared file is always a DIRECT child of shared/. (isSafeName already forbids
  // separators and "." / "..", so this only ever fails on a name that slipped through.)
  if (path.dirname(target) !== sharedDir) {
    return { ok: false, error: `file name "${name}" escapes the shared directory` };
  }
  return { ok: true, sharedDir, target };
}

function readManifest(manifestPath: string): Record<string, string> {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') out[k] = v;
      }
      return out;
    }
  } catch {
    // Missing / unreadable / malformed manifest → treat as "nothing owned yet".
  }
  return {};
}

/**
 * Full-set reconcile of shared files into WORKSPACE/shared/.
 *
 * For each file in the request:
 *  - If the manifest records the same sha AND the file still exists on disk → skip.
 *  - Otherwise: write the bytes fresh (added or updated).
 *
 * After the loop, any file recorded in the OLD manifest but absent from this request is reconcile-
 * deleted. Files that were never in the manifest (user/agent-created) are never touched. The new
 * manifest is written last (or removed when empty) so it always reflects exactly what we own.
 */
export async function applyFiles(
  workspace_path: string,
  files: ApplyFile[],
): Promise<FileResult[]> {
  const results: FileResult[] = [];

  const workspaceAbs = path.resolve(expandHome(workspace_path));
  const sharedDir = path.join(workspaceAbs, SHARED_DIR);
  const manifestPath = path.join(sharedDir, MANIFEST_NAME);

  const oldManifest = readManifest(manifestPath);
  const newManifest: Record<string, string> = {};
  // Every name in this request is "claimed" — even if it errors — so a transient write failure never
  // causes the reconcile pass below to delete a previously-good file.
  const incoming = new Set<string>();

  for (const file of files) {
    const name = String(file?.name ?? '');
    incoming.add(name);

    const resolved = resolveFileTarget(workspace_path, name);
    if (!resolved.ok) {
      results.push({ name, ok: false, status: 'error', error: resolved.error });
      continue;
    }
    if (!file.sha || typeof file.sha !== 'string') {
      results.push({ name, ok: false, status: 'error', error: 'sha is required' });
      if (oldManifest[name]) newManifest[name] = oldManifest[name]; // keep prior ownership
      continue;
    }
    if (typeof file.content_b64 !== 'string') {
      results.push({ name, ok: false, status: 'error', error: 'content_b64 is required' });
      if (oldManifest[name]) newManifest[name] = oldManifest[name];
      continue;
    }

    const { target } = resolved;

    // SHA-skip: only when the manifest records the same sha AND the file is actually present.
    if (oldManifest[name] === file.sha && fs.existsSync(target)) {
      newManifest[name] = file.sha;
      results.push({ name, ok: true, status: 'skipped' });
      continue;
    }

    try {
      const buf = Buffer.from(file.content_b64, 'base64');
      const isUpdate = fs.existsSync(target);
      fs.mkdirSync(sharedDir, { recursive: true });
      fs.writeFileSync(target, buf);
      newManifest[name] = file.sha;
      results.push({ name, ok: true, status: isUpdate ? 'updated' : 'added' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name, ok: false, status: 'error', error: msg });
      if (oldManifest[name]) newManifest[name] = oldManifest[name];
    }
  }

  // Reconcile-delete: any file we previously owned that is absent from this request.
  for (const name of Object.keys(oldManifest)) {
    if (incoming.has(name)) continue;
    const resolved = resolveFileTarget(workspace_path, name);
    if (!resolved.ok) continue; // a malformed historical entry — never act outside shared/
    try {
      if (fs.existsSync(resolved.target)) {
        fs.rmSync(resolved.target, { force: true });
        results.push({ name, ok: true, status: 'removed' });
      }
    } catch {
      // Reconcile failures are non-fatal.
    }
  }

  // Persist the new ownership manifest (or remove it when we own nothing, to keep shared/ clean).
  try {
    if (Object.keys(newManifest).length === 0) {
      if (fs.existsSync(manifestPath)) fs.rmSync(manifestPath, { force: true });
    } else {
      fs.mkdirSync(sharedDir, { recursive: true });
      fs.writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2), 'utf8');
    }
  } catch {
    // A manifest write failure is non-fatal for this apply; the next apply re-reconciles.
  }

  return results;
}
