/**
 * Plugin loader — scans a plugins directory for valid plugin manifests
 */

import fs from 'node:fs';
import path from 'node:path';
import { MCP_TOOLS } from '../mcp/tools.js';
import { copyDirRecursive } from '../skill-pack.js';
import type {
  PluginManifest,
  PluginToolDefinition,
  PluginRuntime,
  PluginServiceSpec,
  PluginServiceToolConfig,
  LoadedPlugin,
} from './types.js';

// Fields every manifest needs regardless of runtime. `tools` is required only for the
// `process` tier (service plugins discover their tools live from the child), so it is
// validated separately below.
const BASE_REQUIRED_FIELDS = ['name', 'version', 'description'] as const;
const REQUIRED_TOOL_FIELDS = ['name', 'description', 'inputSchema', 'handler'] as const;

function isValidInputSchema(schema: unknown): schema is Record<string, unknown> {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    !Array.isArray(schema) &&
    typeof (schema as Record<string, unknown>).type === 'string'
  );
}

function validateTool(tool: unknown, pluginName: string): tool is PluginToolDefinition {
  if (typeof tool !== 'object' || tool === null) {
    console.warn(`[plugin:${pluginName}] tool entry is not an object, skipping`);
    return false;
  }
  const t = tool as Record<string, unknown>;
  for (const field of REQUIRED_TOOL_FIELDS) {
    if (t[field] === undefined || t[field] === null) {
      console.warn(`[plugin:${pluginName}] tool missing required field "${field}"`);
      return false;
    }
  }
  if (typeof t.name !== 'string' || typeof t.description !== 'string' || typeof t.handler !== 'string') {
    console.warn(`[plugin:${pluginName}] tool has invalid field types`);
    return false;
  }
  if (!isValidInputSchema(t.inputSchema)) {
    console.warn(`[plugin:${pluginName}] tool "${t.name}" has invalid inputSchema (must be object with "type")`);
    return false;
  }
  return true;
}

/**
 * Normalize the manifest `runtime` field. Defaults to `process`; `exec` is accepted as a
 * back-compat alias (the design-of-record doc spells the default tier `exec`). Returns null
 * for an unrecognized value so the caller can reject the manifest with a clear warning.
 */
function normalizeRuntime(value: unknown): PluginRuntime | null {
  if (value === undefined || value === null) return 'process';
  if (value === 'process' || value === 'exec') return 'process';
  if (value === 'service') return 'service';
  return null;
}

function isPositiveNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** Validate the `service` spawn spec of a `runtime: "service"` manifest. */
function validateServiceSpec(value: unknown, pluginName: string): PluginServiceSpec | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    console.warn(`[plugin:${pluginName}] runtime "service" requires a "service" object`);
    return null;
  }
  const s = value as Record<string, unknown>;
  if (typeof s.command !== 'string' || s.command.trim() === '') {
    console.warn(`[plugin:${pluginName}] service plugin missing required field "service.command"`);
    return null;
  }
  const spec: PluginServiceSpec = { command: s.command };

  if (s.timeoutMs !== undefined) {
    if (!isPositiveNumber(s.timeoutMs)) {
      console.warn(`[plugin:${pluginName}] service.timeoutMs must be a positive number`);
      return null;
    }
    spec.timeoutMs = s.timeoutMs;
  }
  if (s.toolNamespace !== undefined) {
    if (typeof s.toolNamespace !== 'string' || s.toolNamespace.trim() === '') {
      console.warn(`[plugin:${pluginName}] service.toolNamespace must be a non-empty string`);
      return null;
    }
    spec.toolNamespace = s.toolNamespace;
  }
  if (s.tools !== undefined) {
    if (typeof s.tools !== 'object' || s.tools === null || Array.isArray(s.tools)) {
      console.warn(`[plugin:${pluginName}] service.tools must be an object map of tool name → config`);
      return null;
    }
    const tools: Record<string, PluginServiceToolConfig> = {};
    for (const [toolName, cfg] of Object.entries(s.tools as Record<string, unknown>)) {
      if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) {
        console.warn(`[plugin:${pluginName}] service.tools["${toolName}"] must be an object`);
        return null;
      }
      const c = cfg as Record<string, unknown>;
      const toolCfg: PluginServiceToolConfig = {};
      if (c.timeoutMs !== undefined) {
        if (!isPositiveNumber(c.timeoutMs)) {
          console.warn(`[plugin:${pluginName}] service.tools["${toolName}"].timeoutMs must be a positive number`);
          return null;
        }
        toolCfg.timeoutMs = c.timeoutMs;
      }
      tools[toolName] = toolCfg;
    }
    spec.tools = tools;
  }
  return spec;
}

