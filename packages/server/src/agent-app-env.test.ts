import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { applyAgentAppEnv } from './agent-app-env.js';

// applyAgentAppEnv reconciles ~/.agent-env.d/ from the config-apply `agent_app_env` payload (AAP-21 /
// SCRUM-1659). The format is a hard contract shared with agent-runners base/19-secrets.sh (first boot) and
// base/assets/report-health-snapshot.sh (the reporter parses every file in the dir as a slug), so the
// parity assertions below are load-bearing — not cosmetic.

let home: string;
let appDir: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-app-env-'));
  appDir = path.join(home, '.agent-env.d');
});
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

function read(slug: string): string {
  return fs.readFileSync(path.join(appDir, slug), 'utf8');
}
function mode(p: string): string {
  return (fs.statSync(p).mode & 0o777).toString(8);
}
function lsDir(): string[] {
  return fs.existsSync(appDir) ? fs.readdirSync(appDir).sort() : [];
}

describe('applyAgentAppEnv — write + format parity with base/19-secrets.sh', () => {
  it('writes export KEY="VALUE" lines with keys SORTED (byte-for-byte matching 19-secrets jq keys order)', () => {
    // Insertion order is BASE_URL then AUTH_TOKEN (as the gateway adapter emits), but the file must be
    // sorted (AUTH_TOKEN < BASE_URL) so it matches what `jq '… | keys[]'` writes at first boot.
    const results = applyAgentAppEnv(
      { 'cc-gateway': { ANTHROPIC_BASE_URL: 'https://gw.example/v1', ANTHROPIC_AUTH_TOKEN: 'tok-xyz' } },
      home,
    );
    expect(results).toEqual([{ slug: 'cc-gateway', ok: true, status: 'written' }]);
    expect(read('cc-gateway')).toBe(
      'export ANTHROPIC_AUTH_TOKEN="tok-xyz"\nexport ANTHROPIC_BASE_URL="https://gw.example/v1"\n',
    );
  });

  it('is sourceable — the exported vars round-trip through a shell `source`', () => {
    applyAgentAppEnv({ 'cc-api': { ANTHROPIC_API_KEY: 'sk-ant-123' } }, home);
    // Mirror base/tests/test-19-secrets.sh assertion 7: `. <file>` must export the var.
    const out = execFileSync('bash', ['-c', `set +u; . "${path.join(appDir, 'cc-api')}"; printf '%s' "$ANTHROPIC_API_KEY"`], {
      encoding: 'utf8',
    });
    expect(out).toBe('sk-ant-123');
  });

  it('creates the dir 0700 and each file 0600', () => {
    applyAgentAppEnv({ 'cc-api': { ANTHROPIC_API_KEY: 'sk-ant-1' } }, home);
    expect(mode(appDir)).toBe('700');
    expect(mode(path.join(appDir, 'cc-api'))).toBe('600');
  });

  it('re-tightens perms to 0600/0700 even when the dir/file already exist looser', () => {
    fs.mkdirSync(appDir, { recursive: true });
    fs.chmodSync(appDir, 0o755);
    fs.writeFileSync(path.join(appDir, 'cc-api'), 'stale', { mode: 0o644 });
    applyAgentAppEnv({ 'cc-api': { ANTHROPIC_API_KEY: 'sk-ant-2' } }, home);
    expect(mode(appDir)).toBe('700');
    expect(mode(path.join(appDir, 'cc-api'))).toBe('600');
    expect(read('cc-api')).toBe('export ANTHROPIC_API_KEY="sk-ant-2"\n'); // content replaced, not appended
  });

  it('writes NO marker file inside the dir — the dir IS the manifest (reporter reads every file as a slug)', () => {
    applyAgentAppEnv({ a: { K: 'v' }, b: { K: 'v' } }, home);
    expect(lsDir()).toEqual(['a', 'b']); // exactly the delivered slugs, nothing else
  });

  it('stages multiple apps', () => {
    applyAgentAppEnv(
      { 'cc-api': { ANTHROPIC_API_KEY: 'k' }, 'cc-gw': { ANTHROPIC_BASE_URL: 'u', ANTHROPIC_AUTH_TOKEN: 't' } },
      home,
    );
    expect(lsDir()).toEqual(['cc-api', 'cc-gw']);
  });
});

