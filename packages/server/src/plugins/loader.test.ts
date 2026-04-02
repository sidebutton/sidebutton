import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadPlugins } from './loader.js';

function writePlugin(dir: string, manifest: Record<string, unknown>) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest));
}

const validManifest = {
  name: 'test-plugin',
  version: '1.0.0',
  description: 'A test plugin',
  tools: [
    {
      name: 'my_custom_tool',
      description: 'Does something custom',
      inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
      handler: 'echo hello',
    },
  ],
};

describe('loadPlugins', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-plugin-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads a valid plugin', () => {
    writePlugin(path.join(tmpDir, 'test-plugin'), validManifest);

    const plugins = loadPlugins(tmpDir);

    expect(plugins).toHaveLength(1);
    expect(plugins[0].manifest.name).toBe('test-plugin');
    expect(plugins[0].manifest.tools).toHaveLength(1);
    expect(plugins[0].valid).toBe(true);
    expect(plugins[0].dir).toBe(path.join(tmpDir, 'test-plugin'));
  });

  it('returns empty array for non-existent directory', () => {
    const plugins = loadPlugins(path.join(tmpDir, 'does-not-exist'));
    expect(plugins).toEqual([]);
  });

  it('skips directories without plugin.json', () => {
    fs.mkdirSync(path.join(tmpDir, 'empty-dir'), { recursive: true });
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const plugins = loadPlugins(tmpDir);

    expect(plugins).toEqual([]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('no plugin.json found'));
    spy.mockRestore();
  });

  it('skips manifest with missing required fields', () => {
    writePlugin(path.join(tmpDir, 'bad-plugin'), { name: 'bad' });
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const plugins = loadPlugins(tmpDir);

    expect(plugins).toEqual([]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('missing required field'));
    spy.mockRestore();
  });

  it('skips manifest with invalid JSON', () => {
    const dir = path.join(tmpDir, 'broken');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'plugin.json'), '{ not json');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const plugins = loadPlugins(tmpDir);

    expect(plugins).toEqual([]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('not valid JSON'));
    spy.mockRestore();
  });

  it('skips tools with invalid inputSchema', () => {
    const manifest = {
      ...validManifest,
      name: 'bad-schema',
      tools: [
        {
          name: 'bad_tool',
          description: 'Bad schema',
          inputSchema: 'not an object',
          handler: 'echo',
        },
      ],
    };
    writePlugin(path.join(tmpDir, 'bad-schema'), manifest);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const plugins = loadPlugins(tmpDir);

    expect(plugins).toEqual([]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('invalid inputSchema'));
    spy.mockRestore();
  });

  it('rejects plugins with tool name collisions against core MCP_TOOLS', () => {
    const manifest = {
      ...validManifest,
      name: 'collision-plugin',
      tools: [
        {
          name: 'navigate',
          description: 'Conflicts with core tool',
          inputSchema: { type: 'object', properties: {} },
          handler: 'echo nav',
        },
      ],
    };
    writePlugin(path.join(tmpDir, 'collision-plugin'), manifest);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const plugins = loadPlugins(tmpDir);

    expect(plugins).toEqual([]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('tool name collision'));
    spy.mockRestore();
  });

  it('loads multiple valid plugins', () => {
    writePlugin(path.join(tmpDir, 'plugin-a'), {
      ...validManifest,
      name: 'plugin-a',
      tools: [{ ...validManifest.tools[0], name: 'tool_a' }],
    });
    writePlugin(path.join(tmpDir, 'plugin-b'), {
      ...validManifest,
      name: 'plugin-b',
      tools: [{ ...validManifest.tools[0], name: 'tool_b' }],
    });

    const plugins = loadPlugins(tmpDir);

    expect(plugins).toHaveLength(2);
    const names = plugins.map((p) => p.manifest.name).sort();
    expect(names).toEqual(['plugin-a', 'plugin-b']);
  });
});
