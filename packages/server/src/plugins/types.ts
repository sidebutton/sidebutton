/**
 * Plugin system types
 */

export interface PluginToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: string;
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  tools: PluginToolDefinition[];
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  dir: string;
  valid: boolean;
}
