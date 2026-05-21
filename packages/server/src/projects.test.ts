import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  resolveSubpath,
  expandHome,
  sanitizeMessage,
  applyProject,
  applyProjects,
  statusProject,
  resetProject,
} from './projects.js';

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]) {
  return exec('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
}

describe('resolveSubpath (path safety)', () => {
  it('resolves an empty subpath to workspace_path', () => {
    const r = resolveSubpath('/tmp/work', '');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.workspaceAbs).toBe('/tmp/work');
      expect(r.target).toBe('/tmp/work');
    }
  });

  it('resolves a nested subpath', () => {
    const r = resolveSubpath('/tmp/work', 'apps/api');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.target).toBe('/tmp/work/apps/api');
  });

  it('rejects "..\" escape', () => {
    const r = resolveSubpath('/tmp/work', '..');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/escapes/);
  });

  it('rejects multi-segment ".." escape', () => {
    const r = resolveSubpath('/tmp/work', 'a/../../etc');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/escapes/);
  });

  it('rejects absolute subpath', () => {
    const r = resolveSubpath('/tmp/work', '/etc/passwd');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/relative/);
  });

  it('normalizes "./" subpath safely', () => {
    const r = resolveSubpath('/tmp/work', './apps/./api');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.target).toBe('/tmp/work/apps/api');
  });

  it('rejects missing workspace_path', () => {
    const r = resolveSubpath('', 'a');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/workspace_path/);
  });

  it('expands leading ~ in workspace_path', () => {
    const home = process.env.HOME || '/home/agent';
    const r = resolveSubpath('~/foo', 'bar');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.target).toBe(path.join(home, 'foo', 'bar'));
  });

  it('a subpath of exactly ".." is rejected', () => {
    const r = resolveSubpath('/a/b/c', '..');
    expect(r.ok).toBe(false);
  });
});

describe('expandHome', () => {
  it('expands "~/x" to $HOME/x', () => {
    const home = process.env.HOME || '/home/agent';
    expect(expandHome('~/x')).toBe(path.join(home, 'x'));
  });
  it('expands lone "~" to $HOME', () => {
    const home = process.env.HOME || '/home/agent';
    expect(expandHome('~')).toBe(home);
  });
  it('leaves absolute paths untouched', () => {
    expect(expandHome('/abs/path')).toBe('/abs/path');
  });
});

describe('sanitizeMessage', () => {
  it('redacts userinfo from URLs', () => {
    const out = sanitizeMessage('fatal: could not read from https://x-access-token:ghp_xyz@github.com/o/r.git');
    expect(out).not.toContain('ghp_xyz');
    expect(out).toContain('***:***');
  });
  it('returns empty string for empty input', () => {
    expect(sanitizeMessage('')).toBe('');
  });
});

