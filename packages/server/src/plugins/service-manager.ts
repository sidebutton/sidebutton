/**
 * Persistent service-plugin manager.
 *
 * A `runtime: "service"` plugin runs as a long-lived child stdio MCP server. The SideButton
 * server keeps one child alive per service plugin and *aggregates* it: discovering the child's
 * tools (`tools/list`), exposing them slug-namespaced, and forwarding `tools/call`. Unlike the
 * stateless `process` tier (a fresh handler per call), the child holds state across calls —
 * which is what stateful plugins like computer-use (held mouse button, screenshot-coordinate
 * session) require.
 *
 * Modeled on the persistent `ExtensionClientImpl`, but built on the MCP SDK's `Client` +
 * `StdioClientTransport` so framing, timeouts, and child-stdout isolation are handled by the SDK.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { McpTool } from '../mcp/tools.js';
import type { LoadedPlugin, PluginServiceSpec } from './types.js';

/** Bound on the spawn handshake + initial tools/list (ms). */
const CONNECT_TIMEOUT_MS = 20_000;
/** Fallback per-call timeout when neither the service nor the tool overrides it (ms). */
const DEFAULT_SERVICE_TIMEOUT_MS = 120_000;
/** Restart backoff bounds. */
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;
/** Give up after this many consecutive failed (re)starts so a broken plugin can't spin forever. */
const MAX_CONSECUTIVE_FAILURES = 6;
/** How long a call will wait for a (re)starting child to become ready before erroring (ms). */
const READY_WAIT_MS = 5_000;

/** Result of a forwarded service-plugin tool call — the child's raw MCP `CallToolResult`. */
export interface ServiceCallResult {
  content: unknown[];
  isError?: boolean;
  [key: string]: unknown;
}

/** A child tool, namespaced for the aggregated surface. */
interface ServiceTool {
  /** Public, namespaced name exposed in tools/list: `<namespace>_<rawName>`. */
  name: string;
  /** The child's own (un-namespaced) tool name, used when forwarding. */
  rawName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Lightweight summary surfaced via /health + the portal. */
export interface ServicePluginSummary {
  name: string;
  version: string;
  description?: string;
  runtime: 'service';
  tools: string[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitCommand(command: string): { command: string; args: string[] } {
  const parts = command.trim().split(/\s+/);
  return { command: parts[0], args: parts.slice(1) };
}

/**
 * Build the child's environment. Mirrors the process-tier executor's `{ ...process.env }` trust
 * model so the child sees the full server environment (incl. `DISPLAY` for desktop automation) —
 * the SDK otherwise restricts a spawned child to a safe default subset that omits `DISPLAY`.
 */
function buildChildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  return env;
}

function errorResult(text: string): ServiceCallResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/**
 * One persistent service plugin: owns its child process, discovered tools, restart lifecycle,
 * and per-plugin call serialization.
 */
class ServicePlugin {
  readonly slug: string;
  readonly version: string;
  readonly description: string;
  readonly dir: string;
  readonly spec: PluginServiceSpec;
  /** Signature of the spawn spec; `sync()` restarts the child only when this changes. */
  readonly specKey: string;

  private readonly namespace: string;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private tools: ServiceTool[] = [];
  private ready = false;
  /** Set on intentional teardown so the close handler does not schedule a restart. */
  private stopped = false;
  private startPromise: Promise<void> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveFailures = 0;
  /** Promise-chain mutex: forwarded calls run one-at-a-time per plugin. */
  private callChain: Promise<unknown> = Promise.resolve();

  constructor(plugin: LoadedPlugin) {
    if (!plugin.manifest.service) {
      throw new Error(`plugin "${plugin.manifest.name}" is not a service plugin`);
    }
    this.slug = plugin.manifest.name;
    this.version = plugin.manifest.version;
    this.description = plugin.manifest.description;
    this.dir = plugin.dir;
    this.spec = plugin.manifest.service;
    this.namespace = this.spec.toolNamespace ?? this.slug;
    this.specKey = ServicePlugin.computeSpecKey(plugin);
  }

  static computeSpecKey(plugin: LoadedPlugin): string {
    return JSON.stringify({ dir: plugin.dir, service: plugin.manifest.service ?? null });
  }

  isReady(): boolean {
    return this.ready;
  }

  getTools(): readonly ServiceTool[] {
    return this.tools;
  }

