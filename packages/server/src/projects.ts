/**
 * Git project operations for the agent bridge.
 *
 * Pure helpers used by `POST /api/projects/apply`, `GET /api/projects/status`
 * and `POST /api/projects/reset`. Keeping git invocation isolated here makes
 * the routes thin and the path-safety logic easy to unit-test.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

const GIT_OP_TIMEOUT = 60_000;
const GIT_CLONE_TIMEOUT = 600_000;
const GIT_MAX_BUFFER = 10 * 1024 * 1024;

export interface ApplyProject {
  repo_url: string;
  branch: string;
  subpath?: string | null;
  prev_subpath?: string | null;
}

export interface ApplyResult {
  subpath: string;
  ok: boolean;
  error?: string;
}

export interface StatusProject {
  subpath?: string | null;
  branch: string;
}

export interface StatusResult {
  subpath: string;
  branch: string;
  dirty: boolean;
  ahead: number;
  behind: number;
  sha: string;
  subject: string;
  error?: string;
}

export interface ResetResult {
  ok: boolean;
  sha?: string;
  error?: string;
}

export interface ConfigFileStat {
  size: number;
  mtime: string;
}

export interface ConfigFiles {
  claude_md: ConfigFileStat | null;
  mcp_json: ConfigFileStat | null;
}

export interface ResolvedTarget {
  ok: true;
  workspaceAbs: string;
  target: string;
}

export interface ResolveError {
  ok: false;
  error: string;
}

const HOME_FALLBACK = '/home/agent';

export function expandHome(p: string): string {
  if (!p) return p;
  if (p === '~' || p.startsWith('~/')) {
    const home = process.env.HOME || process.env.USERPROFILE || HOME_FALLBACK;
    return path.join(home, p.slice(1));
  }
  return p;
}

/**
 * Resolve a workspace_path + subpath into an absolute target directory.
 *
 * Rejects:
 *  - missing workspace_path
 *  - absolute subpath (must be relative)
 *  - subpath that resolves outside workspace_path (e.g. "..", "../etc")
 */
export function resolveSubpath(
  workspace_path: string,
  subpath: string | null | undefined,
): ResolvedTarget | ResolveError {
  if (!workspace_path || typeof workspace_path !== 'string') {
    return { ok: false, error: 'workspace_path is required' };
  }
  const workspaceAbs = path.resolve(expandHome(workspace_path));
  const sub = (subpath ?? '').trim();
  if (sub && path.isAbsolute(sub)) {
    return { ok: false, error: 'subpath must be relative' };
  }
  const target = path.resolve(workspaceAbs, sub);
  const rel = path.relative(workspaceAbs, target);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    return { ok: false, error: 'subpath escapes workspace_path' };
  }
  return { ok: true, workspaceAbs, target };
}

/**
 * Strip credentials embedded in a URL (e.g. `https://x-access-token:ghp_xxx@host/...`).
 * Returned text is safe to include in error messages and logs.
 */
export function sanitizeMessage(input: string): string {
  if (!input) return '';
  return input.replace(/https?:\/\/[^@/\s]+:[^@/\s]+@/g, 'https://***:***@');
}

function execError(err: unknown): string {
  if (err && typeof err === 'object') {
    const anyErr = err as { stderr?: string; stdout?: string; message?: string };
    const text = anyErr.stderr || anyErr.message || anyErr.stdout || String(err);
    return sanitizeMessage(text.toString().trim());
  }
  return sanitizeMessage(String(err));
}

async function runGit(cwd: string, args: string[], timeout = GIT_OP_TIMEOUT): Promise<{ stdout: string; stderr: string }> {
  const res = await execFileAsync('git', args, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout,
    maxBuffer: GIT_MAX_BUFFER,
  });
  return { stdout: res.stdout.toString(), stderr: res.stderr.toString() };
}

async function gitClone(cloneUrl: string, target: string): Promise<void> {
  await execFileAsync('git', ['clone', cloneUrl, target], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: GIT_CLONE_TIMEOUT,
    maxBuffer: GIT_MAX_BUFFER,
  });
}

function isRepo(dir: string): boolean {
  try {
    return fs.statSync(path.join(dir, '.git')).isDirectory()
      || fs.statSync(path.join(dir, '.git')).isFile();
  } catch {
    return false;
  }
}

async function checkoutAndFastForward(repoDir: string, branch: string): Promise<void> {
  await runGit(repoDir, ['fetch', 'origin']);
  await runGit(repoDir, ['checkout', branch]);
  await runGit(repoDir, ['pull', '--ff-only']);
}

/**
 * Apply one project — clone if missing, otherwise fetch + checkout + ff-pull.
 * Clone authentication is handled by the local `gh auth git-credential` helper
 * configured by `setup-autostart.sh`; the website never injects tokens into the
 * URL, so `.git/config` stays clean.
 */
