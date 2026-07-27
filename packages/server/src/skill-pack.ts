/**
 * Skill pack management: install, uninstall, list skill packs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { SkillPackManifest, InstalledPack } from '@sidebutton/core';

export type { SkillPackManifest, InstalledPack };

export interface RegistryIndexEntry {
  name: string;
  domain: string;
  version: string;
  title: string;
  description: string;
  path: string;
  requires?: { browser?: boolean; llm?: boolean };
  private?: boolean;
  roles?: string[];
}

export interface RegistryIndex {
  version: number;
  name: string;
  packs: RegistryIndexEntry[];
}

const MANIFEST_FILE = 'skill-pack.json';
const INSTALLED_DIR = '.installed';
const INSTALLED_FILE = 'skill-packs.json';
const SKIP_PATTERNS = [MANIFEST_FILE, 'README.md', '.git'];

/**
 * Manifest `source` marker for packs seeded from the server's bundled
 * defaults/skills/ rather than installed by the user. Seeded packs are vendor
 * content, so `installSkillPack` may replace them at any version delta without
 * --force — a plain `sidebutton install agents` (fleet provisioning, step
 * base/13) must upgrade a stale seed instead of refusing over "user content".
 */
export const DEFAULTS_SEED_SOURCE = 'defaults';
const COLLECT_SKIP = new Set(['.git', '.DS_Store', 'node_modules', MANIFEST_FILE, 'README.md']);

