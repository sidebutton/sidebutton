import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import AdmZip from 'adm-zip';
import { resolveSkillTarget, applySkills, type ApplySkill } from './skills.js';

const SHA_MARKER = '.sb-skill-sha';

function makeZip(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(content, 'utf8'));
  }
  return zip.toBuffer();
}

// Raw zip builder: creates a zip with exact entry names — bypasses AdmZip's
// path normalization so we can test with genuine "../" traversal entries.
function rawZipCrc32(buf: Buffer): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ (table[(crc ^ buf[i]!) & 0xff] ?? 0);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeRawZip(entryName: string, content: string): Buffer {
  const data = Buffer.from(content, 'utf8');
  const name = Buffer.from(entryName, 'utf8');
  const crc = rawZipCrc32(data);

  const lfh = Buffer.alloc(30 + name.length);
  lfh.writeUInt32LE(0x04034b50, 0); lfh.writeUInt16LE(20, 4); lfh.writeUInt16LE(0, 6);
  lfh.writeUInt16LE(0, 8); lfh.writeUInt16LE(0, 10); lfh.writeUInt16LE(0, 12);
  lfh.writeUInt32LE(crc, 14); lfh.writeUInt32LE(data.length, 18); lfh.writeUInt32LE(data.length, 22);
  lfh.writeUInt16LE(name.length, 26); lfh.writeUInt16LE(0, 28); name.copy(lfh, 30);

  const localData = Buffer.concat([lfh, data]);

  const cdfh = Buffer.alloc(46 + name.length);
  cdfh.writeUInt32LE(0x02014b50, 0); cdfh.writeUInt16LE(20, 4); cdfh.writeUInt16LE(20, 6);
  cdfh.writeUInt16LE(0, 8); cdfh.writeUInt16LE(0, 10); cdfh.writeUInt16LE(0, 12);
  cdfh.writeUInt16LE(0, 14); cdfh.writeUInt32LE(crc, 16); cdfh.writeUInt32LE(data.length, 20);
  cdfh.writeUInt32LE(data.length, 24); cdfh.writeUInt16LE(name.length, 28);
  cdfh.writeUInt16LE(0, 30); cdfh.writeUInt16LE(0, 32); cdfh.writeUInt16LE(0, 34);
  cdfh.writeUInt16LE(0, 36); cdfh.writeUInt32LE(0, 38); cdfh.writeUInt32LE(0, 42);
  name.copy(cdfh, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(cdfh.length, 12);
  eocd.writeUInt32LE(localData.length, 16); eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localData, cdfh, eocd]);
}

function toB64(buf: Buffer): string {
  return buf.toString('base64');
}

function makeSkill(name: string, sha: string, files: Record<string, string>): ApplySkill {
  return { name, sha, zip_b64: toB64(makeZip(files)) };
}

describe('resolveSkillTarget (name safety)', () => {
  it('resolves a valid simple name', () => {
    const r = resolveSkillTarget('/tmp/work', 'my-skill');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.target).toBe('/tmp/work/.claude/skills/my-skill');
      expect(r.skillsDir).toBe('/tmp/work/.claude/skills');
    }
  });

  it('allows underscores and dots in the name', () => {
    const r = resolveSkillTarget('/tmp/work', 'skill_pack.v2');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.target).toBe('/tmp/work/.claude/skills/skill_pack.v2');
  });

  it('rejects a name containing "/"', () => {
    const r = resolveSkillTarget('/tmp/work', 'foo/bar');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/safe single directory segment/);
  });

  it('rejects ".." traversal name', () => {
    const r = resolveSkillTarget('/tmp/work', '..');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/safe single directory segment/);
  });

  it('rejects a name starting with "."', () => {
    const r = resolveSkillTarget('/tmp/work', '.hidden');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/safe single directory segment/);
  });

  it('rejects an empty name', () => {
    const r = resolveSkillTarget('/tmp/work', '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/required/);
  });

  it('rejects missing workspace_path', () => {
    const r = resolveSkillTarget('', 'skill');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/workspace_path/);
  });

  it('expands ~ in workspace_path', () => {
    const home = process.env.HOME || '/home/agent';
    const r = resolveSkillTarget('~/ws', 'sk');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.target).toBe(path.join(home, 'ws', '.claude', 'skills', 'sk'));
  });
});