function validateManifest(data: unknown, pluginDir: string): PluginManifest | null {
  if (typeof data !== 'object' || data === null) {
    console.warn(`[plugin:${pluginDir}] manifest is not an object`);
    return null;
  }
  const obj = data as Record<string, unknown>;
  for (const field of BASE_REQUIRED_FIELDS) {
    if (obj[field] === undefined || obj[field] === null) {
      console.warn(`[plugin:${pluginDir}] manifest missing required field "${field}"`);
      return null;
    }
  }
  if (typeof obj.name !== 'string' || typeof obj.version !== 'string' || typeof obj.description !== 'string') {
    console.warn(`[plugin:${pluginDir}] manifest has invalid field types`);
    return null;
  }

  const runtime = normalizeRuntime(obj.runtime);
  if (runtime === null) {
    console.warn(`[plugin:${obj.name}] invalid runtime "${String(obj.runtime)}" (expected "process" or "service")`);
    return null;
  }

  // Service tier: require a valid spawn spec; tools are discovered live (any declared
  // static tools are ignored), so the loaded manifest carries an empty tools array.
  if (runtime === 'service') {
    const service = validateServiceSpec(obj.service, obj.name);
    if (!service) return null;
    return {
      name: obj.name,
      version: obj.version,
      description: obj.description,
      runtime: 'service',
      service,
      tools: [],
    };
  }

  // Process tier (default): tools required and validated as before.
  if (obj.tools === undefined || obj.tools === null) {
    console.warn(`[plugin:${pluginDir}] manifest missing required field "tools"`);
    return null;
  }
  if (!Array.isArray(obj.tools)) {
    console.warn(`[plugin:${pluginDir}] manifest "tools" must be an array`);
    return null;
  }
  const validTools: PluginToolDefinition[] = [];
  for (const tool of obj.tools) {
    if (validateTool(tool, obj.name)) {
      validTools.push(tool);
    }
  }
  if (validTools.length === 0) {
    console.warn(`[plugin:${obj.name}] no valid tools found`);
    return null;
  }
  return {
    name: obj.name,
    version: obj.version,
    description: obj.description,
    runtime: 'process',
    tools: validTools,
  };
}

export function loadPlugins(pluginsDir: string): LoadedPlugin[] {
  if (!fs.existsSync(pluginsDir)) {
    return [];
  }

  const coreToolNames = new Set(MCP_TOOLS.map((t) => t.name));
  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  const plugins: LoadedPlugin[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pluginDir = path.resolve(pluginsDir, entry.name);
    const manifestPath = path.join(pluginDir, 'plugin.json');

    if (!fs.existsSync(manifestPath)) {
      console.warn(`[plugin:${entry.name}] no plugin.json found, skipping`);
      continue;
    }

    let raw: string;
    try {
      raw = fs.readFileSync(manifestPath, 'utf-8');
    } catch (err) {
      console.warn(`[plugin:${entry.name}] failed to read plugin.json: ${err}`);
      continue;
    }

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      console.warn(`[plugin:${entry.name}] plugin.json is not valid JSON`);
      continue;
    }

    const manifest = validateManifest(data, entry.name);
    if (!manifest) continue;

    // Check for tool name collisions with core MCP tools
    const collisions = manifest.tools.filter((t) => coreToolNames.has(t.name));
    if (collisions.length > 0) {
      const names = collisions.map((t) => t.name).join(', ');
      console.warn(`[plugin:${manifest.name}] tool name collision with core tools: ${names}`);
      continue;
    }

    plugins.push({ manifest, dir: pluginDir, valid: true });
  }

  return plugins;
}

/**
 * Map loaded plugins to the lightweight summary the /health endpoint returns
 * (and the portal renders): name, version, description, and tool names.
 */
export function summarizePlugins(
  plugins: LoadedPlugin[],
): { name: string; version: string; description?: string; tools: string[] }[] {
  return plugins.map((p) => ({
    name: p.manifest.name,
    version: p.manifest.version,
    description: p.manifest.description,
    tools: p.manifest.tools.map((t) => t.name),
  }));
}

/**
 * Read and validate a plugin manifest from a directory.
 * Throws on invalid manifest (used by CLI install to give clear errors).
 */
export function readPluginManifest(pluginDir: string): PluginManifest {
  const manifestPath = path.join(pluginDir, 'plugin.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No plugin.json found in ${pluginDir}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    throw new Error(`plugin.json is not valid JSON`);
  }

  const manifest = validateManifest(data, pluginDir);
  if (!manifest) {
    throw new Error(`Invalid plugin.json — check required fields (name, version, description, tools)`);
  }

  return manifest;
}

/**
 * Install a plugin from a local directory to pluginsDir/<name>/
 */
export function installPlugin(
  sourceDir: string,
  pluginsDir: string,
): { name: string; toolCount: number; toolNames: string[] } {
  const manifest = readPluginManifest(sourceDir);
  const dest = path.join(pluginsDir, manifest.name);

  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true });
  }

  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true });
  }

  copyDirRecursive(sourceDir, dest, { skip: ['.git', 'node_modules'] });

  return {
    name: manifest.name,
    toolCount: manifest.tools.length,
    toolNames: manifest.tools.map(t => t.name),
  };
}

/**
 * Remove a plugin by name from pluginsDir
 */
export function removePlugin(
  name: string,
  pluginsDir: string,
): { name: string; toolCount: number } {
  const pluginDir = path.join(pluginsDir, name);

  if (!fs.existsSync(pluginDir)) {
    throw new Error(`Plugin not found: ${name}`);
  }

  let toolCount = 0;
  try {
    const manifest = readPluginManifest(pluginDir);
    toolCount = manifest.tools.length;
  } catch {
    // can't read manifest, still remove
  }

  fs.rmSync(pluginDir, { recursive: true });

  return { name, toolCount };
}
