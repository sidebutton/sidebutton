/**
 * Context file helpers — read/write persona, roles, and targets
 * from the configDir as markdown files with YAML frontmatter.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { PersonaContext, RoleContext, TargetContext, ContextConfig, ProviderStatus, ConnectorType } from '@sidebutton/core';
import { PROVIDER_DEFINITIONS, getAllStepTypes } from '@sidebutton/core';

// ============================================================================
// Frontmatter parsing
// ============================================================================

interface Frontmatter {
  [key: string]: unknown;
}

interface ParsedFile {
  frontmatter: Frontmatter;
  body: string;
}

export function parseFrontmatter(content: string): ParsedFile {
  const trimmed = content.trim();
  if (!trimmed.startsWith('---')) {
    return { frontmatter: {}, body: trimmed };
  }

  const end = trimmed.indexOf('---', 3);
  if (end === -1) {
    return { frontmatter: {}, body: trimmed };
  }

  const yamlStr = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 3).trim();

  try {
    const frontmatter = (yaml.load(yamlStr) as Frontmatter) || {};
    return { frontmatter, body };
  } catch {
    return { frontmatter: {}, body: trimmed };
  }
}

export function serializeFrontmatter(fm: Frontmatter, body: string): string {
  const yamlStr = yaml.dump(fm, { lineWidth: -1 }).trim();
  return `---\n${yamlStr}\n---\n\n${body}\n`;
}

// ============================================================================
// Filename helpers
// ============================================================================

export function toSafeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') + '.md';
}

// ============================================================================
// Persona
// ============================================================================

export function loadPersona(configDir: string): PersonaContext {
  const filePath = path.join(configDir, 'persona.md');
  try {
    if (fs.existsSync(filePath)) {
      return { body: fs.readFileSync(filePath, 'utf-8').trim() };
    }
  } catch {
    // fall through
  }
  return { body: '' };
}

export function savePersona(configDir: string, body: string): void {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'persona.md'), body);
}

// ============================================================================
// Roles
// ============================================================================

function parseRoleFile(filename: string, content: string): RoleContext {
  const { frontmatter, body } = parseFrontmatter(content);
  const enabled = frontmatter.enabled !== false;
  return {
    filename,
    name: (frontmatter.name as string) || filename.replace(/\.md$/, ''),
    match: normalizeMatch(frontmatter.match),
    enabled,
    body,
  };
}

function normalizeMatch(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return [value];
  return [];
}

export function loadRoles(configDir: string): RoleContext[] {
  const dir = path.join(configDir, 'roles');

  const roles: RoleContext[] = [];
  for (const file of readdirSafe(dir)) {
    if (!file.endsWith('.md')) continue;
    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      roles.push(parseRoleFile(file, content));
    } catch {
      // skip unreadable files
    }
  }

  // Also load roles from installed skill packs: skills/<domain>/_roles/*.md
  // and skills/<domain>/<module>/_roles/*.md
  const skillsDir = path.join(configDir, 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const domain of readdirSafe(skillsDir)) {
      const domainDir = path.join(skillsDir, domain);
      if (!fs.statSync(domainDir).isDirectory()) continue;
      loadRolesFromSkillDir(domainDir, domain, roles);
    }
  }

  return roles.sort((a, b) => a.name.localeCompare(b.name));
}

function loadRolesFromSkillDir(dir: string, prefix: string, roles: RoleContext[]): void {
  // Check _roles/ in this directory
  const rolesDir = path.join(dir, '_roles');
  if (fs.existsSync(rolesDir)) {
    for (const file of readdirSafe(rolesDir)) {
      if (!file.endsWith('.md')) continue;
      try {
        const content = fs.readFileSync(path.join(rolesDir, file), 'utf-8');
        const role = parseRoleFile(`skill:${prefix}/${file}`, content);
        roles.push(role);
      } catch {
        // skip
      }
    }
  }
  // Recurse into subdirectories (modules like tasks/, issues/, revenue/)
  for (const entry of readdirSafe(dir)) {
    if (entry.startsWith('_') || entry.startsWith('.')) continue;
    const sub = path.join(dir, entry);
    try {
      if (fs.statSync(sub).isDirectory()) {
        loadRolesFromSkillDir(sub, `${prefix}/${entry}`, roles);
      }
    } catch {
      // skip
    }
  }
}

function readdirSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

export function loadRole(configDir: string, filename: string): RoleContext | null {
  const filePath = path.join(configDir, 'roles', filename);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return parseRoleFile(filename, content);
    }
  } catch {
    // fall through
  }
  return null;
}

export function saveRole(
  configDir: string,
  data: { name: string; match: string[]; enabled?: boolean; body: string },
  filename?: string,
): { role: RoleContext; created: boolean } {
  const dir = path.join(configDir, 'roles');
  fs.mkdirSync(dir, { recursive: true });

  const targetFilename = filename || toSafeFilename(data.name);

  // If creating (no filename), check for collision
  if (!filename && fs.existsSync(path.join(dir, targetFilename))) {
    const err = new Error(`File "${targetFilename}" already exists`);
    (err as any).statusCode = 409;
    throw err;
  }

  const fm: Frontmatter = { name: data.name, match: data.match };
  if (data.enabled === false) fm.enabled = false;

  const content = serializeFrontmatter(fm, data.body);
  fs.writeFileSync(path.join(dir, targetFilename), content);

  const enabled = data.enabled !== false;
  return {
    role: { filename: targetFilename, name: data.name, match: data.match, enabled, body: data.body },
    created: !filename,
  };
}

export function deleteRole(configDir: string, filename: string): void {
  if (filename.startsWith('_')) {
    const err = new Error('System files cannot be deleted');
    (err as any).statusCode = 403;
    throw err;
  }
  const filePath = path.join(configDir, 'roles', filename);
  if (!fs.existsSync(filePath)) {
    const err = new Error('Role not found');
    (err as any).statusCode = 404;
    throw err;
  }
  fs.unlinkSync(filePath);
}

// ============================================================================
// Targets
// ============================================================================

function parseTargetFile(filename: string, content: string): TargetContext {
  const { frontmatter, body } = parseFrontmatter(content);
  const enabled = frontmatter.enabled !== false;
  return {
    filename,
    name: (frontmatter.name as string) || filename.replace(/\.md$/, ''),
    match: normalizeMatch(frontmatter.match),
    enabled,
    provider: (frontmatter.provider as string) || undefined,
    body,
  };
}

export function loadTargets(configDir: string): TargetContext[] {
  const dir = path.join(configDir, 'targets');

  const targets: TargetContext[] = [];
  for (const file of readdirSafe(dir)) {
    if (!file.endsWith('.md')) continue;
    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      targets.push(parseTargetFile(file, content));
    } catch {
      // skip unreadable files
    }
  }

  // Also load _skill.md targets from installed skill packs:
  // skills/<domain>/_skill.md and skills/<domain>/<module>/_skill.md
  const skillsDir = path.join(configDir, 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const domain of readdirSafe(skillsDir)) {
      const domainDir = path.join(skillsDir, domain);
      if (!fs.statSync(domainDir).isDirectory()) continue;
      loadTargetsFromSkillDir(domainDir, domain, targets);
    }
  }

  return targets.sort((a, b) => a.name.localeCompare(b.name));
}

function loadTargetsFromSkillDir(dir: string, prefix: string, targets: TargetContext[]): void {
  // Check _skill.md in this directory
  const skillFile = path.join(dir, '_skill.md');
  if (fs.existsSync(skillFile)) {
    try {
      const content = fs.readFileSync(skillFile, 'utf-8');
      const target = parseTargetFile(`skill:${prefix}/_skill.md`, content);
      // If no match patterns in frontmatter, match on the domain
      if (target.match.length === 0) {
        target.match = [prefix.split('/')[0]];
      }
      targets.push(target);
    } catch {
      // skip
    }
  }
  // Recurse into subdirectories (modules)
  for (const entry of readdirSafe(dir)) {
    if (entry.startsWith('_') || entry.startsWith('.')) continue;
    const sub = path.join(dir, entry);
    try {
      if (fs.statSync(sub).isDirectory()) {
        loadTargetsFromSkillDir(sub, `${prefix}/${entry}`, targets);
      }
    } catch {
      // skip
    }
  }
}

export function loadTarget(configDir: string, filename: string): TargetContext | null {
  const filePath = path.join(configDir, 'targets', filename);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return parseTargetFile(filename, content);
    }
  } catch {
    // fall through
  }
  return null;
}

export function saveTarget(
  configDir: string,
  data: { name: string; match: string[]; enabled?: boolean; provider?: string; body: string },
  filename?: string,
): { target: TargetContext; created: boolean } {
  const dir = path.join(configDir, 'targets');
  fs.mkdirSync(dir, { recursive: true });

  const targetFilename = filename || toSafeFilename(data.name);

  // If creating (no filename), check for collision
  if (!filename && fs.existsSync(path.join(dir, targetFilename))) {
    const err = new Error(`File "${targetFilename}" already exists`);
    (err as any).statusCode = 409;
    throw err;
  }

  const fm: Frontmatter = { name: data.name, match: data.match };
  if (data.enabled === false) fm.enabled = false;
  if (data.provider) fm.provider = data.provider;

  const content = serializeFrontmatter(fm, data.body);
  fs.writeFileSync(path.join(dir, targetFilename), content);

  const enabled = data.enabled !== false;
  return {
    target: {
      filename: targetFilename,
      name: data.name,
      match: data.match,
      enabled,
      provider: data.provider,
      body: data.body,
    },
    created: !filename,
  };
}

export function deleteTarget(configDir: string, filename: string): void {
  if (filename.startsWith('_')) {
    const err = new Error('System files cannot be deleted');
    (err as any).statusCode = 403;
    throw err;
  }
  const filePath = path.join(configDir, 'targets', filename);
  if (!fs.existsSync(filePath)) {
    const err = new Error('Target not found');
    (err as any).statusCode = 404;
    throw err;
  }
  fs.unlinkSync(filePath);
}

// ============================================================================
// System target augmentation
// ============================================================================

export function augmentSystemTarget(
  targets: TargetContext[],
  envVars: Record<string, string>,
  activeChoices?: Record<string, ConnectorType>,
): TargetContext[] {
  return targets.map((t) => {
    if (t.filename !== '_system.md') return t;

    // Use PROVIDER_DEFINITIONS directly with activeChoices to avoid re-running CLI detection
    const lines = PROVIDER_DEFINITIONS.map((def) => {
      const activeConnectorId = activeChoices?.[def.id];
      if (!activeConnectorId) {
        return `- ${def.name}: not connected`;
      }
      const conn = def.connectors.find((c) => c.id === activeConnectorId);
      if (!conn) return `- ${def.name}: not connected`;
      const stepInfo = conn.stepTypes.length > 0 ? ` — ${conn.stepTypes.join(', ')}` : ' — default workflows';
      return `- ${def.name}: ${conn.name} (${conn.featureLevel})${stepInfo}`;
    });

    const providerBlock = `\n\nConnected providers:\n${lines.join('\n')}`;
    return { ...t, body: t.body + providerBlock };
  });
}

// ============================================================================
// Full context
// ============================================================================

export function loadContextAll(
  configDir: string,
  envVars?: Record<string, string>,
  activeChoices?: Record<string, ConnectorType>,
): ContextConfig {
  const targets = loadTargets(configDir);

  // Ensure _system.md always exists so augmentSystemTarget has a target to augment
  if (!targets.some((t) => t.filename === '_system.md')) {
    targets.push({
      filename: '_system.md',
      name: 'System',
      match: ['*'],
      enabled: true,
      body: `Connected skills:\n- Workflows: loaded\n- Browser: status unknown\n\nAvailable step types: ${getAllStepTypes().join(', ')}`,
    });
  }

  return {
    persona: loadPersona(configDir),
    roles: loadRoles(configDir),
    targets: envVars ? augmentSystemTarget(targets, envVars, activeChoices) : targets,
  };
}
