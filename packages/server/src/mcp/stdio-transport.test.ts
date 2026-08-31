import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { McpHandler } from './handler.js';
import { createStdioMcpServer } from './stdio.js';
import type { ExtensionClientImpl } from '../extension.js';

/**
 * KAN-32 D3 (stdio half) — the resource-miss path must answer with the same code on both
 * transports. stdio used to re-raise every handler failure as a bare Error, which the SDK
 * re-mapped to -32603 (Internal error) and stripped of `data`, so a fix confined to the
 * HTTP path would have left the two transports disagreeing.
 *
 * Driven through the real SDK server/client pair over an in-memory transport, so the SDK's
 * own error serialisation — the step that produced -32603 — is exercised.
 */

let tmpDir: string;
let client: Client;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kan32-stdio-'));
  const dir = (name: string): string => {
    const d = path.join(tmpDir, name);
    fs.mkdirSync(d, { recursive: true });
    return d;
  };
  const handler = new McpHandler(
    dir('actions'), dir('workflows'), dir('templates'), dir('run-logs'),
    {} as unknown as ExtensionClientImpl, dir('config'),
  );
  const server = createStdioMcpServer(handler);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'kan32-stdio-test', version: '1' }, { capabilities: {} });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('KAN-32 D3 — resources/read on a missing URI (stdio transport)', () => {
  it.each([
    'skill://kan32.nope/_skill.md',
    'skill://agents/nope.md',
    'workflow://does-not-exist',
  ])('answers -32002 with data.uri for %s', async (uri) => {
    const error = await client.readResource({ uri }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(-32002);
    expect((error as McpError).data).toEqual({ uri });
  });

  it('leaves unrelated failures on the generic code', async () => {
    // A tool that fails for its own reasons must not be relabelled "resource not found".
    const error = await client.callTool({ name: 'run_workflow', arguments: { workflow_id: 'nope' } }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(-32000);
  });
});
