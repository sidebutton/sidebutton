import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadPlugins, summarizePlugins } from './loader.js';

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

describe('summarizePlugins (/health contract)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-plugin-summary-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('maps loaded plugins to {name, version, description, tools[]} for /health', () => {
    writePlugin(path.join(tmpDir, 'screen-record'), {
      name: 'screen-record',
      version: '1.0.0',
      description: 'ffmpeg x11grab screen recording',
      tools: [
        { name: 'start_recording', description: 'start', inputSchema: { type: 'object' }, handler: 'bash start.sh' },
        { name: 'stop_recording', description: 'stop', inputSchema: { type: 'object' }, handler: 'bash stop.sh' },
      ],
    });

    const summary = summarizePlugins(loadPlugins(tmpDir));
    expect(summary).toEqual([
      {
        name: 'screen-record',
        version: '1.0.0',
        description: 'ffmpeg x11grab screen recording',
        tools: ['start_recording', 'stop_recording'],
      },
    ]);
  });

  it('returns an empty array when no plugins are loaded', () => {
    expect(summarizePlugins(loadPlugins(path.join(tmpDir, 'nope')))).toEqual([]);
  });
});

describe('service runtime manifests (SCRUM-1406)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-svc-loader-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const serviceManifest = {
    name: 'svc-plugin',
    version: '1.0.0',
    description: 'A service plugin',
    runtime: 'service',
    service: {
      command: 'node server.js',
      timeoutMs: 120000,
      tools: { hold_key: { timeoutMs: 100000 } },
    },
  };

  it('loads a service plugin (runtime + service.command, no per-tool handler)', () => {
    writePlugin(path.join(tmpDir, 'svc-plugin'), serviceManifest);

    const plugins = loadPlugins(tmpDir);

    expect(plugins).toHaveLength(1);
    expect(plugins[0].manifest.runtime).toBe('service');
    expect(plugins[0].manifest.service?.command).toBe('node server.js');
    expect(plugins[0].manifest.service?.timeoutMs).toBe(120000);
    expect(plugins[0].manifest.service?.tools?.hold_key?.timeoutMs).toBe(100000);
    // Service tools are discovered live from the child, not declared in the manifest.
    expect(plugins[0].manifest.tools).toEqual([]);
  });

  it('rejects a service plugin missing service.command', () => {
    writePlugin(path.join(tmpDir, 'bad-svc'), {
      name: 'bad-svc',
      version: '1.0.0',
      description: 'no command',
      runtime: 'service',
      service: {},
    });
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(loadPlugins(tmpDir)).toEqual([]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('service.command'));
    spy.mockRestore();
  });

  it('defaults runtime to "process" when omitted', () => {
    writePlugin(path.join(tmpDir, 'test-plugin'), validManifest);
    expect(loadPlugins(tmpDir)[0].manifest.runtime).toBe('process');
  });

  it('accepts "exec" as a back-compat alias for the process tier', () => {
    writePlugin(path.join(tmpDir, 'exec-plugin'), { ...validManifest, name: 'exec-plugin', runtime: 'exec' });

    const plugins = loadPlugins(tmpDir);

    expect(plugins).toHaveLength(1);
    expect(plugins[0].manifest.runtime).toBe('process');
  });

  it('rejects an unknown runtime', () => {
    writePlugin(path.join(tmpDir, 'weird'), { ...validManifest, name: 'weird', runtime: 'bogus' });
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(loadPlugins(tmpDir)).toEqual([]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('invalid runtime'));
    spy.mockRestore();
  });

  it('does not subject a service plugin to the whole-plugin core-collision check', () => {
    // A service plugin carries no manifest tools[], so the process-tier collision guard
    // can never reject it — namespacing handles per-tool collisions at aggregation time.
    writePlugin(path.join(tmpDir, 'svc-plugin'), serviceManifest);
    expect(loadPlugins(tmpDir)).toHaveLength(1);
  });
});
