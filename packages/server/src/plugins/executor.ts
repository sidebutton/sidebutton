/**
 * Plugin tool executor — spawns a handler process, passes tool input on stdin,
 * reads MCP-formatted JSON result from stdout.
 */

import { spawn } from 'node:child_process';
import type { LoadedPlugin, PluginToolDefinition } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

interface McpToolResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

export function executePluginTool(
  plugin: LoadedPlugin,
  tool: PluginToolDefinition,
  input: Record<string, unknown>,
): Promise<McpToolResult> {
  const parts = tool.handler.split(/\s+/);
  const command = parts[0];
  const args = parts.slice(1);

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd: plugin.dir,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      resolve({
        content: [{ type: 'text', text: `Failed to spawn handler: ${msg}` }],
        isError: true,
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();

    child.on('error', (err: Error) => {
      clearTimeout(timer);
      resolve({
        content: [{ type: 'text', text: `Failed to spawn handler: ${err.message}` }],
        isError: true,
      });
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timer);

      if (killed) {
        resolve({
          content: [{ type: 'text', text: `Plugin handler timed out after ${DEFAULT_TIMEOUT_MS}ms` }],
          isError: true,
        });
        return;
      }

      if (code !== 0) {
        resolve({
          content: [{ type: 'text', text: stderr || `Handler exited with code ${code}` }],
          isError: true,
        });
        return;
      }

      try {
        const result = JSON.parse(stdout);
        if (result.content && Array.isArray(result.content)) {
          resolve(result);
        } else {
          resolve({ content: [{ type: 'text', text: stdout.trim() }] });
        }
      } catch {
        resolve({
          content: [{ type: 'text', text: `Invalid JSON output from handler: ${stdout.slice(0, 500)}` }],
          isError: true,
        });
      }
    });
  });
}