describe('applyAgentAppEnv — reconcile-to-zero (orphan removal)', () => {
  it('removes a pre-existing slug file that is NOT in the delivered set (deleted-app teardown)', () => {
    applyAgentAppEnv({ keep: { K: 'v' }, drop: { K: 'v' } }, home);
    expect(lsDir()).toEqual(['drop', 'keep']);
    // Second apply omits `drop` (the app was deleted portal-side) → it must be torn down.
    const results = applyAgentAppEnv({ keep: { K: 'v' } }, home);
    expect(lsDir()).toEqual(['keep']);
    expect(results).toContainEqual({ slug: 'drop', ok: true, status: 'removed' });
  });

  it('empty map {} clears the whole dir (subscription-only account / all apps deleted)', () => {
    applyAgentAppEnv({ a: { K: 'v' }, b: { K: 'v' } }, home);
    applyAgentAppEnv({}, home);
    expect(lsDir()).toEqual([]);
  });

  it('a delivered-but-EMPTY app writes no file AND reconciles away any stale file for that slug', () => {
    applyAgentAppEnv({ sub: { ANTHROPIC_API_KEY: 'was-native' } }, home);
    expect(lsDir()).toEqual(['sub']);
    // The app flips to subscription (resolves to {}): the portal omits it, but even if it delivers {} the
    // reconcile must drop the stale file — an empty file would be `-f` true yet skip the ops-YAML unset.
    const results = applyAgentAppEnv({ sub: {} }, home);
    expect(lsDir()).toEqual([]);
    expect(results.some((r) => r.slug === 'sub' && r.status === 'removed')).toBe(true);
  });

  it('leaves a non-existent dir untouched when nothing is delivered (AC3: no files, no orphans)', () => {
    const results = applyAgentAppEnv({}, home);
    expect(results).toEqual([]);
    expect(fs.existsSync(appDir)).toBe(false); // never spam an empty dir onto a subscription-only agent
  });

  it('only removes regular files, never subdirectories', () => {
    fs.mkdirSync(path.join(appDir, 'a-subdir'), { recursive: true });
    applyAgentAppEnv({}, home);
    expect(fs.existsSync(path.join(appDir, 'a-subdir'))).toBe(true); // left alone
  });
});

describe('applyAgentAppEnv — back-compat & safety', () => {
  it('undefined (older portal) is a NO-OP — the dir is never touched', () => {
    applyAgentAppEnv({ a: { K: 'v' } }, home); // stage something first
    const before = lsDir();
    const results = applyAgentAppEnv(undefined, home);
    expect(results).toEqual([]);
    expect(lsDir()).toEqual(before); // NOT wiped
  });

  it('a malformed field (array / string / null) is treated as absent — never wipes the dir', () => {
    applyAgentAppEnv({ a: { K: 'v' } }, home);
    for (const bad of [[], 'nope', null, 42]) {
      expect(applyAgentAppEnv(bad as unknown, home)).toEqual([]);
      expect(lsDir()).toEqual(['a']); // preserved
    }
  });

  it('rejects an unsafe slug (path traversal) without writing outside the dir', () => {
    const results = applyAgentAppEnv({ '../escape': { K: 'v' }, ok: { K: 'v' } }, home);
    expect(results).toContainEqual({ slug: '../escape', ok: false, status: 'error', error: 'unsafe slug — rejected' });
    expect(fs.existsSync(path.join(home, 'escape'))).toBe(false);
    expect(lsDir()).toEqual(['ok']); // the safe sibling still lands
  });

  it('is idempotent — re-applying the same set changes nothing', () => {
    const env = { 'cc-gw': { ANTHROPIC_BASE_URL: 'u', ANTHROPIC_AUTH_TOKEN: 't' } };
    applyAgentAppEnv(env, home);
    const first = read('cc-gw');
    applyAgentAppEnv(env, home);
    expect(read('cc-gw')).toBe(first);
    expect(lsDir()).toEqual(['cc-gw']);
  });
});