export async function applyProject(workspace_path: string, project: ApplyProject): Promise<ApplyResult> {
  const sub = (project.subpath ?? '').trim();
  const resolved = resolveSubpath(workspace_path, sub);
  if (!resolved.ok) {
    return { subpath: sub, ok: false, error: resolved.error };
  }
  const { workspaceAbs, target } = resolved;

  if (!project.repo_url || typeof project.repo_url !== 'string') {
    return { subpath: sub, ok: false, error: 'repo_url is required' };
  }
  if (!project.branch || typeof project.branch !== 'string') {
    return { subpath: sub, ok: false, error: 'branch is required' };
  }

  try {
    fs.mkdirSync(workspaceAbs, { recursive: true });

    if (project.prev_subpath && project.prev_subpath !== sub) {
      const prev = resolveSubpath(workspace_path, project.prev_subpath);
      if (prev.ok && isRepo(prev.target) && !isRepo(target)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.renameSync(prev.target, target);
      }
    }

    if (!isRepo(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await gitClone(project.repo_url, target);
      try {
        await checkoutAndFastForward(target, project.branch);
      } catch (err) {
        return { subpath: sub, ok: false, error: execError(err) };
      }
    } else {
      await checkoutAndFastForward(target, project.branch);
    }

    return { subpath: sub, ok: true };
  } catch (err) {
    return { subpath: sub, ok: false, error: execError(err) };
  }
}

export async function applyProjects(workspace_path: string, projects: ApplyProject[]): Promise<ApplyResult[]> {
  const out: ApplyResult[] = [];
  for (const project of projects) {
    out.push(await applyProject(workspace_path, project));
  }
  return out;
}

/**
 * Read local-only status for one project. Does NOT fetch — ahead/behind reflects
 * whatever the last `apply` (or manual fetch) wrote into `origin/<branch>`.
 */
export async function statusProject(workspace_path: string, project: StatusProject): Promise<StatusResult> {
  const sub = (project.subpath ?? '').trim();
  const base: StatusResult = {
    subpath: sub,
    branch: project.branch ?? '',
    dirty: false,
    ahead: 0,
    behind: 0,
    sha: '',
    subject: '',
  };
  const resolved = resolveSubpath(workspace_path, sub);
  if (!resolved.ok) {
    return { ...base, error: resolved.error };
  }
  if (!project.branch || typeof project.branch !== 'string') {
    return { ...base, error: 'branch is required' };
  }
  if (!isRepo(resolved.target)) {
    return { ...base, error: 'not a git repository' };
  }
  try {
    const statusOut = await runGit(resolved.target, ['status', '--porcelain']);
    base.dirty = statusOut.stdout.trim() !== '';
  } catch (err) {
    return { ...base, error: execError(err) };
  }

  try {
    const rl = await runGit(resolved.target, ['rev-list', '--left-right', '--count', `${project.branch}...origin/${project.branch}`]);
    const parts = rl.stdout.trim().split(/\s+/);
    base.ahead = Number.parseInt(parts[0] ?? '0', 10) || 0;
    base.behind = Number.parseInt(parts[1] ?? '0', 10) || 0;
  } catch {
    // origin/<branch> may not exist locally yet — leave ahead/behind = 0.
  }

  try {
    const log = await runGit(resolved.target, ['log', '-1', '--format=%h%x09%s']);
    const line = log.stdout.replace(/\n$/, '');
    const tab = line.indexOf('\t');
    if (tab >= 0) {
      base.sha = line.slice(0, tab);
      base.subject = line.slice(tab + 1);
    } else {
      base.sha = line;
    }
  } catch (err) {
    return { ...base, error: execError(err) };
  }

  return base;
}

export async function statusProjects(workspace_path: string, projects: StatusProject[]): Promise<StatusResult[]> {
  const out: StatusResult[] = [];
  for (const project of projects) {
    out.push(await statusProject(workspace_path, project));
  }
  return out;
}

async function statOne(filePath: string): Promise<ConfigFileStat | null> {
  try {
    const st = await fs.promises.stat(filePath);
    return { size: st.size, mtime: st.mtime.toISOString() };
  } catch {
    // ENOENT (or any stat failure) → treat the file as absent.
    return null;
  }
}

/**
 * Stat the agent's per-workspace config files (`CLAUDE.md`, `.mcp.json`) so the
 * portal's workspace matrix can show their on-disk size + last-modified time.
 * The agent is the only honest source of this state — `/api/config/apply`
 * writes these files but nothing reported them back.
 *
 * Two `fs.stat` calls, no content reads, so it stays well within the portal's
 * 5s status budget. A missing file resolves to `null` (not an error).
 */
export async function statConfigFiles(workspace_path: string): Promise<ConfigFiles> {
  const resolved = resolveSubpath(workspace_path, '');
  if (!resolved.ok) {
    return { claude_md: null, mcp_json: null };
  }
  const [claude_md, mcp_json] = await Promise.all([
    statOne(path.join(resolved.target, 'CLAUDE.md')),
    statOne(path.join(resolved.target, '.mcp.json')),
  ]);
  return { claude_md, mcp_json };
}

export async function resetProject(workspace_path: string, subpath: string | null | undefined, branch: string): Promise<ResetResult> {
  const resolved = resolveSubpath(workspace_path, subpath);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }
  if (!branch || typeof branch !== 'string') {
    return { ok: false, error: 'branch is required' };
  }
  if (!isRepo(resolved.target)) {
    return { ok: false, error: 'not a git repository' };
  }
  try {
    await runGit(resolved.target, ['fetch', 'origin']);
    await runGit(resolved.target, ['reset', '--hard', `origin/${branch}`]);
    await runGit(resolved.target, ['clean', '-fdx']);
    const log = await runGit(resolved.target, ['log', '-1', '--format=%h']);
    return { ok: true, sha: log.stdout.trim() };
  } catch (err) {
    return { ok: false, error: execError(err) };
  }
}
