/**
 * Skill-pack operations for the agent bridge.
 *
 * Pure helpers used by `POST /api/skills/apply`. Mirrors the structure of
 * projects.ts: thin path-safety layer + a full-set reconcile that is easy
 * to unit-test without a running server.
 *
 * Each managed skill directory is marked with a `.sb-skill-sha` file so
 * applySkills can distinguish SB-owned dirs from user-owned ones and only
 * reconcile-delete what it installed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import { expandHome } from './projects.js';

const SKILLS_DIR = '.claude/skills';
const SHA_MARKER = '.sb-skill-sha';

// Only allow names that are a single safe directory segment: starts with
// alphanumeric, may contain letters, digits, underscores, hyphens, and dots.
const SAFE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_\-.]*$/;

export interface ApplySkill {
  name: string;
  sha: string;
  zip_b64: string;
}

export interface SkillResult {
  name: string;
  ok: boolean;
  status: 'added' | 'updated' | 'skipped' | 'removed' | 'error';
  error?: string;
}

/**
 * Validate a skill name and resolve it to an absolute target path.
 *
 * A skill name must be a single safe directory segment (no separators, no
 * leading dot, not "." or "..") so it cannot escape the skills directory.
 */
export function resolveSkillTarget(
  workspace_path: string,
  name: string,
): { ok: true; skillsDir: string; target: string } | { ok: false; error: string } {
  if (!workspace_path || typeof workspace_path !== 'string') {
    return { ok: false, error: 'workspace_path is required' };
  }
  if (!name || typeof name !== 'string') {
    return { ok: false, error: 'skill name is required' };
  }
  if (name === '.' || name === '..' || /[/\\]/.test(name) || !SAFE_NAME_RE.test(name)) {
    return { ok: false, error: `skill name "${name}" is not a safe single directory segment` };
  }
  const workspaceAbs = path.resolve(expandHome(workspace_path));
  const skillsDir = path.join(workspaceAbs, SKILLS_DIR);
  const target = path.join(skillsDir, name);
  // Defence-in-depth: confirm no escape even after path resolution
  const rel = path.relative(skillsDir, target);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    return { ok: false, error: `skill name "${name}" escapes the skills directory` };
  }
  return { ok: true, skillsDir, target };
}

function unzipSafe(zipBuf: Buffer, targetDir: string): void {
  const zip = new AdmZip(zipBuf);
  const entries = zip.getEntries();
  const prefix = targetDir.endsWith(path.sep) ? targetDir : targetDir + path.sep;
  for (const entry of entries) {
    const entryPath = path.resolve(targetDir, entry.entryName);
    if (entryPath !== targetDir && !entryPath.startsWith(prefix)) {
      throw new Error(`zip-slip: entry "${entry.entryName}" escapes the target directory`);
    }
    if (entry.isDirectory) {
      fs.mkdirSync(entryPath, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(entryPath), { recursive: true });
      fs.writeFileSync(entryPath, entry.getData());
    }
  }
}

/**
 * Full-set reconcile of skills into WORKSPACE/.claude/skills/.
 *
 * For each skill in the manifest:
 *  - If .sb-skill-sha already matches the provided sha → skip.
 *  - Otherwise: remove the existing dir (if any) and unzip fresh.
 *
 * After the manifest loop, any .sb-skill-sha-marked directory absent from
 * the manifest is removed (reconcile-delete). User-created dirs without the
 * marker are never touched.
 */
export async function applySkills(
  workspace_path: string,
  skills: ApplySkill[],
): Promise<SkillResult[]> {
  const results: SkillResult[] = [];
  const manifestNames = new Set<string>();

  for (const skill of skills) {
    const resolved = resolveSkillTarget(workspace_path, skill.name);
    if (!resolved.ok) {
      results.push({ name: String(skill.name ?? ''), ok: false, status: 'error', error: resolved.error });
      continue;
    }

    if (!skill.sha || typeof skill.sha !== 'string') {
      results.push({ name: skill.name, ok: false, status: 'error', error: 'sha is required' });
      continue;
    }
    if (!skill.zip_b64 || typeof skill.zip_b64 !== 'string') {
      results.push({ name: skill.name, ok: false, status: 'error', error: 'zip_b64 is required' });
      continue;
    }

    manifestNames.add(skill.name);
    const { target } = resolved;
    const markerFile = path.join(target, SHA_MARKER);

    // SHA-skip
    try {
      if (fs.existsSync(markerFile)) {
        const stored = fs.readFileSync(markerFile, 'utf8').trim();
        if (stored === skill.sha) {
          results.push({ name: skill.name, ok: true, status: 'skipped' });
          continue;
        }
      }
    } catch {
      // Unreadable marker — proceed with install
    }

    const isUpdate = fs.existsSync(target);

    try {
      const zipBuf = Buffer.from(skill.zip_b64, 'base64');
      if (isUpdate) {
        fs.rmSync(target, { recursive: true, force: true });
      }
      fs.mkdirSync(target, { recursive: true });
      unzipSafe(zipBuf, target);
      fs.writeFileSync(markerFile, skill.sha, 'utf8');
      results.push({ name: skill.name, ok: true, status: isUpdate ? 'updated' : 'added' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name: skill.name, ok: false, status: 'error', error: msg });
    }
  }

  // Reconcile-delete: remove SB-managed dirs absent from the manifest
  try {
    const workspaceAbs = path.resolve(expandHome(workspace_path));
    const skillsDir = path.join(workspaceAbs, SKILLS_DIR);
    if (fs.existsSync(skillsDir)) {
      for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || manifestNames.has(entry.name)) continue;
        const dir = path.join(skillsDir, entry.name);
        if (fs.existsSync(path.join(dir, SHA_MARKER))) {
          fs.rmSync(dir, { recursive: true, force: true });
          results.push({ name: entry.name, ok: true, status: 'removed' });
        }
      }
    }
  } catch {
    // Reconcile failures are non-fatal
  }

  return results;
}
