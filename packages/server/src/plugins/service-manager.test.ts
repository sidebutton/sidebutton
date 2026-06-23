import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PluginServiceManager, type ServiceCallResult } from './service-manager.js';
import type { LoadedPlugin, PluginServiceSpec } from './types.js';

// A real, minimal stateful stdio-MCP child (holds an in-memory counter across calls).
const FIXTURE = fileURLToPath(new URL('./__fixtures__/counter-service.mjs', import.meta.url));

/** Build a `runtime: "service"` LoadedPlugin pointing at the counter fixture. */
function servicePlugin(serviceOverrides: Partial<PluginServiceSpec> = {}, name = 'counter'): LoadedPlugin {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-mgr-'));
  return {
    dir,
    valid: true,
    manifest: {
      name,
      version: '1.0.0',
      description: 'counter test service',
      runtime: 'service',
      service: { command: `node ${FIXTURE}`, ...serviceOverrides },
      tools: [],
    },
  };
}

function text(res: ServiceCallResult | null): string {
  const first = (res?.content as Array<{ type: string; text?: string }> | undefined)?.[0];
  return first?.text ?? '';
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }
  if (!predicate()) throw new Error('waitFor timed out');
}

const managers: PluginServiceManager[] = [];
function makeManager(): PluginServiceManager {
  const mgr = new PluginServiceManager();
  managers.push(mgr);
  return mgr;
}
const hasTool = (mgr: PluginServiceManager, name: string) =>
  mgr.getAggregatedTools(new Set()).some((t) => t.name === name);

afterEach(async () => {
  await Promise.all(managers.map((m) => m.shutdownAll()));
  managers.length = 0;
});

describe('PluginServiceManager (SCRUM-1406)', () => {
  it('discovers + namespaces child tools, round-trips a call, and persists state across calls', async () => {
    const mgr = makeManager();
    mgr.sync([servicePlugin()]);
    await waitFor(() => hasTool(mgr, 'counter_increment'));

    const tools = mgr.getAggregatedTools(new Set());
    const names = tools.map((t) => t.name);
    expect(names).toContain('counter_increment'); // AC1: slug-namespaced
    expect(names).toContain('counter_get');
    expect(tools.find((t) => t.name === 'counter_increment')?.description).toContain('[plugin: counter]');

    // AC1 round-trip + AC2 state persists: one long-lived child serves successive calls.
    expect(text(await mgr.routeCall('counter_increment', { by: 5 }))).toBe('5');
    expect(text(await mgr.routeCall('counter_increment', {}))).toBe('6');
    expect(text(await mgr.routeCall('counter_get', {}))).toBe('6');
  });

  it('drops only a service tool whose namespaced name collides, keeping siblings (warns)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const mgr = makeManager();
      mgr.sync([servicePlugin()]);
      await waitFor(() => hasTool(mgr, 'counter_increment'));

      // Pretend a core/process tool already owns `counter_get`.
      const names = mgr.getAggregatedTools(new Set(['counter_get'])).map((t) => t.name);
      expect(names).toContain('counter_increment'); // sibling kept
      expect(names).not.toContain('counter_get'); // only the collider dropped (AC4)
      expect(warn.mock.calls.flat().some((m) => String(m).includes('collides'))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('enforces a per-tool timeout override', async () => {
    const mgr = makeManager();
    mgr.sync([servicePlugin({ tools: { sleep: { timeoutMs: 100 } } })]);
    await waitFor(() => hasTool(mgr, 'counter_sleep'));

    const res = await mgr.routeCall('counter_sleep', { ms: 1000 });
    expect(res?.isError).toBe(true); // AC4: 100ms tool timeout fires before the 1000ms sleep
    expect(text(res)).toMatch(/tim(ed|e)?\s*out/i);
  });

  it('serializes calls per plugin (no concurrent execution)', async () => {
    const mgr = makeManager();
    mgr.sync([servicePlugin()]);
    await waitFor(() => hasTool(mgr, 'counter_sleep'));

    const order: string[] = [];
    const p1 = mgr.routeCall('counter_sleep', { ms: 200 })!.then(() => order.push('sleep'));
    const p2 = mgr.routeCall('counter_increment', {})!.then(() => order.push('inc'));
    await Promise.all([p1, p2]);
    // The fast increment was enqueued second, so serialization makes it complete after the slow sleep.
    expect(order).toEqual(['sleep', 'inc']);
  });

  it('restarts the child after a crash and serves again with fresh state', async () => {
    const mgr = makeManager();
    mgr.sync([servicePlugin()]);
    await waitFor(() => hasTool(mgr, 'counter_increment'));

    await mgr.routeCall('counter_increment', { by: 3 });
    expect(text(await mgr.routeCall('counter_get', {}))).toBe('3');

    const crashed = await mgr.routeCall('counter_crash', {});
    expect(crashed?.isError).toBe(true); // child exited mid-call

    // AC3: manager auto-restarts (backoff) and serves again — fresh process resets the counter.
    await waitFor(() => hasTool(mgr, 'counter_increment'), 8000);
    expect(text(await mgr.routeCall('counter_get', {}))).toBe('0');
  }, 15000);

  it('sync is idempotent on an unchanged spec and restarts on a changed spec', async () => {
    const mgr = makeManager();
    const plugin = servicePlugin();
    mgr.sync([plugin]);
    await waitFor(() => hasTool(mgr, 'counter_increment'));
    await mgr.routeCall('counter_increment', { by: 2 });
    expect(text(await mgr.routeCall('counter_get', {}))).toBe('2');

    // Same plugin again → unchanged spec → child left running, state preserved (no thrash, AC3).
    mgr.sync([plugin]);
    expect(text(await mgr.routeCall('counter_get', {}))).toBe('2');

    // Changed spawn spec → restart → fresh child, state reset.
    mgr.sync([servicePlugin({ command: `node ${FIXTURE} --variant` })]);
    await waitFor(() => hasTool(mgr, 'counter_increment'));
    expect(text(await mgr.routeCall('counter_get', {}))).toBe('0');
  }, 15000);

  it('stops a service removed from the desired set and shuts all down', async () => {
    const mgr = makeManager();
    mgr.sync([servicePlugin()]);
    await waitFor(() => mgr.getSummaries().length === 1);

    mgr.sync([]); // removed from desired set
    expect(mgr.getSummaries()).toEqual([]);
    expect(mgr.routeCall('counter_increment', {})).toBeNull();

    // shutdownAll is a no-op-safe clear when already empty.
    await mgr.shutdownAll();
    expect(mgr.getSummaries()).toEqual([]);
  });

  it('summarizes a service plugin with runtime + namespaced tools for /health', async () => {
    const mgr = makeManager();
    mgr.sync([servicePlugin()]);
    await waitFor(() => (mgr.getSummaries()[0]?.tools.length ?? 0) > 0);

    const summary = mgr.getSummaries()[0];
    expect(summary.name).toBe('counter');
    expect(summary.version).toBe('1.0.0');
    expect(summary.runtime).toBe('service');
    expect(summary.tools).toContain('counter_increment');
  });
});
