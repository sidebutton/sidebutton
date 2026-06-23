/**
 * Plugin system types
 */

export interface PluginToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: string;
}

/**
 * Execution tier of a plugin.
 * - `process` (default): stateless spawn-per-call — each `tools/call` spawns a fresh
 *   handler process (stdin → JSON → stdout), 30s SIGKILL, no shared state.
 * - `service`: a persistent child stdio MCP server the SideButton server keeps alive
 *   and aggregates. Holds state across calls, custom per-tool timeouts, calls serialized.
 *
 * `exec` is accepted as a back-compat alias of `process` (the design-of-record doc spells
 * the default tier `exec`); the loader normalizes it to `process`.
 */
export type PluginRuntime = 'process' | 'service';

/** Per-tool override for a service plugin, keyed by the child's (un-namespaced) tool name. */
export interface PluginServiceToolConfig {
  /** Per-call timeout for this tool, in milliseconds (overrides the service default). */
  timeoutMs?: number;
}

/** Spawn + aggregation spec for a `runtime: "service"` plugin. */
export interface PluginServiceSpec {
  /** Command line spawned once to run the persistent child stdio MCP server (e.g. `node server.js`). */
  command: string;
  /** Default per-call timeout for this service's tools, in milliseconds. */
  timeoutMs?: number;
  /**
   * Namespace prefix for the child's tools (`<namespace>_<tool>`). Defaults to the plugin name.
   * Lets a plugin pin a stable public prefix independent of its directory/name.
   */
  toolNamespace?: string;
  /** Per-tool overrides, keyed by the child's (un-namespaced) tool name. */
  tools?: Record<string, PluginServiceToolConfig>;
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  /** Execution tier. Defaults to `process` when omitted. */
  runtime?: PluginRuntime;
  /** Required when `runtime` is `service`; ignored otherwise. */
  service?: PluginServiceSpec;
  /**
   * Static tool definitions. Required (non-empty) for `process` plugins.
   * For `service` plugins this is normalized to `[]` — their tools are discovered
   * live from the child's `tools/list` instead of declared here.
   */
  tools: PluginToolDefinition[];
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  dir: string;
  valid: boolean;
}
