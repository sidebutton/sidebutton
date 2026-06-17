import { describe, it, expect, vi } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { McpHandler } from './handler.js';
import type { ExtensionClientImpl } from '../extension.js';

// SCRUM-1268 — duplicate workflow ids across installed skill packs must resolve
// deterministically: an account pack's copy overrides the bundled default `agents`
// pack's, regardless of filesystem enumeration order, and the shadowing is logged.

const ext = {} as unknown as ExtensionClientImpl;

interface WfSpec {
  file: string;
  id: string;
  title: string;
}

/**
 * Construct a real McpHandler whose configDir holds skills/<domain>/ops/*.yaml trees.
 * Actions/workflows/templates/run-logs point at separate empty dirs so the skill
 * YAMLs load exclusively through the skills path under test.
 */
function makeHandler(domains: Record<string, WfSpec[]>): McpHandler {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-mcp-dup-'));
  const empty = (name: string): string => {
    const d = path.join(tmp, name);
    fs.mkdirSync(d);
    return d;
  };
  for (const [domain, wfs] of Object.entries(domains)) {
    const opsDir = path.join(tmp, 'skills', domain, 'ops');
    fs.mkdirSync(opsDir, { recursive: true });
    for (const wf of wfs) {
      fs.writeFileSync(
        path.join(opsDir, wf.file),
        `id: ${wf.id}\ntitle: ${wf.title}\nsteps:\n  - type: shell.run\n    command: echo ok\n`,
      );
    }
  }
  return new McpHandler(empty('actions'), empty('workflows'), empty('templates'), empty('run-logs'), ext, tmp);
}

describe('skill workflow duplicate-id precedence (SCRUM-1268)', () => {
  it('account pack wins over the default agents pack when its domain sorts BEFORE "agents"', () => {
    // 'aaa.example.com' < 'agents' alphabetically — a naive sort would load the default
    // pack last and let it win; the default pack must load first so the account copy shadows it.
    const h = makeHandler({
      'aaa.example.com': [{ file: 'dup.yaml', id: 'wf_dup', title: 'Account copy' }],
      agents: [
        { file: 'dup.yaml', id: 'wf_dup', title: 'Default copy' },
        { file: 'solo.yaml', id: 'wf_only_default', title: 'Default only' },
      ],
    });
    expect(h.findWorkflow('wf_dup')?.title).toBe('Account copy');
    expect(h.findWorkflow('wf_only_default')?.title).toBe('Default only');
  });

  it('account pack wins over the default agents pack when its domain sorts AFTER "agents"', () => {
    const h = makeHandler({
      agents: [{ file: 'dup.yaml', id: 'wf_dup', title: 'Default copy' }],
      'zzz.example.com': [
        { file: 'dup.yaml', id: 'wf_dup', title: 'Account copy' },
        { file: 'solo.yaml', id: 'wf_only_account', title: 'Account only' },
      ],
    });
    expect(h.findWorkflow('wf_dup')?.title).toBe('Account copy');
    expect(h.findWorkflow('wf_only_account')?.title).toBe('Account only');
    // The shadowed default copy is dropped, not merely ordered behind the winner.
    expect(h.getAllWorkflows().filter((w) => w.id === 'wf_dup')).toHaveLength(1);
  });

  it('logs a warning naming both domains when an account workflow shadows a default one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      makeHandler({
        agents: [{ file: 'dup.yaml', id: 'wf_dup', title: 'Default copy' }],
        'acct.example.com': [{ file: 'dup.yaml', id: 'wf_dup', title: 'Account copy' }],
      });
      const messages = warn.mock.calls.map((c) => c.join(' '));
      expect(
        messages.some((m) => m.includes('wf_dup') && m.includes('acct.example.com') && m.includes('agents')),
      ).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});
