import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  DEFAULTS_SEED_SOURCE,
  getInstalledManifest,
  installSkillPack,
  seedSkillPack,
} from './skill-pack.js';

let tmp: string;
let configDir: string;

function writePack(dir: string, version: string, extraFiles: Record<string, string> = {}): string {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'skill-pack.json'),
    JSON.stringify({ name: 'demo', version, domain: 'demo.test', title: 'Demo Pack' }, null, 2),
  );
  fs.writeFileSync(path.join(dir, '_skill.md'), `# Demo v${version}\n`);
  for (const [file, content] of Object.entries({ '_roles/se.md': 'se role\n', ...extraFiles })) {
    const dest = path.join(dir, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
  return dir;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-skill-pack-'));
  configDir = path.join(tmp, 'config');
  fs.mkdirSync(configDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('seedSkillPack', () => {
  it('copies the pack verbatim, manifest file included, and registers the seed source', () => {
    const pack = writePack(path.join(tmp, 'defaults-pack'), '1.0.0');

    const result = seedSkillPack(pack, configDir);

    expect(result).toEqual({ domain: 'demo.test', filesInstalled: 3, status: 'seeded' });
    const dest = path.join(configDir, 'skills', 'demo.test');
    // skill-pack.json must land too — installed and seeded packs are identical
    // on disk, which the publish round-trip relies on.
    expect(fs.existsSync(path.join(dest, 'skill-pack.json'))).toBe(true);
    expect(fs.existsSync(path.join(dest, '_skill.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, '_roles', 'se.md'))).toBe(true);

    const installed = getInstalledManifest(configDir);
    expect(installed['demo.test']).toMatchObject({
      domain: 'demo.test',
      version: '1.0.0',
      source: DEFAULTS_SEED_SOURCE,
    });
  });

  it('does not touch an already-present pack directory or manifest entry', () => {
    const pack = writePack(path.join(tmp, 'defaults-pack'), '1.0.0');
    seedSkillPack(pack, configDir);
    fs.writeFileSync(path.join(configDir, 'skills', 'demo.test', '_skill.md'), 'edited\n');

    const again = seedSkillPack(pack, configDir);

    expect(again?.status).toBe('skipped');
    expect(fs.readFileSync(path.join(configDir, 'skills', 'demo.test', '_skill.md'), 'utf-8')).toBe(
      'edited\n',
    );
  });

  it('returns null for a directory without a valid manifest', () => {
    const notAPack = path.join(tmp, 'plain');
    fs.mkdirSync(notAPack, { recursive: true });
    fs.writeFileSync(path.join(notAPack, 'notes.md'), 'hi\n');

    expect(seedSkillPack(notAPack, configDir)).toBeNull();
    expect(fs.existsSync(path.join(configDir, 'skills'))).toBe(false);
  });
});

describe('installSkillPack over a seeded pack', () => {
  it('skips a same-version install without --force', () => {
    seedSkillPack(writePack(path.join(tmp, 'seed'), '1.0.0'), configDir);

    const result = installSkillPack(writePack(path.join(tmp, 'incoming'), '1.0.0'), configDir);

    expect(result.status).toBe('skipped');
  });

  it('upgrades a seeded pack across versions without --force', () => {
    seedSkillPack(writePack(path.join(tmp, 'seed'), '1.0.0'), configDir);

    const result = installSkillPack(writePack(path.join(tmp, 'incoming'), '2.0.0'), configDir);

    expect(result.status).toBe('updated');
    expect(
      fs.readFileSync(path.join(configDir, 'skills', 'demo.test', '_skill.md'), 'utf-8'),
    ).toContain('v2.0.0');
    // Once a real install replaces the seed, the seed marker is gone and the
    // usual --force protection applies again.
    expect(getInstalledManifest(configDir)['demo.test'].source).not.toBe(DEFAULTS_SEED_SOURCE);
  });

  it('still refuses a cross-version install over a user-installed pack', () => {
    installSkillPack(writePack(path.join(tmp, 'first'), '1.0.0'), configDir);

    expect(() =>
      installSkillPack(writePack(path.join(tmp, 'second'), '2.0.0'), configDir),
    ).toThrow(/--force/);
  });

  it('still refuses to overwrite an unmanaged skills directory', () => {
    const dest = path.join(configDir, 'skills', 'demo.test');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, '_skill.md'), 'hand-authored\n');

    expect(() =>
      installSkillPack(writePack(path.join(tmp, 'incoming'), '2.0.0'), configDir),
    ).toThrow(/user content/);
  });
});
