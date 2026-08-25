import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { normalizeClaudePluginLedger, readClaudePluginLedger, MAX_LEDGER_ENTRIES, MAX_LEDGER_BYTES } from './claude-plugins-ledger.js';

// SCRUM-1982 — /health's `claude_plugins[]` is the only thing that turns "the operator asked for 3
// plugins" into "the operator got 2 of them". Before this reader existed, a failed install was a log
// line on a VM: the box still reported online, the portal still showed the request, and nothing
// anywhere said the agent was short a tool.
//
// The file it reads is written by a shell step on a box, so every case here is about a ledger that
// is NOT the happy path — absent, truncated, oversized, or carrying a shape nobody planned for. The
// contract is that all of those read as "nothing to report" (null), never as a throw out of the
// health handler and never as an oversized /health body.

let dir: string;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sb-claude-ledger-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function writeLedger(body: string): void {
  writeFileSync(join(dir, 'claude-plugins.json'), body, 'utf8');
}

const installed = {
  name: 'code-review',
  marketplace: 'claude-plugins-official',
  status: 'installed',
  version: '0fc2bb13a805',
  error: null,
};

describe('readClaudePluginLedger', () => {
  it('reads the ledger base/19i-claude-plugins.sh writes', () => {
    writeLedger(JSON.stringify([installed]));
    expect(readClaudePluginLedger(dir)).toEqual([installed]);
  });

  it('returns null when there is no ledger — "not reported" is not "reported empty"', () => {
    // Every agent provisioned before the install step existed, and every agent that requested no
    // plugins, lands here. The key must stay OFF /health so the portal can tell the two apart
    // instead of rendering a pre-1982 agent as "0 installed".
    expect(readClaudePluginLedger(dir)).toBeNull();
    expect(readClaudePluginLedger(join(dir, 'nope'))).toBeNull();
  });

  it('returns null for an empty array — nothing worth a key on /health', () => {
    writeLedger('[]');
    expect(readClaudePluginLedger(dir)).toBeNull();
  });

  it('survives a malformed or truncated ledger', () => {
    // The step writes temp → atomic mv, but a hand-edited or partially-written file must never
    // throw out of the health handler: /health is what the fleet poll uses to decide an agent is up.
    for (const junk of ['', 'not json', '{"name":"x"}', '[{"name":', 'null', '42']) {
      writeLedger(junk);
      expect(readClaudePluginLedger(dir), junk).toBeNull();
    }
  });

  it('refuses to read an oversized file at all', () => {
    writeLedger(JSON.stringify([{ name: 'p', status: 'installed', error: 'x'.repeat(MAX_LEDGER_BYTES) }]));
    expect(readClaudePluginLedger(dir)).toBeNull();
  });

  it('is not fooled by a directory in place of the ledger', () => {
    mkdirSync(join(dir, 'claude-plugins.json'));
    expect(readClaudePluginLedger(dir)).toBeNull();
  });
});

describe('normalizeClaudePluginLedger', () => {
  it('drops unusable entries rather than the whole ledger', () => {
    expect(normalizeClaudePluginLedger([installed, null, 'nope', [], { status: 'installed' }]))
      .toEqual([installed]);
  });

  it('reads an unknown status as failed, never as installed', () => {
    for (const status of ['ok', 'INSTALLED', '', 7, undefined]) {
      expect(normalizeClaudePluginLedger([{ name: 'p', status }])[0].status, String(status)).toBe('failed');
    }
    for (const status of ['installed', 'failed', 'rejected']) {
      expect(normalizeClaudePluginLedger([{ name: 'p', status }])[0].status).toBe(status);
    }
  });

  it('bounds every string and caps the entry count', () => {
    const one = normalizeClaudePluginLedger([{
      name: 'x'.repeat(500), marketplace: 'm'.repeat(500),
      status: 'failed', version: 'v'.repeat(500), error: 'e'.repeat(5000),
    }])[0];
    expect([one.name.length, one.marketplace!.length, one.version!.length, one.error!.length])
      .toEqual([129, 64, 64, 300]);
    const many = Array.from({ length: 500 }, (_, i) => ({ name: `p${i}`, status: 'installed' }));
    expect(normalizeClaudePluginLedger(many)).toHaveLength(MAX_LEDGER_ENTRIES);
  });

  it('normalises blanks to null so the portal never renders an empty chip suffix', () => {
    expect(normalizeClaudePluginLedger([{ name: 'p', status: 'installed', version: '  ', error: '' }])[0])
      .toEqual({ name: 'p', marketplace: null, status: 'installed', version: null, error: null });
  });
});