describe('applySkills', () => {
  let workdir: string;

  beforeAll(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-skills-test-'));
  });

  afterAll(() => {
    if (workdir) fs.rmSync(workdir, { recursive: true, force: true });
  });

  it('add: installs a new skill and writes the SHA marker', async () => {
    const ws = path.join(workdir, 'ws-add');
    const skill = makeSkill('tool-a', 'sha-v1', { '_skill.md': '# Tool A\n' });

    const results = await applySkills(ws, [skill]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: 'tool-a', ok: true, status: 'added' });

    const target = path.join(ws, '.claude', 'skills', 'tool-a');
    expect(fs.existsSync(path.join(target, '_skill.md'))).toBe(true);
    expect(fs.readFileSync(path.join(target, SHA_MARKER), 'utf8').trim()).toBe('sha-v1');
  });

  it('sha-skip: does not re-extract when SHA is unchanged', async () => {
    const ws = path.join(workdir, 'ws-skip');
    const skill = makeSkill('tool-b', 'sha-stable', { '_skill.md': '# Tool B\n' });

    await applySkills(ws, [skill]);
    // Corrupt the file — if re-extracted the original content would be restored,
    // but sha-skip should prevent any write.
    const target = path.join(ws, '.claude', 'skills', 'tool-b', '_skill.md');
    fs.writeFileSync(target, 'CORRUPTED');

    const results = await applySkills(ws, [skill]);
    expect(results[0]).toMatchObject({ name: 'tool-b', ok: true, status: 'skipped' });
    // Corrupted content remains — confirms no re-extraction
    expect(fs.readFileSync(target, 'utf8')).toBe('CORRUPTED');
  });

  it('update: re-extracts and updates marker when SHA changes', async () => {
    const ws = path.join(workdir, 'ws-update');
    const v1 = makeSkill('tool-c', 'sha-v1', { '_skill.md': '# v1\n' });
    await applySkills(ws, [v1]);

    const v2 = makeSkill('tool-c', 'sha-v2', { '_skill.md': '# v2\n' });
    const results = await applySkills(ws, [v2]);
    expect(results[0]).toMatchObject({ name: 'tool-c', ok: true, status: 'updated' });

    const target = path.join(ws, '.claude', 'skills', 'tool-c');
    expect(fs.readFileSync(path.join(target, '_skill.md'), 'utf8')).toBe('# v2\n');
    expect(fs.readFileSync(path.join(target, SHA_MARKER), 'utf8').trim()).toBe('sha-v2');
  });

  it('reconcile-remove: deletes SB-managed dirs absent from the manifest', async () => {
    const ws = path.join(workdir, 'ws-reconcile');
    // Install two skills
    await applySkills(ws, [
      makeSkill('keep', 'sha-keep', { 'a.md': 'a' }),
      makeSkill('remove-me', 'sha-rm', { 'b.md': 'b' }),
    ]);
    const keepDir = path.join(ws, '.claude', 'skills', 'keep');
    const rmDir = path.join(ws, '.claude', 'skills', 'remove-me');
    expect(fs.existsSync(keepDir)).toBe(true);
    expect(fs.existsSync(rmDir)).toBe(true);

    // Next apply omits 'remove-me'
    const results = await applySkills(ws, [makeSkill('keep', 'sha-keep', { 'a.md': 'a' })]);
    const removed = results.find(r => r.name === 'remove-me');
    expect(removed).toMatchObject({ name: 'remove-me', ok: true, status: 'removed' });
    expect(fs.existsSync(rmDir)).toBe(false);
    expect(fs.existsSync(keepDir)).toBe(true);
  });

  it('marker-respect: does not delete user-created dirs without the marker', async () => {
    const ws = path.join(workdir, 'ws-user-dir');
    // Create a skill dir without the SHA marker (user-managed)
    const userDir = path.join(ws, '.claude', 'skills', 'user-skill');
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(path.join(userDir, 'notes.md'), 'user notes');

    // Apply an empty manifest — reconcile should not touch user-skill
    const results = await applySkills(ws, []);
    expect(results.some(r => r.name === 'user-skill')).toBe(false);
    expect(fs.existsSync(userDir)).toBe(true);
  });

  it('zip-slip reject: errors on an entry that escapes the target dir', async () => {
    const ws = path.join(workdir, 'ws-zipslip');
    // Use raw zip bytes with an unmodified "../" entry name — AdmZip's addFile()
    // normalises paths during creation, so we must bypass it to test real payloads.
    const skill: ApplySkill = {
      name: 'evil',
      sha: 'sha-evil',
      zip_b64: makeRawZip('../escape.txt', 'bad').toString('base64'),
    };
    const results = await applySkills(ws, [skill]);
    expect(results[0]).toMatchObject({ name: 'evil', ok: false, status: 'error' });
    expect(results[0].error).toMatch(/zip-slip/);
  });

  it('name guard: rejects an unsafe skill name in the skills array', async () => {
    const ws = path.join(workdir, 'ws-nameguard');
    const skill: ApplySkill = {
      name: '../escape',
      sha: 'sha-x',
      zip_b64: toB64(makeZip({ 'f.md': 'x' })),
    };
    const results = await applySkills(ws, [skill]);
    expect(results[0]).toMatchObject({ ok: false, status: 'error' });
    expect(results[0].error).toMatch(/safe single directory segment/);
  });

  it('returns per-skill results and continues on individual failures', async () => {
    const ws = path.join(workdir, 'ws-mixed');
    const results = await applySkills(ws, [
      makeSkill('good-skill', 'sha-g', { 'f.md': 'ok' }),
      { name: '../bad', sha: 'sha-b', zip_b64: toB64(makeZip({ 'f.md': 'bad' })) },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ name: 'good-skill', ok: true, status: 'added' });
    expect(results[1]).toMatchObject({ ok: false, status: 'error' });
  });
});
