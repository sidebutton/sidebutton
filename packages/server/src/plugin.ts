/**
 * Plugin management: load, install, remove plugins from ~/.sidebutton/plugins/
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { copyDirRecursive } from './skill-pack.js';

const MANIFEST_FILE = 'plugin.json';

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  tools: PluginToolDef[];
}

export interface PluginToolDef {
  name: string;
  description?: string;
  handler: string;
}

export interface LoadedPlugin {
  name: string;
  version: string;
  description?: string;
  tools: PluginToolDef[];
  dir: string;
}

export function readPluginManifest(pluginDir: string): PluginManifest {
  const manifestPath = path.join(pluginDir, MANIFEST_FILE);

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No ${MANIFEST_FILE} found in ${pluginDir}`);
  }

  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  if (!raw.name || typeof raw.name !== 'string') {
    throw new Error(`${MANIFEST_FILE}: missing or invalid "name" field`);
  }
  if (!raw.version || typeof raw.version !== 'string') {
    throw new Error(`${MANIFEST_FILE}: missing or invalid "version" field`);
  }
  if (!Array.isArray(raw.tools)) {
    throw new Error(`${MANIFEST_FILE}: missing or invalid "tools" array`);
  }

  for (const tool of raw.tools) {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error(`${MANIFEST_FILE}: each tool must have a "name" string`);
    }
    if (!tool.handler || typeof tool.handler !== 'string') {
      throw new Error(`${MANIFEST_FILE}: tool "${tool.name}" missing "handler" field`);
    }
  }

  return raw as PluginManifest;
}

export function getPluginsDir(configDir: string): string {
  return path.join(configDir, 'plugins');
}

export function loadPlugins(configDir: string): LoadedPlugin[] {
  const pluginsDir = getPluginsDir(configDir);
  if (!fs.existsSync(pluginsDir)) return [];

  const plugins: LoadedPlugin[] = [];

  for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pluginDir = path.join(pluginsDir, entry.name);
    try {
      const manifest = readPluginManifest(pluginDir);
      plugins.push({
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        tools: manifest.tools,
        dir: pluginDir,
      });
    } catch {
      // skip invalid plugins
    }
  }

  return plugins.sort((a, b) => a.name.localeCompare(b.name));
}

export function installPlugin(
  sourceDir: string,
  configDir: string,
): { name: string; toolCount: number; toolNames: string[] } {
  const manifest = readPluginManifest(sourceDir);
  const pluginsDir = getPluginsDir(configDir);
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

export function removePlugin(
  name: string,
  configDir: string,
): { name: string; toolCount: number } {
  const pluginsDir = getPluginsDir(configDir);
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
