import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { loadPlugins } from './loader.js';

function makeTempDir(): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-loader-test-'));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

describe('loadPlugins', () => {
  it('returns empty array for non-existent directory', () => {
    expect(loadPlugins('/tmp/does-not-exist-abc123')).toEqual([]);
  });

  it('loads valid plugin manifest', () => {
    const { dir, cleanup } = makeTempDir();
    const pluginDir = path.join(dir, 'my-plugin');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
      name: 'my-plugin',
      tools: [{ name: 'my_tool', description: 'desc', inputSchema: { type: 'object' }, handler: 'node handler.js' }],
    }));

    try {
      const plugins = loadPlugins(dir);
      expect(plugins).toHaveLength(1);
      expect(plugins[0].manifest.name).toBe('my-plugin');
      expect(plugins[0].manifest.tools).toHaveLength(1);
      expect(plugins[0].dir).toBe(pluginDir);
    } finally {
      cleanup();
    }
  });

  it('skips directories without plugin.json', () => {
    const { dir, cleanup } = makeTempDir();
    fs.mkdirSync(path.join(dir, 'no-manifest'));

    try {
      expect(loadPlugins(dir)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('skips invalid JSON manifests', () => {
    const { dir, cleanup } = makeTempDir();
    const pluginDir = path.join(dir, 'bad');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), 'not json');

    try {
      expect(loadPlugins(dir)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('skips manifests missing required fields', () => {
    const { dir, cleanup } = makeTempDir();
    const pluginDir = path.join(dir, 'incomplete');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ version: '1.0' }));

    try {
      expect(loadPlugins(dir)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('skips hidden directories', () => {
    const { dir, cleanup } = makeTempDir();
    const pluginDir = path.join(dir, '.hidden');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
      name: 'hidden', tools: [],
    }));

    try {
      expect(loadPlugins(dir)).toEqual([]);
    } finally {
      cleanup();
    }
  });
});
