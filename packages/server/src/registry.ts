/**
 * Skill pack registry: add, remove, update, search, resolve registries
 *
 * Two registry types:
 * - local: a directory on disk, read directly (no git)
 * - git: a remote git repo, cloned to ~/.sidebutton/registries/<name>/
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import type { SkillRegistry } from '@sidebutton/core';
import type { RegistryIndex, RegistryIndexEntry } from './skill-pack.js';
import { readSkillPackManifest, installSkillPack, uninstallSkillPack, getInstalledManifest } from './skill-pack.js';

const execFileAsync = promisify(execFile);
const INDEX_FILE = 'index.json';
const REGISTRIES_DIR = 'registries';
const GIT_TIMEOUT = 30_000;

// ============================================================================
// Settings I/O (raw JSON — no env var substitution to avoid corrupting ${...})
// ============================================================================

interface RawSettings {
  skill_registries?: SkillRegistry[];
  [key: string]: unknown;
}

function readRawSettings(configDir: string): RawSettings {
  const settingsPath = path.join(configDir, 'settings.json');
  if (!fs.existsSync(settingsPath)) return {};
  return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
}

function writeRawSettings(configDir: string, settings: RawSettings): void {
  const settingsPath = path.join(configDir, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// ============================================================================
// Helpers
// ============================================================================

export function deriveRegistryName(url: string): string {
  // Git URL: https://github.com/acme/sidebutton-skills → acme-sidebutton-skills
  // Git SSH: git@github.com:acme/sidebutton-skills.git → acme-sidebutton-skills
  // Local: ./my-packs → my-packs, /opt/packs → packs

  let name = url;

  // Strip protocol
  name = name.replace(/^(https?:\/\/|git@)/, '');
  // Strip .git suffix
  name = name.replace(/\.git$/, '');
  // Replace host separators
  name = name.replace(/[/:]/g, '-');
  // Take last two segments (org-repo)
  const parts = name.split('-').filter(Boolean);
  if (parts.length > 2) {
    // e.g. github.com-acme-sidebutton-skills → acme-sidebutton-skills
    // Find the last segments after stripping the host
    const stripped = url.replace(/^(https?:\/\/|git@)/, '').replace(/\.git$/, '');
    const pathPart = stripped.includes(':') ? stripped.split(':')[1] : stripped.split('/').slice(1).join('/');
    if (pathPart) {
      name = pathPart.replace(/\//g, '-');
    }
  }

  // For local paths, use the basename
  if (url.startsWith('.') || url.startsWith('/') || url.startsWith('~')) {
    name = path.basename(path.resolve(url));
  }

  return name.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function detectType(url: string): 'local' | 'git' {
  // URLs with protocol or git@ prefix are always git
  if (url.includes('://') || url.startsWith('git@')) {
    return 'git';
  }
  // Paths ending in .git are git repos (bare or otherwise)
  if (url.endsWith('.git')) {
    return 'git';
  }
  // Filesystem paths are local
  if (url.startsWith('.') || url.startsWith('/') || url.startsWith('~') || url.startsWith('\\')) {
    return 'local';
  }
  // Default to local for bare paths
  return 'local';
}

export function getRegistryDir(registry: SkillRegistry, configDir: string): string {
  if (registry.type === 'local') {
    return path.resolve(registry.url);
  }
  return path.join(configDir, REGISTRIES_DIR, registry.name);
}

// ============================================================================
// Read & Validate Index
// ============================================================================

export function readRegistryIndex(registryDir: string): RegistryIndex {
  const indexPath = path.join(registryDir, INDEX_FILE);

  if (!fs.existsSync(indexPath)) {
    throw new Error('No index.json found. Not a valid skill pack registry.');
  }

  const raw = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

  if (typeof raw.version !== 'number' || !Array.isArray(raw.packs)) {
    throw new Error('Invalid index.json: missing "version" or "packs" field.');
  }

  return raw as RegistryIndex;
}

// ============================================================================
// Generate index.json from pack manifests
// ============================================================================

export function generateRegistryIndex(registryDir: string): RegistryIndex {
  const MANIFEST_FILE = 'skill-pack.json';

  // Scan for subdirectories containing skill-pack.json
  const entries = fs.readdirSync(registryDir, { withFileTypes: true });
  const packs: RegistryIndexEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const packDir = path.join(registryDir, entry.name);
    const manifestPath = path.join(packDir, MANIFEST_FILE);
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = readSkillPackManifest(packDir);
    packs.push({
      name: manifest.name,
      domain: manifest.domain,
      version: manifest.version,
      title: manifest.title || manifest.name,
      description: manifest.description || '',
      path: entry.name,
      requires: manifest.requires,
      private: manifest.private,
      roles: manifest.roles,
    });
  }

  // Preserve registry-level fields from existing index.json if present
  let registryName = path.basename(registryDir);
  let registryDescription: string | undefined;
  let registryPrivate: boolean | undefined;

  const indexPath = path.join(registryDir, INDEX_FILE);
  if (fs.existsSync(indexPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      if (existing.name) registryName = existing.name;
      if (existing.description) registryDescription = existing.description;
      if (existing.private !== undefined) registryPrivate = existing.private;
    } catch {
      // Ignore parse errors — will overwrite
    }
  }

  const index: RegistryIndex & { description?: string; private?: boolean } = {
    version: 1,
    name: registryName,
    packs,
  };
  if (registryDescription) index.description = registryDescription;
  if (registryPrivate !== undefined) index.private = registryPrivate;

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  return index;
}

// ============================================================================
// Registry CRUD
// ============================================================================

export interface AddRegistryResult {
  registry: SkillRegistry;
  installed: { domain: string; filesInstalled: number; status: string }[];
}

export async function addRegistry(
  url: string,
  configDir: string,
  opts?: { name?: string; type?: 'local' | 'git' },
): Promise<AddRegistryResult> {
  const type = opts?.type ?? detectType(url);
  const name = opts?.name ?? deriveRegistryName(url);

  // Check for name collision
  const settings = readRawSettings(configDir);
  const registries = settings.skill_registries ?? [];

  if (registries.some(r => r.name === name)) {
    throw new Error(`Registry '${name}' already exists. Remove it first or use --name.`);
  }

  let registryDir: string;

  if (type === 'local') {
    const resolved = path.resolve(url);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Directory not found: ${resolved}`);
    }
    readRegistryIndex(resolved);
    registryDir = resolved;

    const registry: SkillRegistry = { name, type, url: resolved, enabled: true };
    settings.skill_registries = [...registries, registry];
    writeRawSettings(configDir, settings);

    const installed = installAllFromRegistry(registryDir, name, configDir);
    return { registry, installed };
  }

  // Git registry — clone
  const destDir = path.join(configDir, REGISTRIES_DIR, name);

  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true });
  }

  fs.mkdirSync(destDir, { recursive: true });

  try {
    await execFileAsync('git', ['clone', '--depth', '1', url, destDir], {
      timeout: GIT_TIMEOUT,
    });
  } catch (error: unknown) {
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true });

    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error('git is required for remote registries. Install git and try again.');
    }
    const stderr = error && typeof error === 'object' && 'stderr' in error
      ? String((error as { stderr: unknown }).stderr).trim()
      : String(error);
    throw new Error(`git clone failed: ${stderr}`);
  }

  try {
    readRegistryIndex(destDir);
  } catch {
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true });
    throw new Error('No index.json found. Not a valid skill pack registry.');
  }

  registryDir = destDir;
  const registry: SkillRegistry = { name, type, url, enabled: true };
  settings.skill_registries = [...registries, registry];
  writeRawSettings(configDir, settings);

  const installed = installAllFromRegistry(registryDir, name, configDir);
  return { registry, installed };
}

export function removeRegistry(name: string, configDir: string): string[] {
  const settings = readRawSettings(configDir);
  const registries = settings.skill_registries ?? [];
  const registry = registries.find(r => r.name === name);

  if (!registry) {
    throw new Error(`Registry not found: ${name}`);
  }

  // Uninstall all packs that came from this registry
  const uninstalled = uninstallAllFromRegistry(name, configDir);

  // Delete cloned directory for git registries
  if (registry.type === 'git') {
    const destDir = path.join(configDir, REGISTRIES_DIR, name);
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true });
    }
  }

  settings.skill_registries = registries.filter(r => r.name !== name);
  writeRawSettings(configDir, settings);
  return uninstalled;
}

export async function updateRegistry(
  configDir: string,
  name?: string,
): Promise<{ name: string; status: string; installed: { domain: string; filesInstalled: number; status: string }[] }[]> {
  const settings = readRawSettings(configDir);
  const registries = settings.skill_registries ?? [];
  const results: { name: string; status: string; installed: { domain: string; filesInstalled: number; status: string }[] }[] = [];

  const targets = name
    ? registries.filter(r => r.name === name)
    : registries;

  if (name && targets.length === 0) {
    throw new Error(`Registry not found: ${name}`);
  }

  for (const registry of targets) {
    if (registry.type === 'local') {
      // Local registries: re-install all packs (picks up any file changes)
      const registryDir = path.resolve(registry.url);
      const installed = installAllFromRegistry(registryDir, registry.name, configDir, { force: true });
      results.push({ name: registry.name, status: 'updated (local)', installed });
      continue;
    }

    const destDir = path.join(configDir, REGISTRIES_DIR, registry.name);

    if (!fs.existsSync(destDir)) {
      results.push({ name: registry.name, status: 'not cloned — run registry add again', installed: [] });
      continue;
    }

    try {
      await execFileAsync('git', ['pull'], {
        cwd: destDir,
        timeout: GIT_TIMEOUT,
      });
      // Re-install all packs with force to pick up changes
      const installed = installAllFromRegistry(destDir, registry.name, configDir, { force: true });
      results.push({ name: registry.name, status: 'updated', installed });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      results.push({ name: registry.name, status: `failed: ${msg}`, installed: [] });
    }
  }

  return results;
}

export interface RegistryInfo {
  name: string;
  type: 'local' | 'git';
  url: string;
  enabled: boolean;
  packCount: number;
}

export function listRegistries(configDir: string): RegistryInfo[] {
  const settings = readRawSettings(configDir);
  const registries = settings.skill_registries ?? [];
  const results: RegistryInfo[] = [];

  for (const registry of registries) {
    let packCount = 0;
    try {
      const dir = getRegistryDir(registry, configDir);
      const index = readRegistryIndex(dir);
      packCount = index.packs.length;
    } catch {
      // Can't read index — packCount stays 0
    }

    results.push({
      name: registry.name,
      type: registry.type,
      url: registry.url,
      enabled: registry.enabled,
      packCount,
    });
  }

  return results;
}

// ============================================================================
// Search & Resolve
// ============================================================================

export interface SearchResult extends RegistryIndexEntry {
  registry: string;
}

export function searchPacks(query: string | undefined, configDir: string): SearchResult[] {
  const settings = readRawSettings(configDir);
  const registries = settings.skill_registries ?? [];
  const results: SearchResult[] = [];

  for (const registry of registries) {
    if (!registry.enabled) continue;

    let index: RegistryIndex;
    try {
      const dir = getRegistryDir(registry, configDir);
      index = readRegistryIndex(dir);
    } catch {
      continue;
    }

    for (const pack of index.packs) {
      if (!query) {
        results.push({ ...pack, registry: registry.name });
        continue;
      }

      const q = query.toLowerCase();
      const matches =
        pack.name.toLowerCase().includes(q) ||
        pack.domain.toLowerCase().includes(q) ||
        pack.title.toLowerCase().includes(q) ||
        pack.description.toLowerCase().includes(q);

      if (matches) {
        results.push({ ...pack, registry: registry.name });
      }
    }
  }

  return results;
}

export function resolvePackFromRegistries(
  nameOrDomain: string,
  configDir: string,
): { packDir: string; entry: RegistryIndexEntry; registry: string } | null {
  const settings = readRawSettings(configDir);
  const registries = settings.skill_registries ?? [];

  for (const registry of registries) {
    if (!registry.enabled) continue;

    let index: RegistryIndex;
    let dir: string;
    try {
      dir = getRegistryDir(registry, configDir);
      index = readRegistryIndex(dir);
    } catch {
      continue;
    }

    // Exact domain match
    const byDomain = index.packs.find(p => p.domain === nameOrDomain);
    if (byDomain) {
      return { packDir: path.join(dir, byDomain.path), entry: byDomain, registry: registry.name };
    }

    // Exact name match
    const byName = index.packs.find(p => p.name === nameOrDomain);
    if (byName) {
      return { packDir: path.join(dir, byName.path), entry: byName, registry: registry.name };
    }

    // Partial match (name or domain contains query)
    const partial = index.packs.find(
      p => p.name.includes(nameOrDomain) || p.domain.includes(nameOrDomain),
    );
    if (partial) {
      return { packDir: path.join(dir, partial.path), entry: partial, registry: registry.name };
    }
  }

  return null;
}

// ============================================================================
// Git helpers (used by publish)
// ============================================================================

export function isGitRepo(dir: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd: dir, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function gitCommitChanges(dir: string, message: string): Promise<void> {
  await execFileAsync('git', ['add', '-A'], { cwd: dir });
  try {
    await execFileAsync('git', ['commit', '-m', message], { cwd: dir });
  } catch (err) {
    // If nothing to commit, that's fine
    const stderr = err && typeof err === 'object' && 'stderr' in err ? String((err as { stderr: unknown }).stderr) : '';
    if (!stderr.includes('nothing to commit')) throw err;
  }
}

// ============================================================================
// Batch install/uninstall helpers (used by add/update/remove)
// ============================================================================

function installAllFromRegistry(
  registryDir: string,
  registryName: string,
  configDir: string,
  opts?: { force?: boolean },
): { domain: string; filesInstalled: number; status: string }[] {
  const results: { domain: string; filesInstalled: number; status: string }[] = [];

  let index: RegistryIndex;
  try {
    index = readRegistryIndex(registryDir);
  } catch {
    return results;
  }

  for (const pack of index.packs) {
    const packDir = path.join(registryDir, pack.path);
    if (!fs.existsSync(packDir)) continue;

    try {
      const result = installSkillPack(packDir, configDir, { force: opts?.force });
      // Tag the installed pack with its source registry
      const manifestPath = path.join(configDir, '.installed', 'skill-packs.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (manifest[result.domain]) {
          manifest[result.domain].registry = registryName;
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        }
      }
      results.push(result);
    } catch {
      // skip packs that fail to install
    }
  }

  return results;
}

function uninstallAllFromRegistry(registryName: string, configDir: string): string[] {
  const installed = getInstalledManifest(configDir);
  const uninstalled: string[] = [];

  for (const [domain, pack] of Object.entries(installed)) {
    if (pack.registry === registryName) {
      try {
        uninstallSkillPack(domain, configDir);
        uninstalled.push(domain);
      } catch {
        // skip
      }
    }
  }

  return uninstalled;
}

// ============================================================================
// Direct URL install (one-shot clone → install → cleanup)
// ============================================================================

export async function cloneAndInstallFromUrl(
  url: string,
  configDir: string,
  opts?: { force?: boolean },
): Promise<{ domain: string; filesInstalled: number; status: string }[]> {
  const tmpDir = path.join(configDir, REGISTRIES_DIR, `_tmp_${Date.now()}`);

  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      await execFileAsync('git', ['clone', '--depth', '1', url, tmpDir], {
        timeout: GIT_TIMEOUT,
      });
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new Error('git is required for installing from URLs. Install git and try again.');
      }
      const stderr = error && typeof error === 'object' && 'stderr' in error
        ? String((error as { stderr: unknown }).stderr).trim()
        : String(error);
      throw new Error(`git clone failed: ${stderr}`);
    }

    // Find all skill-pack.json in the cloned repo
    const results: { domain: string; filesInstalled: number; status: string }[] = [];
    const entries = fs.readdirSync(tmpDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const packDir = path.join(tmpDir, entry.name);
      const manifestPath = path.join(packDir, 'skill-pack.json');
      if (fs.existsSync(manifestPath)) {
        const result = installSkillPack(packDir, configDir, { force: opts?.force });
        results.push(result);
      }
    }

    if (results.length === 0) {
      throw new Error('No skill packs found in the repository.');
    }

    return results;
  } finally {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  }
}