  findTool(namespacedName: string): ServiceTool | null {
    return this.tools.find((t) => t.name === namespacedName) ?? null;
  }

  /** Resolve the effective per-call timeout for a child tool (per-tool → service → default). */
  resolveTimeout(rawName: string): number {
    return this.spec.tools?.[rawName]?.timeoutMs ?? this.spec.timeoutMs ?? DEFAULT_SERVICE_TIMEOUT_MS;
  }

  /** The child PID while running (null once stopped) — used for teardown assertions. */
  getPid(): number | null {
    return this.transport?.pid ?? null;
  }

  summary(): ServicePluginSummary {
    return {
      name: this.slug,
      version: this.version,
      description: this.description,
      runtime: 'service',
      tools: this.tools.map((t) => t.name),
    };
  }

  /** Spawn + connect the child (idempotent: a concurrent or already-ready start is reused). */
  async start(): Promise<void> {
    if (this.ready) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.doStart();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async doStart(): Promise<void> {
    this.stopped = false;
    const { command, args } = splitCommand(this.spec.command);
    const transport = new StdioClientTransport({
      command,
      args,
      cwd: this.dir,
      env: buildChildEnv(),
      stderr: 'inherit', // child stderr → our logs; child stdout is the MCP channel (SDK-isolated)
    });
    const client = new Client(
      { name: `sidebutton-service-${this.slug}`, version: this.version },
      { capabilities: {} },
    );
    // Hook protocol-level close/error (set on the Client, not the transport: connect() overwrites
    // transport.onclose with its own handler, which in turn invokes client.onclose).
    client.onclose = () => this.handleChildExit();
    client.onerror = (err) => {
      process.stderr.write(`[plugin:${this.slug}] service error: ${err.message}\n`);
    };

    try {
      await client.connect(transport, { timeout: CONNECT_TIMEOUT_MS });
      const listed = await client.listTools(undefined, { timeout: CONNECT_TIMEOUT_MS });
      this.client = client;
      this.transport = transport;
      this.tools = (listed.tools ?? []).map((t) => ({
        name: `${this.namespace}_${t.name}`,
        rawName: t.name,
        description: t.description ?? '',
        inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object' },
      }));
      this.ready = true;
      this.consecutiveFailures = 0;
      process.stderr.write(`[plugin:${this.slug}] service started (${this.tools.length} tools)\n`);
    } catch (err) {
      this.ready = false;
      this.client = null;
      this.transport = null;
      try {
        await transport.close();
      } catch {
        /* ignore */
      }
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[plugin:${this.slug}] service start failed: ${msg}\n`);
      this.scheduleRestart();
      throw err;
    }
  }

  /** Child exited (crash or intentional). Clear state and, unless stopping, schedule a restart. */
  private handleChildExit(): void {
    const wasReady = this.ready;
    this.ready = false;
    this.client = null;
    this.transport = null;
    if (this.stopped) return;
    if (wasReady) {
      process.stderr.write(`[plugin:${this.slug}] service exited unexpectedly — restarting\n`);
    }
    this.scheduleRestart();
  }

  private scheduleRestart(): void {
    if (this.stopped || this.restartTimer || this.ready) return;
    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      process.stderr.write(
        `[plugin:${this.slug}] giving up after ${this.consecutiveFailures} consecutive failed starts\n`,
      );
      return;
    }
    const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** this.consecutiveFailures);
    this.consecutiveFailures += 1;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.stopped || this.ready) return;
      void this.start().catch(() => {
        /* doStart() already scheduled the next retry */
      });
    }, backoff);
    this.restartTimer.unref();
  }

  /** Wait (bounded) for a (re)starting child to become ready, kicking a start if idle. */
  private async ensureReady(maxWaitMs: number): Promise<boolean> {
    if (this.ready) return true;
    if (!this.stopped && !this.startPromise && !this.restartTimer) {
      void this.start().catch(() => {});
    }
    const deadline = Date.now() + maxWaitMs;
    while (!this.ready && !this.stopped && Date.now() < deadline) {
      await delay(50);
    }
    return this.ready;
  }

  /** Forward a tool call, serialized behind any in-flight call for this plugin. */
  callTool(rawName: string, args: Record<string, unknown>, timeoutMs: number): Promise<ServiceCallResult> {
    const result = this.callChain.then(
      () => this.invoke(rawName, args, timeoutMs),
      () => this.invoke(rawName, args, timeoutMs),
    );
    // Keep the chain alive regardless of this call's outcome.
    this.callChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async invoke(
    rawName: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ServiceCallResult> {
    if (!this.ready || !this.client) {
      const ok = await this.ensureReady(Math.min(timeoutMs, READY_WAIT_MS));
      if (!ok || !this.client) {
        return errorResult(`service plugin "${this.slug}" is not ready`);
      }
    }
    try {
      const res = await this.client.callTool({ name: rawName, arguments: args }, undefined, {
        timeout: timeoutMs,
      });
      return res as unknown as ServiceCallResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`service plugin "${this.slug}" tool "${rawName}" failed: ${msg}`);
    }
  }

  /** Graceful, intentional shutdown — no restart. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.ready = false;
    const client = this.client;
    const transport = this.transport;
    this.client = null;
    this.transport = null;
    try {
      await client?.close();
    } catch {
      /* ignore */
    }
    try {
      await transport?.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Owns every service plugin. Diff-based `sync()` keeps the running set in step with what's loaded
 * from disk without thrashing healthy children on the frequent `reload()` calls.
 */
export class PluginServiceManager {
  private services = new Map<string, ServicePlugin>();

  /**
   * Reconcile running children with the desired set: start added, stop removed, restart changed,
   * leave unchanged ones running. Idempotent — safe to call on every `McpHandler.reload()`.
   */
  sync(plugins: LoadedPlugin[]): void {
    const desired = new Map<string, LoadedPlugin>();
    for (const p of plugins) {
      if (p.manifest.runtime === 'service' && p.manifest.service) {
        desired.set(p.manifest.name, p);
      }
    }

    // Stop services that are no longer present.
    for (const [slug, svc] of [...this.services]) {
      if (!desired.has(slug)) {
        this.services.delete(slug);
        void svc.stop();
      }
    }

    // Start new services; restart those whose spawn spec changed; leave the rest alone.
    for (const [slug, plugin] of desired) {
      const existing = this.services.get(slug);
      if (!existing) {
        const svc = new ServicePlugin(plugin);
        this.services.set(slug, svc);
        void svc.start().catch(() => {});
      } else if (existing.specKey !== ServicePlugin.computeSpecKey(plugin)) {
        this.services.delete(slug);
        void existing.stop();
        const svc = new ServicePlugin(plugin);
        this.services.set(slug, svc);
        void svc.start().catch(() => {});
      }
    }
  }

  /**
   * Aggregated, slug-namespaced tools from every ready child. A tool whose namespaced name
   * collides with `reserved` (core tools + process-plugin tools) or an earlier service tool is
   * dropped with a warning — only the colliding tool, never the whole plugin.
   */
  getAggregatedTools(reserved: ReadonlySet<string>): McpTool[] {
    const out: McpTool[] = [];
    const seen = new Set<string>(reserved);
    for (const svc of this.services.values()) {
      if (!svc.isReady()) continue;
      for (const tool of svc.getTools()) {
        if (seen.has(tool.name)) {
          console.warn(`[plugin:${svc.slug}] aggregated tool "${tool.name}" collides with an existing tool — dropping`);
          continue;
        }
        seen.add(tool.name);
        out.push({
          name: tool.name,
          description: `[plugin: ${svc.slug}] ${tool.description}`,
          inputSchema: tool.inputSchema,
        });
      }
    }
    return out;
  }

  /**
   * Route a `tools/call` to the owning service by namespaced name. Returns null if no service
   * owns the tool (so the caller can fall through to its not-found handling).
   */
  routeCall(name: string, args: Record<string, unknown>): Promise<ServiceCallResult> | null {
    for (const svc of this.services.values()) {
      const tool = svc.findTool(name);
      if (tool) {
        return svc.callTool(tool.rawName, args, svc.resolveTimeout(tool.rawName));
      }
    }
    return null;
  }

  getSummaries(): ServicePluginSummary[] {
    return [...this.services.values()].map((svc) => svc.summary());
  }

  /** Stop and clear all children (server shutdown). */
  async shutdownAll(): Promise<void> {
    const all = [...this.services.values()];
    this.services.clear();
    await Promise.all(all.map((svc) => svc.stop().catch(() => {})));
  }
}
