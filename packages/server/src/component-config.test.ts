import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  applyComponentConfig,
  type ApplyComponentConfigItem,
  type PlaceRunner,
} from './component-config.js';

const MANIFEST = '.sb-config';

function toB64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}
function makeItem(component: string, config_id: string, filename: string, sha: string, content: string): ApplyComponentConfigItem {
  return { component, config_id, filename, sha, content_b64: toB64(content) };
}

interface PlaceCall {
  args: string[];
  /** For a place (non-remove) call, the staged file's contents at invocation time. */
  staged?: string;
}

/**
 * Stub the ONE privileged hop. Records every invocation; `failIf` lets a test simulate a
 * sb-config-place `die` (non-zero exit with a stderr message) for specific args.
 */
function makePlace(failIf?: (args: string[]) => boolean): { runner: PlaceRunner; calls: PlaceCall[] } {
  const calls: PlaceCall[] = [];
  const runner: PlaceRunner = async (args) => {
    const rec: PlaceCall = { args: [...args] };
    if (args[0] !== '--remove') {
      try { rec.staged = fs.readFileSync(args[1], 'utf8'); } catch { /* staged already gone */ }
    }
    calls.push(rec);
    if (failIf?.(args)) {
      const err = Object.assign(new Error('Command failed'), {
        stderr: "sb-config-place: component 'x' is not installed",
      });
      throw err;
    }
    return { stdout: 'placed: /etc/sidebutton/x (root:600)', stderr: '' };
  };
  return { runner, calls };
}

