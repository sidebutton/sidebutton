import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { ensureClaudeFolderTrust } from './claude-trust.js';

let dir: string;
let configPath: string;

const read = () => JSON.parse(readFileSync(configPath, 'utf8'));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sb-claude-trust-'));
  configPath = join(dir, '.claude.json');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe('ensureClaudeFolderTrust', () => {
  it('creates the config with a trusted entry when no file exists', () => {
    expect(ensureClaudeFolderTrust('/home/agent/demo', configPath)).toBe('seeded');
    const cfg = read();
    expect(cfg.hasCompletedOnboarding).toBe(true);
    expect(cfg.projects[resolve('/home/agent/demo')]).toEqual({
      hasTrustDialogAccepted: true,
      hasCompletedProjectOnboarding: true,
    });
  });

  it('merges into an existing config, preserving global keys and other projects', () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        hasCompletedOnboarding: true,
        theme: 'dark',
        mcpServers: { sidebutton: { url: 'http://localhost:9876' } },
        projects: {
          [resolve('/home/agent/workspace')]: { hasTrustDialogAccepted: true, history: ['old session'] },
        },
      }),
    );
    expect(ensureClaudeFolderTrust('/home/agent/test', configPath)).toBe('seeded');
    const cfg = read();
    expect(cfg.theme).toBe('dark');
    expect(cfg.mcpServers.sidebutton.url).toBe('http://localhost:9876');
    expect(cfg.projects[resolve('/home/agent/workspace')].history).toEqual(['old session']);
    expect(cfg.projects[resolve('/home/agent/test')].hasTrustDialogAccepted).toBe(true);
  });

  it('preserves extra per-project state when upgrading a partial entry', () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        hasCompletedOnboarding: true,
        projects: { [resolve('/home/agent/ops')]: { hasTrustDialogAccepted: true, hasCompletedProjectOnboarding: null, allowedTools: ['Bash'] } },
      }),
    );
    expect(ensureClaudeFolderTrust('/home/agent/ops', configPath)).toBe('seeded');
    const entry = read().projects[resolve('/home/agent/ops')];
    expect(entry.allowedTools).toEqual(['Bash']);
    expect(entry.hasCompletedProjectOnboarding).toBe(true);
  });

  it('is idempotent — an already-trusted set skips the write', () => {
    expect(ensureClaudeFolderTrust(['/a', '/b'], configPath)).toBe('seeded');
    const before = readFileSync(configPath, 'utf8');
    expect(ensureClaudeFolderTrust(['/a', '/b'], configPath)).toBe('unchanged');
    expect(readFileSync(configPath, 'utf8')).toBe(before);
  });

  it('expands ~/ against the home dir (entry paths arrive as ~/<name> from the portal)', () => {
    expect(ensureClaudeFolderTrust('~/sb-trust-home-test', configPath)).toBe('seeded');
    const key = resolve(join(homedir(), 'sb-trust-home-test'));
    expect(read().projects[key].hasTrustDialogAccepted).toBe(true);
  });

  it('seeds multiple dirs in one write', () => {
    expect(ensureClaudeFolderTrust(['/home/agent/demo', '/home/agent/test'], configPath)).toBe('seeded');
    const cfg = read();
    expect(cfg.projects[resolve('/home/agent/demo')].hasTrustDialogAccepted).toBe(true);
    expect(cfg.projects[resolve('/home/agent/test')].hasTrustDialogAccepted).toBe(true);
  });

  it('ignores blank entries; an empty list is a no-op', () => {
    expect(ensureClaudeFolderTrust([], configPath)).toBe('unchanged');
    expect(ensureClaudeFolderTrust(['', '  '], configPath)).toBe('unchanged');
    expect(existsSync(configPath)).toBe(false);
  });

  it('leaves a corrupt config untouched and reports failure', () => {
    writeFileSync(configPath, '{ not json');
    expect(ensureClaudeFolderTrust('/home/agent/test', configPath)).toBe('failed');
    expect(readFileSync(configPath, 'utf8')).toBe('{ not json');
  });

  it('leaves a non-object config untouched and reports failure', () => {
    writeFileSync(configPath, '[1,2,3]');
    expect(ensureClaudeFolderTrust('/home/agent/test', configPath)).toBe('failed');
    expect(readFileSync(configPath, 'utf8')).toBe('[1,2,3]');
  });

  it('never throws on an unwritable target and leaves no temp file behind', () => {
    // A directory at the config path makes both read and rename fail.
    expect(ensureClaudeFolderTrust('/home/agent/test', dir)).toBe('failed');
    expect(readdirSync(dir).filter((f) => f.includes('sb-trust'))).toEqual([]);
  });
});
