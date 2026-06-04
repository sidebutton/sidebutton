import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { McpHandler } from './handler.js';
import type { ExtensionClientImpl } from '../extension.js';

type AuthCall = { origin: string | undefined; username: string; password: string };

/**
 * Construct a real McpHandler over throwaway dirs with a stub extension client,
 * so the test exercises the actual JSON-RPC dispatch (tool name → handler →
 * extension client) rather than calling private methods directly.
 */
function makeHandler(
  opts: {
    connected?: boolean;
    onSet?: (c: AuthCall) => void;
    onClear?: (origin: string | undefined) => void;
  } = {}
): McpHandler {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-mcp-auth-'));
  const ext = {
    isConnected: async () => opts.connected ?? true,
    setBasicAuth: async (origin: string | undefined, username: string, password: string) => {
      opts.onSet?.({ origin, username, password });
    },
    clearBasicAuth: async (origin?: string) => {
      opts.onClear?.(origin);
    },
  } as unknown as ExtensionClientImpl;
  return new McpHandler(tmp, tmp, tmp, tmp, ext, tmp);
}

async function callTool(
  handler: McpHandler,
  name: string,
  args: Record<string, unknown> = {}
): Promise<{ result?: any; error?: { message: string } }> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  return JSON.parse(await handler.handleRequest(body));
}

describe('set_basic_auth / clear_basic_auth MCP tools', () => {
  it('advertises both tools in tools/list with the right schema', async () => {
    const handler = makeHandler();
    const res = JSON.parse(
      await handler.handleRequest(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    );
    const tools: { name: string; inputSchema: any }[] = res.result.tools;
    const names = tools.map((t) => t.name);
    expect(names).toContain('set_basic_auth');
    expect(names).toContain('clear_basic_auth');

    const setTool = tools.find((t) => t.name === 'set_basic_auth')!;
    expect(setTool.inputSchema.required).toEqual(['username', 'password']);
    expect(setTool.inputSchema.properties.origin).toBeDefined();

    const clearTool = tools.find((t) => t.name === 'clear_basic_auth')!;
    expect(clearTool.inputSchema.required ?? []).not.toContain('origin');
  });

  it('forwards credentials (with origin) to the extension client', async () => {
    const calls: AuthCall[] = [];
    const handler = makeHandler({ onSet: (c) => calls.push(c) });
    const res = await callTool(handler, 'set_basic_auth', {
      username: 'alice',
      password: 's3cret',
      origin: 'https://staging.example.com',
    });
    expect(res.error).toBeUndefined();
    expect(calls).toEqual([
      { origin: 'https://staging.example.com', username: 'alice', password: 's3cret' },
    ]);
    expect(res.result.content[0].text).toContain('staging.example.com');
  });

  it('passes origin=undefined (any challenged site) when omitted', async () => {
    const calls: AuthCall[] = [];
    const handler = makeHandler({ onSet: (c) => calls.push(c) });
    await callTool(handler, 'set_basic_auth', { username: 'bob', password: 'pw' });
    expect(calls).toHaveLength(1);
    expect(calls[0].origin).toBeUndefined();
  });

  it('clears one origin or all credentials', async () => {
    const cleared: (string | undefined)[] = [];
    const handler = makeHandler({ onClear: (o) => cleared.push(o) });
    await callTool(handler, 'clear_basic_auth', { origin: 'https://staging.example.com' });
    await callTool(handler, 'clear_basic_auth', {});
    expect(cleared).toEqual(['https://staging.example.com', undefined]);
  });

  it('requires a connected browser', async () => {
    const handler = makeHandler({ connected: false });
    const res = await callTool(handler, 'set_basic_auth', { username: 'a', password: 'b' });
    expect(res.result).toBeUndefined();
    expect(res.error?.message).toBe('Browser not connected');
  });

  it('rejects a missing password', async () => {
    const handler = makeHandler();
    const res = await callTool(handler, 'set_basic_auth', { username: 'a' });
    expect(res.error?.message).toContain('password');
  });
});
