import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { resolveFileTarget, applyFiles, type ApplyFile } from './files.js';

const MANIFEST = '.sb-files';

function toB64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}
function makeFile(name: string, sha: string, content: string): ApplyFile {
  return { name, sha, content_b64: toB64(content) };
}

describe('resolveFileTarget (name safety)', () => {
  it('resolves a valid simple name', () => {
    const r = resolveFileTarget('/tmp/work', 'brand-guide.pdf');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.target).toBe('/tmp/work/shared/brand-guide.pdf');
      expect(r.sharedDir).toBe('/tmp/work/shared');
    }
  });

  it('allows a leading dot (.env.example) — unlike skills', () => {
    const r = resolveFileTarget('/tmp/work', '.env.example');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.target).toBe('/tmp/work/shared/.env.example');
  });

  it('rejects a name containing "/"', () => {
    const r = resolveFileTarget('/tmp/work', 'foo/bar');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/safe single path segment/);
  });

  it('rejects a name containing "\\"', () => {
    expect(resolveFileTarget('/tmp/work', 'foo\\bar').ok).toBe(false);
  });

  it('rejects ".." traversal name', () => {
    const r = resolveFileTarget('/tmp/work', '..');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/safe single path segment/);
  });

  it('rejects "."', () => {
    expect(resolveFileTarget('/tmp/work', '.').ok).toBe(false);
  });

  it('rejects the reserved manifest name', () => {
    expect(resolveFileTarget('/tmp/work', MANIFEST).ok).toBe(false);
  });

  it('rejects an empty name', () => {
    const r = resolveFileTarget('/tmp/work', '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/required/);
  });

  it('rejects missing workspace_path', () => {
    const r = resolveFileTarget('', 'f.txt');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/workspace_path/);
  });

  it('expands ~ in workspace_path', () => {
    const home = process.env.HOME || '/home/agent';
    const r = resolveFileTarget('~/ws', 'f.txt');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.target).toBe(path.join(home, 'ws', 'shared', 'f.txt'));
  });
});

