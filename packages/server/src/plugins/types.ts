/**
 * Plugin system types
 */

export interface PluginToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: string; // command to spawn (e.g., "node handler.js")
}

export interface PluginManifest {
  name: string;
  version?: string;
  tools: PluginToolDefinition[];
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  dir: string; // absolute path to plugin directory
}
