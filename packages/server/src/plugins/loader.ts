/**
 * Plugin loader — discovers plugins from a directory of plugin folders,
 * each containing a plugin.json manifest.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LoadedPlugin, PluginManifest } from './types.js';

export function loadPlugins(pluginsDir: string): LoadedPlugin[] {
  if (!fs.existsSync(pluginsDir)) return [];

  const plugins: LoadedPlugin[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const pluginDir = path.join(pluginsDir, entry.name);
    const manifestPath = path.join(pluginDir, 'plugin.json');

    if (!fs.existsSync(manifestPath)) continue;

    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw) as PluginManifest;

      if (!manifest.name || !Array.isArray(manifest.tools)) continue;

      plugins.push({ manifest, dir: pluginDir });
    } catch {
      // skip invalid manifests
    }
  }

  return plugins;
}
