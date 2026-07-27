#!/usr/bin/env node
/**
 * Refresh the vendored default knowledge packs under defaults/skills/.
 *
 * Source of truth is the public sidebutton.com catalog — the same anonymous
 * endpoint `sidebutton install agents` hits at fleet provisioning — so the
 * seeded tree is byte-identical to what an agent installs, and first-run
 * seeding (cli.ts copyDefaults -> seedSkillPack) needs no network at all.
 *
 * Run it before a release so the vendored copy matches the catalog:
 *
 *   node packages/server/scripts/refresh-default-skills.mjs           # rewrite
 *   node packages/server/scripts/refresh-default-skills.mjs --check   # exit 1 on drift, write nothing
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKS = ['agents'];
const BASE_URL = process.env.SIDEBUTTON_REGISTRY_URL ?? 'https://sidebutton.com';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsRoot = path.resolve(__dirname, '..', 'defaults', 'skills');
const checkOnly = process.argv.includes('--check');

// The seeded tree must look exactly like an installed pack: manifest present,
// README absent (skill-pack.ts strips it on install, installFromRemote writes
// the manifest back).
const SKIP_FILES = new Set(['README.md', '.DS_Store']);

/** Files a pack is allowed to write: relative, no traversal, no dotfiles. */
function isSafeRelPath(file) {
  if (path.isAbsolute(file)) return false;
  const parts = file.split('/');
  return parts.every(p => p !== '' && p !== '.' && p !== '..' && !p.startsWith('.'));
}

function readTree(dir, prefix = '') {
  const tree = new Map();
  if (!fs.existsSync(dir)) return tree;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const [k, v] of readTree(path.join(dir, entry.name), rel)) tree.set(k, v);
    } else {
      tree.set(rel, fs.readFileSync(path.join(dir, entry.name), 'utf-8'));
    }
  }
  return tree;
}

let drift = false;

for (const domain of PACKS) {
  const res = await fetch(`${BASE_URL}/api/skill-packs/${encodeURIComponent(domain)}/download`);
  if (!res.ok) {
    console.error(`error: ${domain}: ${BASE_URL} answered HTTP ${res.status}`);
    process.exit(1);
  }
  const { manifest, files } = await res.json();
  if (!manifest?.domain || !manifest?.version || typeof files !== 'object' || files === null) {
    console.error(`error: ${domain}: unexpected download payload shape`);
    process.exit(1);
  }

  // Match installFromRemote byte-for-byte: JSON.stringify(manifest, null, 2),
  // no trailing newline.
  const expected = new Map([['skill-pack.json', JSON.stringify(manifest, null, 2)]]);
  for (const [file, content] of Object.entries(files)) {
    if (!isSafeRelPath(file)) {
      console.error(`error: ${domain}: refusing unsafe path in payload: ${file}`);
      process.exit(1);
    }
    if (SKIP_FILES.has(path.basename(file))) continue;
    expected.set(file, content);
  }

  const packDir = path.join(skillsRoot, manifest.domain);
  const current = readTree(packDir);

  const changed = [];
  for (const [file, content] of expected) {
    if (current.get(file) !== content) changed.push(file);
  }
  for (const file of current.keys()) {
    if (!expected.has(file)) changed.push(`${file} (stale)`);
  }

  if (changed.length === 0) {
    console.log(`ok: ${domain} v${manifest.version} — ${expected.size} files, up to date`);
    continue;
  }

  drift = true;
  if (checkOnly) {
    console.error(`drift: ${domain} v${manifest.version} — ${changed.length} file(s) differ:`);
    for (const file of changed) console.error(`  ${file}`);
    continue;
  }

  fs.rmSync(packDir, { recursive: true, force: true });
  for (const [file, content] of expected) {
    const dest = path.join(packDir, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
  console.log(`rewritten: ${domain} v${manifest.version} — ${expected.size} files`);
}

process.exit(checkOnly && drift ? 1 : 0);