describe('applyFiles', () => {
  let workdir: string;

  beforeAll(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-files-test-'));
  });
  afterAll(() => {
    if (workdir) fs.rmSync(workdir, { recursive: true, force: true });
  });

  function manifestOf(ws: string): Record<string, string> {
    return JSON.parse(fs.readFileSync(path.join(ws, 'shared', MANIFEST), 'utf8'));
  }

  it('add: writes a new file flat to shared/ and records it in the manifest', async () => {
    const ws = path.join(workdir, 'ws-add');
    const results = await applyFiles(ws, [makeFile('.env.example', 'sha-v1', 'KEY=value\n')]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: '.env.example', ok: true, status: 'added' });

    const target = path.join(ws, 'shared', '.env.example');
    expect(fs.readFileSync(target, 'utf8')).toBe('KEY=value\n');
    expect(manifestOf(ws)['.env.example']).toBe('sha-v1');
  });

  it('sha-skip: does not re-write when the sha is unchanged', async () => {
    const ws = path.join(workdir, 'ws-skip');
    await applyFiles(ws, [makeFile('a.txt', 'sha-stable', 'original')]);
    const target = path.join(ws, 'shared', 'a.txt');
    fs.writeFileSync(target, 'CORRUPTED');

    const results = await applyFiles(ws, [makeFile('a.txt', 'sha-stable', 'original')]);
    expect(results[0]).toMatchObject({ name: 'a.txt', ok: true, status: 'skipped' });
    expect(fs.readFileSync(target, 'utf8')).toBe('CORRUPTED'); // not re-written
  });

  it('sha-skip falls through to a fresh write when the file was deleted on disk', async () => {
    const ws = path.join(workdir, 'ws-skip-missing');
    await applyFiles(ws, [makeFile('a.txt', 'sha-1', 'hello')]);
    fs.rmSync(path.join(ws, 'shared', 'a.txt'));
    const results = await applyFiles(ws, [makeFile('a.txt', 'sha-1', 'hello')]);
    expect(results[0]).toMatchObject({ name: 'a.txt', ok: true, status: 'added' });
    expect(fs.readFileSync(path.join(ws, 'shared', 'a.txt'), 'utf8')).toBe('hello');
  });

  it('update: re-writes and updates the manifest when the sha changes', async () => {
    const ws = path.join(workdir, 'ws-update');
    await applyFiles(ws, [makeFile('cfg.json', 'sha-v1', '{"v":1}')]);
    const results = await applyFiles(ws, [makeFile('cfg.json', 'sha-v2', '{"v":2}')]);
    expect(results[0]).toMatchObject({ name: 'cfg.json', ok: true, status: 'updated' });
    expect(fs.readFileSync(path.join(ws, 'shared', 'cfg.json'), 'utf8')).toBe('{"v":2}');
    expect(manifestOf(ws)['cfg.json']).toBe('sha-v2');
  });

  it('reconcile-remove: deletes manifest-owned files absent from the new set', async () => {
    const ws = path.join(workdir, 'ws-reconcile');
    await applyFiles(ws, [
      makeFile('keep.txt', 'sha-keep', 'k'),
      makeFile('remove.txt', 'sha-rm', 'r'),
    ]);
    expect(fs.existsSync(path.join(ws, 'shared', 'remove.txt'))).toBe(true);

    const results = await applyFiles(ws, [makeFile('keep.txt', 'sha-keep', 'k')]);
    const removed = results.find((r) => r.name === 'remove.txt');
    expect(removed).toMatchObject({ name: 'remove.txt', ok: true, status: 'removed' });
    expect(fs.existsSync(path.join(ws, 'shared', 'remove.txt'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'shared', 'keep.txt'))).toBe(true);
    expect(manifestOf(ws)).toEqual({ 'keep.txt': 'sha-keep' });
  });

  it('reconcile-to-zero: an empty set removes all owned files and the manifest itself', async () => {
    const ws = path.join(workdir, 'ws-zero');
    await applyFiles(ws, [makeFile('only.txt', 'sha', 'x')]);
    const results = await applyFiles(ws, []);
    expect(results.find((r) => r.name === 'only.txt')).toMatchObject({ status: 'removed' });
    expect(fs.existsSync(path.join(ws, 'shared', 'only.txt'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'shared', MANIFEST))).toBe(false);
  });

  it('ownership-respect: never deletes a user/agent-created file absent from the manifest', async () => {
    const ws = path.join(workdir, 'ws-userfile');
    const sharedDir = path.join(ws, 'shared');
    fs.mkdirSync(sharedDir, { recursive: true });
    // A file the agent itself wrote into shared/ — not in any SB manifest.
    fs.writeFileSync(path.join(sharedDir, 'agent-output.txt'), 'mine');

    // Apply one managed file, then reconcile-to-zero — the user file must survive both passes.
    await applyFiles(ws, [makeFile('managed.txt', 'sha', 'm')]);
    expect(fs.existsSync(path.join(sharedDir, 'agent-output.txt'))).toBe(true);
    const results = await applyFiles(ws, []);
    expect(results.some((r) => r.name === 'agent-output.txt')).toBe(false);
    expect(fs.existsSync(path.join(sharedDir, 'agent-output.txt'))).toBe(true);
  });

  it('name guard: rejects an unsafe name in the set and continues with the rest', async () => {
    const ws = path.join(workdir, 'ws-nameguard');
    const results = await applyFiles(ws, [
      makeFile('good.txt', 'sha-g', 'ok'),
      { name: '../escape', sha: 'sha-b', content_b64: toB64('bad') },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ name: 'good.txt', ok: true, status: 'added' });
    expect(results[1]).toMatchObject({ ok: false, status: 'error' });
    expect(results[1].error).toMatch(/safe single path segment/);
    // The traversal target was never written outside shared/.
    expect(fs.existsSync(path.join(workdir, 'escape'))).toBe(false);
  });
});