describe('applyComponentConfig', () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-cc-test-'));
  });
  afterEach(() => {
    if (baseDir) fs.rmSync(baseDir, { recursive: true, force: true });
  });

  function manifest(): Record<string, Record<string, { sha: string; config_id: string }>> {
    return JSON.parse(fs.readFileSync(path.join(baseDir, MANIFEST), 'utf8'));
  }

  it('stages the bytes and sudo-places a new item (filename arg omitted), recording it in the manifest', async () => {
    const { runner, calls } = makePlace();
    const results = await applyComponentConfig(
      [makeItem('wireguard', 'wg-profile', 'wg0.conf', 'sha-v1', '[Interface]\nPrivateKey=abc\n')],
      { baseDir, place: runner },
    );

    expect(results).toEqual([
      { component: 'wireguard', config_id: 'wg-profile', filename: 'wg0.conf', ok: true, status: 'applied' },
    ]);
    // One place call: [slug, staged] — NO filename arg (single-file targets pin their own basename).
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toBe('wireguard');
    expect(calls[0].args[1]).toBe(path.join(baseDir, 'staging', 'wireguard', 'wg0.conf'));
    expect(calls[0].args).toHaveLength(2);
    // The staged file carried the decoded plaintext at place time…
    expect(calls[0].staged).toBe('[Interface]\nPrivateKey=abc\n');
    expect(manifest()).toEqual({ wireguard: { 'wg0.conf': { sha: 'sha-v1', config_id: 'wg-profile' } } });
    // …and staging is wiped afterwards so no decrypted profile lingers.
    expect(fs.existsSync(path.join(baseDir, 'staging', 'wireguard', 'wg0.conf'))).toBe(false);
  });

  it('sha-skip: an unchanged sha does NOT invoke the privileged place', async () => {
    const first = makePlace();
    await applyComponentConfig([makeItem('wireguard', 'wg-profile', 'wg0.conf', 'sha-stable', 'a')], { baseDir, place: first.runner });

    const second = makePlace();
    const results = await applyComponentConfig([makeItem('wireguard', 'wg-profile', 'wg0.conf', 'sha-stable', 'a')], { baseDir, place: second.runner });
    expect(results).toEqual([
      { component: 'wireguard', config_id: 'wg-profile', filename: 'wg0.conf', ok: true, status: 'skipped' },
    ]);
    expect(second.calls).toHaveLength(0); // no tunnel flap on re-apply of unchanged bytes
  });

  it('update: a changed sha re-places and updates the manifest', async () => {
    const first = makePlace();
    await applyComponentConfig([makeItem('wireguard', 'wg-profile', 'wg0.conf', 'sha-v1', 'v1')], { baseDir, place: first.runner });

    const second = makePlace();
    const results = await applyComponentConfig([makeItem('wireguard', 'wg-profile', 'wg0.conf', 'sha-v2', 'v2')], { baseDir, place: second.runner });
    expect(results[0]).toMatchObject({ filename: 'wg0.conf', ok: true, status: 'applied' });
    expect(second.calls[0].staged).toBe('v2');
    expect(manifest().wireguard['wg0.conf'].sha).toBe('sha-v2');
  });

  it('reconcile-remove: a de-scoped file is torn down via --remove and dropped from the manifest', async () => {
    const seed = makePlace();
    await applyComponentConfig(
      [
        makeItem('wireguard', 'wg-profile', 'keep.conf', 'sha-keep', 'k'),
        makeItem('wireguard', 'wg-profile', 'drop.conf', 'sha-drop', 'd'),
      ],
      { baseDir, place: seed.runner },
    );

    const next = makePlace();
    const results = await applyComponentConfig([makeItem('wireguard', 'wg-profile', 'keep.conf', 'sha-keep', 'k')], { baseDir, place: next.runner });

    // keep.conf sha-skips (no place); drop.conf is removed.
    const removed = results.find((r) => r.filename === 'drop.conf');
    expect(removed).toEqual({ component: 'wireguard', config_id: 'wg-profile', filename: 'drop.conf', ok: true, status: 'removed' });
    const removeCalls = next.calls.filter((c) => c.args[0] === '--remove');
    expect(removeCalls).toEqual([{ args: ['--remove', 'wireguard', 'drop.conf'] }]);
    expect(manifest()).toEqual({ wireguard: { 'keep.conf': { sha: 'sha-keep', config_id: 'wg-profile' } } });
  });

  it('reconcile-to-zero: an empty request tears down every owned file and removes the manifest', async () => {
    const seed = makePlace();
    await applyComponentConfig(
      [
        makeItem('wireguard', 'wg-profile', 'wg0.conf', 's1', 'a'),
        makeItem('rdp-client', 'rdp-env', 'rdp.env', 's2', 'b'),
      ],
      { baseDir, place: seed.runner },
    );

    const next = makePlace();
    const results = await applyComponentConfig([], { baseDir, place: next.runner });
    expect(results.map((r) => r.status).sort()).toEqual(['removed', 'removed']);
    expect(next.calls.every((c) => c.args[0] === '--remove')).toBe(true);
    expect(fs.existsSync(path.join(baseDir, MANIFEST))).toBe(false);
  });

  it('reconcile-to-zero of a FULLY de-scoped component (absent from the request) still tears its file down', async () => {
    const seed = makePlace();
    await applyComponentConfig(
      [
        makeItem('wireguard', 'wg-profile', 'wg0.conf', 's1', 'a'),
        makeItem('openvpn', 'ovpn-profile', 'client.ovpn', 's2', 'b'),
      ],
      { baseDir, place: seed.runner },
    );

    // Second apply omits openvpn entirely — its slug is absent from `items`, yet its file must go.
    const next = makePlace();
    const results = await applyComponentConfig([makeItem('wireguard', 'wg-profile', 'wg0.conf', 's1', 'a')], { baseDir, place: next.runner });
    expect(results.find((r) => r.component === 'openvpn')).toEqual({
      component: 'openvpn', config_id: 'ovpn-profile', filename: 'client.ovpn', ok: true, status: 'removed',
    });
    expect(manifest()).toEqual({ wireguard: { 'wg0.conf': { sha: 's1', config_id: 'wg-profile' } } });
  });

  it('single-file pin: a --remove rejected with a filename retries without it, then tears down', async () => {
    const seed = makePlace();
    // A stored rdp filename that is NOT the pinned basename (A2 accepts any .env name).
    await applyComponentConfig([makeItem('rdp-client', 'rdp-env', 'custom.env', 's1', 'x')], { baseDir, place: seed.runner });

    // sb-config-place rejects `--remove rdp-client custom.env` (pins rdp.env) but accepts `--remove rdp-client`.
    const next = makePlace((args) => args[0] === '--remove' && args.length === 3);
    const results = await applyComponentConfig([], { baseDir, place: next.runner });
    expect(results).toEqual([
      { component: 'rdp-client', config_id: 'rdp-env', filename: 'custom.env', ok: true, status: 'removed' },
    ]);
    expect(next.calls.map((c) => c.args)).toEqual([
      ['--remove', 'rdp-client', 'custom.env'],
      ['--remove', 'rdp-client'],
    ]);
    expect(fs.existsSync(path.join(baseDir, MANIFEST))).toBe(false);
  });

  it('groups a mixed request by component and places each', async () => {
    const { runner, calls } = makePlace();
    const results = await applyComponentConfig(
      [
        makeItem('wireguard', 'wg-profile', 'wg0.conf', 's1', 'a'),
        makeItem('openvpn', 'ovpn-profile', 'client.ovpn', 's2', 'b'),
      ],
      { baseDir, place: runner },
    );
    expect(results.every((r) => r.ok && r.status === 'applied')).toBe(true);
    expect(calls.map((c) => c.args[0]).sort()).toEqual(['openvpn', 'wireguard']);
    expect(manifest()).toEqual({
      wireguard: { 'wg0.conf': { sha: 's1', config_id: 'wg-profile' } },
      openvpn: { 'client.ovpn': { sha: 's2', config_id: 'ovpn-profile' } },
    });
  });

  it('rejects an unsafe slug / filename per-item without placing, and continues with the rest', async () => {
    const { runner, calls } = makePlace();
    const results = await applyComponentConfig(
      [
        makeItem('wireguard', 'wg-profile', 'ok.conf', 's-ok', 'good'),
        makeItem('../evil', 'wg-profile', 'wg0.conf', 's-b', 'bad'),
        makeItem('wireguard', 'wg-profile', '../escape', 's-b', 'bad'),
      ],
      { baseDir, place: runner },
    );
    expect(results[0]).toMatchObject({ filename: 'ok.conf', ok: true, status: 'applied' });
    expect(results[1]).toMatchObject({ ok: false, status: 'error' });
    expect(results[1].error).toMatch(/invalid component slug/);
    expect(results[2]).toMatchObject({ ok: false, status: 'error' });
    expect(results[2].error).toMatch(/safe single path segment/);
    // Only the one valid item reached the privileged hop.
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toBe('wireguard');
  });

  it('surfaces a non-zero sb-config-place exit as a per-item error (truthful chip, no crash)', async () => {
    const { runner } = makePlace((args) => args[0] === 'wireguard'); // place fails
    const results = await applyComponentConfig([makeItem('wireguard', 'wg-profile', 'wg0.conf', 's1', 'a')], { baseDir, place: runner });
    expect(results[0]).toMatchObject({ filename: 'wg0.conf', ok: false, status: 'error' });
    expect(results[0].error).toMatch(/not installed/);
    // A failed place claims nothing — the manifest stays empty (no false ownership).
    expect(fs.existsSync(path.join(baseDir, MANIFEST))).toBe(false);
  });

  it('a transient place error preserves prior ownership so reconcile does not tear the good file down', async () => {
    const seed = makePlace();
    await applyComponentConfig([makeItem('wireguard', 'wg-profile', 'wg0.conf', 'sha-v1', 'v1')], { baseDir, place: seed.runner });

    // Re-upload (sha change) but the place fails this time. The file is still desired, so its old
    // manifest entry must survive — reconcile must NOT remove it.
    const next = makePlace((args) => args[0] === 'wireguard');
    const results = await applyComponentConfig([makeItem('wireguard', 'wg-profile', 'wg0.conf', 'sha-v2', 'v2')], { baseDir, place: next.runner });
    expect(results[0]).toMatchObject({ status: 'error' });
    expect(next.calls.some((c) => c.args[0] === '--remove')).toBe(false); // never torn down
    expect(manifest().wireguard['wg0.conf'].sha).toBe('sha-v1'); // prior ownership kept
  });
});