export function readSkillPackManifest(packDir: string): SkillPackManifest {
  const manifestPath = path.join(packDir, MANIFEST_FILE);

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No ${MANIFEST_FILE} found in ${packDir}`);
  }

  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  for (const field of ['name', 'version', 'domain'] as const) {
    if (!raw[field] || typeof raw[field] !== 'string') {
      throw new Error(`${MANIFEST_FILE}: missing or invalid "${field}" field`);
    }
  }

  return raw as SkillPackManifest;
}

export function validateSkillPack(packDir: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Validate manifest
  try {
    readSkillPackManifest(packDir);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { errors, warnings };
  }

  // 2. Check _skill.md exists
  if (!fs.existsSync(path.join(packDir, '_skill.md'))) {
    errors.push('Missing _skill.md — every skill pack needs a root skill file.');
  }

  // 3. Validate YAML files parse correctly
  scanForYaml(packDir, errors);

  // 4. Check _roles/ directory
  const rolesDir = path.join(packDir, '_roles');
  if (!fs.existsSync(rolesDir) || !fs.statSync(rolesDir).isDirectory()) {
    warnings.push('No _roles/ directory — role playbooks recommended.');
  }

  return { errors, warnings };
}

function scanForYaml(dir: string, errors: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanForYaml(fullPath, errors);
    } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        yaml.load(content);
      } catch (err) {
        errors.push(`Invalid YAML: ${fullPath} — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

export function getInstalledManifest(configDir: string): Record<string, InstalledPack> {
  const filePath = path.join(configDir, INSTALLED_DIR, INSTALLED_FILE);

  if (!fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function saveInstalledManifest(configDir: string, manifest: Record<string, InstalledPack>): void {
  const dir = path.join(configDir, INSTALLED_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(path.join(dir, INSTALLED_FILE), JSON.stringify(manifest, null, 2));
}

export function installSkillPack(
  packDir: string,
  configDir: string,
  options: { force?: boolean } = {},
): { domain: string; filesInstalled: number; status: 'installed' | 'skipped' | 'updated' } {
  const manifest = readSkillPackManifest(packDir);
  const dest = path.join(configDir, 'skills', manifest.domain);
  const installed = getInstalledManifest(configDir);
  const existing = installed[manifest.domain];

  if (existing) {
    if (existing.version === manifest.version && !options.force) {
      return { domain: manifest.domain, filesInstalled: 0, status: 'skipped' };
    }
    // A version mismatch needs --force to protect user-managed installs — but
    // not for packs seeded from the bundled defaults: those are vendor content
    // and the incoming pack is authoritative regardless of version direction.
    if (
      existing.version !== manifest.version &&
      existing.source !== DEFAULTS_SEED_SOURCE &&
      !options.force
    ) {
      throw new Error(
        `Already installed (v${existing.version}). Use --force to overwrite.`,
      );
    }
  } else if (fs.existsSync(dest) && !options.force) {
    throw new Error(
      `Directory ${dest} already exists with user content. Use --force to overwrite.`,
    );
  }

  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true });
  }

  const filesInstalled = copyDirRecursive(packDir, dest, { skip: SKIP_PATTERNS });

  installed[manifest.domain] = {
    name: manifest.name,
    version: manifest.version,
    domain: manifest.domain,
    title: manifest.title || manifest.name,
    installedAt: new Date().toISOString(),
    source: path.resolve(packDir),
  };

  saveInstalledManifest(configDir, installed);

  const status = existing ? 'updated' : 'installed';
  return { domain: manifest.domain, filesInstalled, status };
}

/**
 * Seed a skill pack bundled in the server's defaults/ into a config dir.
 *
 * Unlike installSkillPack this copies the tree verbatim — skill-pack.json
 * included — so the result is indistinguishable from a remote install and the
 * publish round-trip keeps working. The pack is registered in the installed
 * manifest under DEFAULTS_SEED_SOURCE, which is what later lets a plain
 * `sidebutton install <domain>` upgrade it without --force.
 *
 * Returns null when packDir has no valid manifest (the caller may still treat
 * it as plain content); never overwrites an existing install or directory.
 */
export function seedSkillPack(
  packDir: string,
  configDir: string,
): { domain: string; filesInstalled: number; status: 'seeded' | 'skipped' } | null {
  let manifest: SkillPackManifest;
  try {
    manifest = readSkillPackManifest(packDir);
  } catch {
    return null;
  }

  const dest = path.join(configDir, 'skills', manifest.domain);
  const installed = getInstalledManifest(configDir);
  if (installed[manifest.domain] || fs.existsSync(dest)) {
    return { domain: manifest.domain, filesInstalled: 0, status: 'skipped' };
  }

  const filesInstalled = copyDirRecursive(packDir, dest, { skip: ['.git', '.DS_Store'] });

  installed[manifest.domain] = {
    name: manifest.name,
    version: manifest.version,
    domain: manifest.domain,
    title: manifest.title || manifest.name,
    installedAt: new Date().toISOString(),
    source: DEFAULTS_SEED_SOURCE,
  };
  saveInstalledManifest(configDir, installed);

  return { domain: manifest.domain, filesInstalled, status: 'seeded' };
}

export function uninstallSkillPack(domain: string, configDir: string): void {
  const installed = getInstalledManifest(configDir);

  if (!installed[domain]) {
    throw new Error(`Skill pack not installed: ${domain}`);
  }

  const dest = path.join(configDir, 'skills', domain);
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true });
  }

  delete installed[domain];
  saveInstalledManifest(configDir, installed);
}

export function listInstalledPacks(configDir: string): InstalledPack[] {
  const manifest = getInstalledManifest(configDir);
  return Object.values(manifest).sort((a, b) => a.domain.localeCompare(b.domain));
}

export function copyDirRecursive(
  src: string,
  dest: string,
  options: { skip?: string[] } = {},
): number {
  const skip = new Set(options.skip ?? []);

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  let count = 0;
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (skip.has(entry.name)) continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      count += copyDirRecursive(srcPath, destPath, { skip: ['.git'] });
    } else {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }

  return count;
}

/**
 * Collect all files from a skill pack directory into a flat map.
 * Keys are relative paths, values are file content (utf-8).
 * Skips .git, .DS_Store, node_modules, skill-pack.json, README.md.
 */
export function collectPackFiles(packDir: string): { manifest: SkillPackManifest; files: Record<string, string> } {
  const manifest = readSkillPackManifest(packDir);
  const files: Record<string, string> = {};

  function scan(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (COLLECT_SKIP.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else {
        const relPath = path.relative(packDir, fullPath);
        files[relPath] = fs.readFileSync(fullPath, 'utf-8');
      }
    }
  }

  scan(packDir);
  return { manifest, files };
}
