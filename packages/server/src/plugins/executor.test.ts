import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { executePluginTool } from './executor.js';
import type { LoadedPlugin, PluginToolDefinition } from './types.js';

function makeTempPlugin(handlerScript: string): { plugin: LoadedPlugin; tool: PluginToolDefinition; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-exec-test-'));
  fs.writeFileSync(path.join(dir, 'handler.js'), handlerScript);

  const tool: PluginToolDefinition = {
    name: 'test_tool',
    description: 'test',
    inputSchema: { type: 'object' },
    handler: 'node handler.js',
  };

  const plugin: LoadedPlugin = {
    manifest: { name: 'test-plugin', version: '1.0.0', description: 'test', tools: [tool] },
    dir,
    valid: true,
  };

  return { plugin, tool, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

describe('executePluginTool', () => {
  it('returns parsed JSON result on success', async () => {
    const { plugin, tool, cleanup } = makeTempPlugin(`
      let d = '';
      process.stdin.on('data', c => d += c);
      process.stdin.on('end', () => {
        const input = JSON.parse(d);
        process.stdout.write(JSON.stringify({ content: [{ type: 'text', text: 'hello ' + input.name }] }));
      });
    `);

    try {
      const result = await executePluginTool(plugin, tool, { name: 'world' });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toBe('hello world');
    } finally {
      cleanup();
    }
  });

  it('returns error result on non-zero exit', async () => {
    const { plugin, tool, cleanup } = makeTempPlugin(`
      process.stderr.write('something broke');
      process.exit(1);
    `);

    try {
      const result = await executePluginTool(plugin, tool, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('something broke');
    } finally {
      cleanup();
    }
  });

  it('returns error result on invalid JSON output', async () => {
    const { plugin, tool, cleanup } = makeTempPlugin(`
      process.stdout.write('not json');
    `);

    try {
      const result = await executePluginTool(plugin, tool, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid JSON output');
    } finally {
      cleanup();
    }
  });

  it('returns error when handler command does not exist', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-exec-test-'));
    const tool: PluginToolDefinition = {
      name: 'bad_tool',
      description: 'test',
      inputSchema: { type: 'object' },
      handler: 'nonexistent-command-xyz789',
    };
    const plugin: LoadedPlugin = {
      manifest: { name: 'bad-plugin', version: '1.0.0', description: 'test', tools: [tool] },
      dir,
      valid: true,
    };

    try {
      const result = await executePluginTool(plugin, tool, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to spawn handler');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes input as JSON on stdin', async () => {
    const { plugin, tool, cleanup } = makeTempPlugin(`
      let d = '';
      process.stdin.on('data', c => d += c);
      process.stdin.on('end', () => {
        const input = JSON.parse(d);
        const keys = Object.keys(input).sort().join(',');
        process.stdout.write(JSON.stringify({ content: [{ type: 'text', text: keys }] }));
      });
    `);

    try {
      const result = await executePluginTool(plugin, tool, { alpha: 1, beta: 2 });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toBe('alpha,beta');
    } finally {
      cleanup();
    }
  });
});
