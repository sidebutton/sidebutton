import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpHandler } from './handler.js';
import type { ExtensionClientImpl } from '../extension.js';

// SCRUM-1268 — duplicate workflow ids across installed skill packs must resolve
// deterministically: an account pack's copy overrides the bundled default `agents`
// pack's, regardless of filesystem enumeration order, and the shadowing is logged.

const ext = {} as unknown as ExtensionClientImpl;

interface WfSpec {
  file: string;
  id: string;
  title: string;
}

/**
 * Construct a real McpHandler whose configDir holds skills/<domain>/ops/*.yaml trees.
 * Actions/workflows/templates/run-logs point at separate empty dirs so the skill
 * YAMLs load exclusively through the skills path under test.
 */
function makeHandler(domains: Record<string, WfSpec[]>): McpHandler {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-mcp-dup-'));
  const empty = (name: string): string => {
    const d = path.join(tmp, name);
    fs.mkdirSync(d);
    return d;
  };
  for (const [domain, wfs] of Object.entries(domains)) {
    const opsDir = path.join(tmp, 'skills', domain, 'ops');
    fs.mkdirSync(opsDir, { recursive: true });
    for (const wf of wfs) {
      fs.writeFileSync(
        path.join(opsDir, wf.file),
        `id: ${wf.id}\ntitle: ${wf.title}\nsteps:\n  - type: shell.run\n    command: echo ok\n`,
      );
    }
  }
  return new McpHandler(empty('actions'), empty('workflows'), empty('templates'), empty('run-logs'), ext, tmp);
}

describe('skill workflow duplicate-id precedence (SCRUM-1268)', () => {
  it('account pack wins over the default agents pack when its domain sorts BEFORE "agents"', () => {
    // 'aaa.example.com' < 'agents' alphabetically — a naive sort would load the default
    // pack last and let it win; the default pack must load first so the account copy shadows it.
    const h = makeHandler({
      'aaa.example.com': [{ file: 'dup.yaml', id: 'wf_dup', title: 'Account copy' }],
      agents: [
        { file: 'dup.yaml', id: 'wf_dup', title: 'Default copy' },
        { file: 'solo.yaml', id: 'wf_only_default', title: 'Default only' },
      ],
    });
    expect(h.findWorkflow('wf_dup')?.title).toBe('Account copy');
    expect(h.findWorkflow('wf_only_default')?.title).toBe('Default only');
  });

  it('account pack wins over the default agents pack when its domain sorts AFTER "agents"', () => {
    const h = makeHandler({
      agents: [{ file: 'dup.yaml', id: 'wf_dup', title: 'Default copy' }],
      'zzz.example.com': [
        { file: 'dup.yaml', id: 'wf_dup', title: 'Account copy' },
        { file: 'solo.yaml', id: 'wf_only_account', title: 'Account only' },
      ],
    });
    expect(h.findWorkflow('wf_dup')?.title).toBe('Account copy');
    expect(h.findWorkflow('wf_only_account')?.title).toBe('Account only');
    // The shadowed default copy is dropped, not merely ordered behind the winner.
    expect(h.getAllWorkflows().filter((w) => w.id === 'wf_dup')).toHaveLength(1);
  });

  it('logs a warning naming both domains when an account workflow shadows a default one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      makeHandler({
        agents: [{ file: 'dup.yaml', id: 'wf_dup', title: 'Default copy' }],
        'acct.example.com': [{ file: 'dup.yaml', id: 'wf_dup', title: 'Account copy' }],
      });
      const messages = warn.mock.calls.map((c) => c.join(' '));
      expect(
        messages.some((m) => m.includes('wf_dup') && m.includes('acct.example.com') && m.includes('agents')),
      ).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});

// SCRUM-1406 — a `runtime: "service"` plugin installed under configDir/plugins/ should be
// spawned as a persistent child, its tools aggregated (slug-namespaced) into tools/list, and
// tools/call forwarded to it with state surviving across calls.

const SERVICE_FIXTURE = fileURLToPath(new URL('../plugins/__fixtures__/counter-service.mjs', import.meta.url));

async function until(predicate: () => Promise<boolean> | boolean, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('until timed out');
}

describe('service-plugin aggregation via McpHandler (SCRUM-1406)', () => {
  let handler: McpHandler;
  let tmp: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function call(method: string, params?: Record<string, unknown>): Promise<any> {
    const res = await handler.handleRequest(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }));
    const parsed = JSON.parse(res);
    if (parsed.error) throw new Error(parsed.error.message);
    return parsed.result;
  }
  const listToolNames = async (): Promise<string[]> =>
    (await call('tools/list')).tools.map((t: { name: string }) => t.name);

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-svc-handler-'));
    const pluginDir = path.join(tmp, 'plugins', 'counter');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        name: 'counter',
        version: '1.0.0',
        description: 'counter service',
        runtime: 'service',
        service: { command: `node ${SERVICE_FIXTURE}` },
      }),
    );
    const empty = (name: string): string => {
      const d = path.join(tmp, name);
      fs.mkdirSync(d);
      return d;
    };
    handler = new McpHandler(empty('actions'), empty('workflows'), empty('templates'), empty('run-logs'), ext, tmp);
  });

  afterEach(async () => {
    await handler.shutdownServicePlugins();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('lists, round-trips, persists state, and summarizes a service plugin', async () => {
    await until(async () => (await listToolNames()).includes('counter_increment'));

    // AC1: slug-namespaced tool appears in tools/list
    expect(await listToolNames()).toContain('counter_increment');

    // AC1 round-trip + AC2 state persists across calls (one long-lived child)
    const inc1 = await call('tools/call', { name: 'counter_increment', arguments: { by: 1 } });
    expect(inc1.content[0].text).toBe('1');
    const inc2 = await call('tools/call', { name: 'counter_increment', arguments: {} });
    expect(inc2.content[0].text).toBe('2');

    // /health summary includes the service plugin with runtime + namespaced tools
    const svc = handler.getLoadedPluginSummaries().find((s) => s.name === 'counter');
    expect(svc?.runtime).toBe('service');
    expect(svc?.tools).toContain('counter_increment');
  }, 15000);

  it('still throws "Tool not found" for an unknown tool', async () => {
    await until(async () => (await listToolNames()).includes('counter_increment'));
    await expect(call('tools/call', { name: 'does_not_exist', arguments: {} })).rejects.toThrow(/Tool not found/);
  }, 15000);
});
