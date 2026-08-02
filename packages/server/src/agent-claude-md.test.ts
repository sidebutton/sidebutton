import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { ensureAgentClaudeMd, defaultAgentClaudeMdPath } from './agent-claude-md.js';

// SCRUM-1830 T3 — the engine-managed tracker-access block in ~/.claude/CLAUDE.md. The canonical
// source is the SHIPPED defaults/claude/CLAUDE.md (no test fixture: the test pins the real file's
// contract — markers present, env var names named), plus a scratch canonical for the replace cases.

const roots: string[] = [];
function scratch(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'sb-claude-md-'));
  roots.push(d);
  return d;
}
afterAll(() => roots.forEach((d) => rmSync(d, { recursive: true, force: true })));

let home: string;
beforeEach(() => {
  home = scratch();
});

const target = () => path.join(home, '.claude', 'CLAUDE.md');

describe('the shipped canonical file', () => {
  it('exists, is marker-delimited, and names every session env var the engine injects', () => {
    const canonical = fs.readFileSync(defaultAgentClaudeMdPath(), 'utf8');
    expect(canonical).toMatch(/<!-- sidebutton:tracker-access:[\w.-]+:begin -->/);
    expect(canonical).toMatch(/<!-- sidebutton:tracker-access:[\w.-]+:end -->/);
    for (const v of [
      '$JIRA_URL', '$JIRA_USER_EMAIL', '$JIRA_API_TOKEN',
      '$JIRA_BEARER_TOKEN', '$JIRA_BASE_URL', '$JIRA_SITE_URL', '$LINEAR_ACCESS_TOKEN',
    ]) {
      expect(canonical).toContain(v);
    }
    // The zh_CN lesson must never be dropped in a rewrite: both headers, explicitly.
    expect(canonical).toContain('Accept-Language: en-US');
    expect(canonical).toContain('X-Force-Accept-Language: true');
  });
});

describe('ensureAgentClaudeMd', () => {
  it('creates ~/.claude/CLAUDE.md (directory included) when none exists', () => {
    expect(ensureAgentClaudeMd({ homeDir: home })).toEqual({ status: 'created' });
    expect(fs.readFileSync(target(), 'utf8')).toContain('sidebutton:tracker-access');
  });

  it('is idempotent: a second run is unchanged and byte-identical', () => {
    ensureAgentClaudeMd({ homeDir: home });
    const before = fs.readFileSync(target(), 'utf8');
    expect(ensureAgentClaudeMd({ homeDir: home })).toEqual({ status: 'unchanged' });
    expect(fs.readFileSync(target(), 'utf8')).toBe(before);
  });

  it('appends to an existing operator file without touching its content', () => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(target(), '# Operator rules\nalways be excellent\n');
    expect(ensureAgentClaudeMd({ homeDir: home }).status).toBe('updated');
    const text = fs.readFileSync(target(), 'utf8');
    expect(text.startsWith('# Operator rules\nalways be excellent\n')).toBe(true);
    expect(text).toContain('sidebutton:tracker-access');
  });

  it('replaces a stale managed span in place — operator text above and below survives', () => {
    const canonicalDir = scratch();
    const canonicalFile = path.join(canonicalDir, 'CLAUDE.md');
    const block = (body: string) =>
      `<!-- sidebutton:tracker-access:v1:begin -->\n${body}\n<!-- sidebutton:tracker-access:v1:end -->`;
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(target(), `# above\n${block('OLD BODY')}\n# below\n`);
    fs.writeFileSync(canonicalFile, block('NEW BODY'));
    expect(ensureAgentClaudeMd({ homeDir: home, canonicalFile })).toEqual({ status: 'updated', detail: 'block replaced' });
    const text = fs.readFileSync(target(), 'utf8');
    expect(text).toContain('# above');
    expect(text).toContain('# below');
    expect(text).toContain('NEW BODY');
    expect(text).not.toContain('OLD BODY');
  });

  it('replaces an older-versioned span (v0 markers) rather than stacking a second block', () => {
    const canonicalDir = scratch();
    const canonicalFile = path.join(canonicalDir, 'CLAUDE.md');
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(
      target(),
      '<!-- sidebutton:tracker-access:v0:begin -->\nancient\n<!-- sidebutton:tracker-access:v0:end -->\n',
    );
    fs.writeFileSync(
      canonicalFile,
      '<!-- sidebutton:tracker-access:v1:begin -->\ncurrent\n<!-- sidebutton:tracker-access:v1:end -->',
    );
    expect(ensureAgentClaudeMd({ homeDir: home, canonicalFile }).status).toBe('updated');
    const text = fs.readFileSync(target(), 'utf8');
    expect(text).toContain('current');
    expect(text).not.toContain('ancient');
    expect(text.match(/sidebutton:tracker-access:[\w.-]+:begin/g)).toHaveLength(1);
  });

  it('skips when the canonical file is missing or unmarked — and never throws', () => {
    expect(ensureAgentClaudeMd({ homeDir: home, canonicalFile: path.join(home, 'nope.md') }).status).toBe('skipped');
    const canonicalFile = path.join(scratch(), 'CLAUDE.md');
    fs.writeFileSync(canonicalFile, 'no markers here');
    expect(ensureAgentClaudeMd({ homeDir: home, canonicalFile }).status).toBe('skipped');
    expect(fs.existsSync(target())).toBe(false);
  });
});