describe('git roundtrip', () => {
  let workdir: string;
  let bareDir: string;
  let bareCloneUrl: string;

  beforeAll(async () => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-projects-test-'));
    // Build a bare repo with one commit on `main`.
    const seed = path.join(workdir, 'seed');
    fs.mkdirSync(seed, { recursive: true });
    await git(seed, 'init', '-b', 'main');
    await git(seed, 'config', 'user.email', 'test@example.com');
    await git(seed, 'config', 'user.name', 'Test');
    fs.writeFileSync(path.join(seed, 'README.md'), 'hello\n');
    await git(seed, 'add', '.');
    await git(seed, 'commit', '-m', 'initial');
    bareDir = path.join(workdir, 'origin.git');
    await git(workdir, 'clone', '--bare', seed, bareDir);
    bareCloneUrl = bareDir;
  });

  afterAll(() => {
    if (workdir) fs.rmSync(workdir, { recursive: true, force: true });
  });

  it('applyProject clones a fresh checkout with no embedded credentials', async () => {
    const ws = path.join(workdir, 'ws-clone');
    const r = await applyProject(ws, {
      repo_url: bareCloneUrl,
      branch: 'main',
      subpath: 'apps/api',
    });
    expect(r).toEqual({ subpath: 'apps/api', ok: true });
    const target = path.join(ws, 'apps/api');
    expect(fs.existsSync(path.join(target, '.git'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'README.md'))).toBe(true);

    // Clone URL was the plain repo_url — agent's gh credential helper supplies auth.
    const config = fs.readFileSync(path.join(target, '.git', 'config'), 'utf8');
    expect(config).not.toContain('ghp_');
    expect(config).not.toContain('x-access-token');
  });

  it('applyProject clones into a workspace dir that already holds CLAUDE.md and .mcp.json', async () => {
    // Reproduces the "fatal: destination path already exists and is not an empty
    // directory" failure that happened when subpath='' and workspace.path holds
    // workspace metadata written by config/apply before projects/apply runs.
    const ws = path.join(workdir, 'ws-meta');
    fs.mkdirSync(ws, { recursive: true });
    fs.writeFileSync(path.join(ws, 'CLAUDE.md'), '# from workspace config\n');
    fs.writeFileSync(path.join(ws, '.mcp.json'), '{"workspace":"yes"}');

    const r = await applyProject(ws, { repo_url: bareCloneUrl, branch: 'main', subpath: '' });
    expect(r).toEqual({ subpath: '', ok: true });
    expect(fs.existsSync(path.join(ws, '.git'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'README.md'))).toBe(true);
    // Workspace metadata wins over anything from the cloned repo.
    expect(fs.readFileSync(path.join(ws, 'CLAUDE.md'), 'utf8')).toBe('# from workspace config\n');
    expect(fs.readFileSync(path.join(ws, '.mcp.json'), 'utf8')).toBe('{"workspace":"yes"}');
    // No stash dir left behind alongside the target.
    const sib = fs.readdirSync(workdir).filter((e) => e.startsWith('ws-meta.sb-stash-'));
    expect(sib).toEqual([]);
  });

  it('applyProject refuses to clone into a non-empty dir with unknown files', async () => {
    const ws = path.join(workdir, 'ws-unknown');
    fs.mkdirSync(ws, { recursive: true });
    fs.writeFileSync(path.join(ws, 'random.txt'), 'not a workspace file');

    const r = await applyProject(ws, { repo_url: bareCloneUrl, branch: 'main', subpath: '' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unexpected files.*random\.txt/);
    // Pre-existing file untouched.
    expect(fs.readFileSync(path.join(ws, 'random.txt'), 'utf8')).toBe('not a workspace file');
  });

  it('applyProject fast-forwards an existing checkout when remote moves ahead', async () => {
    const ws = path.join(workdir, 'ws-ff');
    await applyProject(ws, {
      repo_url: bareCloneUrl,
      branch: 'main',
      subpath: 'svc',
    });
    const target = path.join(ws, 'svc');

    // Push a new commit into the bare repo via a side clone.
    const side = path.join(workdir, 'side');
    await git(workdir, 'clone', bareCloneUrl, side);
    await git(side, 'config', 'user.email', 'test@example.com');
    await git(side, 'config', 'user.name', 'Test');
    fs.writeFileSync(path.join(side, 'extra.txt'), 'more\n');
    await git(side, 'add', '.');
    await git(side, 'commit', '-m', 'extra');
    await git(side, 'push', 'origin', 'main');

    const r = await applyProject(ws, {
      repo_url: bareCloneUrl,
      branch: 'main',
      subpath: 'svc',
    });
    expect(r).toEqual({ subpath: 'svc', ok: true });
    expect(fs.existsSync(path.join(target, 'extra.txt'))).toBe(true);
  });

  it('applyProject moves an existing checkout when prev_subpath differs (rename case)', async () => {
    const ws = path.join(workdir, 'ws-rename');
    await applyProject(ws, {
      repo_url: bareCloneUrl,
      branch: 'main',
      subpath: 'old/api',
    });
    expect(fs.existsSync(path.join(ws, 'old/api/.git'))).toBe(true);

    const r = await applyProject(ws, {
      repo_url: bareCloneUrl,
      branch: 'main',
      subpath: 'new/api',
      prev_subpath: 'old/api',
    });
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(ws, 'new/api/.git'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'old/api'))).toBe(false);
  });

  it('applyProjects returns per-project results and rejects unsafe subpaths', async () => {
    const ws = path.join(workdir, 'ws-multi');
    const results = await applyProjects(ws, [
      { repo_url: bareCloneUrl, branch: 'main', subpath: 'ok' },
      { repo_url: bareCloneUrl, branch: 'main', subpath: '../escape' },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ subpath: 'ok', ok: true });
    expect(results[1].ok).toBe(false);
    expect(results[1].error).toMatch(/escapes/);
  });

  it('statusProject reports sha, subject, and clean working tree', async () => {
    const ws = path.join(workdir, 'ws-status');
    await applyProject(ws, {
      repo_url: bareCloneUrl,
      branch: 'main',
      subpath: 'app',
    });
    const s = await statusProject(ws, { subpath: 'app', branch: 'main' });
    expect(s.error).toBeUndefined();
    expect(s.dirty).toBe(false);
    expect(s.ahead).toBe(0);
    expect(s.behind).toBe(0);
    expect(s.sha).toMatch(/^[0-9a-f]{7,}$/);
    expect(s.subject.length).toBeGreaterThan(0);
  });

  it('statusProject reports dirty=true when the working tree has changes', async () => {
    const ws = path.join(workdir, 'ws-dirty');
    await applyProject(ws, {
      repo_url: bareCloneUrl,
      branch: 'main',
      subpath: 'd',
    });
    fs.writeFileSync(path.join(ws, 'd', 'dirty.txt'), 'x');
    const s = await statusProject(ws, { subpath: 'd', branch: 'main' });
    expect(s.dirty).toBe(true);
  });

  it('statusProject returns an error when the target is not a git repo', async () => {
    const ws = path.join(workdir, 'ws-no-git');
    fs.mkdirSync(ws, { recursive: true });
    const s = await statusProject(ws, { subpath: 'nothing', branch: 'main' });
    expect(s.error).toMatch(/not a git repository/);
  });

  it('resetProject hard-resets a dirty checkout back to origin/{branch}', async () => {
    const ws = path.join(workdir, 'ws-reset');
    await applyProject(ws, {
      repo_url: bareCloneUrl,
      branch: 'main',
      subpath: 'r',
    });
    const target = path.join(ws, 'r');
    fs.writeFileSync(path.join(target, 'README.md'), 'BROKEN');
    fs.writeFileSync(path.join(target, 'untracked.txt'), 'junk');

    const out = await resetProject(ws, 'r', 'main');
    expect(out.ok).toBe(true);
    expect(out.sha).toMatch(/^[0-9a-f]{7,}$/);
    expect(fs.readFileSync(path.join(target, 'README.md'), 'utf8')).not.toBe('BROKEN');
    expect(fs.existsSync(path.join(target, 'untracked.txt'))).toBe(false);
  });

  it('resetProject rejects an unsafe subpath', async () => {
    const ws = path.join(workdir, 'ws-reset-bad');
    const out = await resetProject(ws, '../escape', 'main');
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/escapes/);
  });
});
