import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { McpHandler } from './handler.js';
import type { ExtensionClientImpl } from '../extension.js';

/**
 * Covers the `path` option on the screenshot tool (SCRUM-2045): the agent-side file write
 * that lets a workflow produce a docs screenshot without image bytes entering the model's
 * context. The containment assertions are the load-bearing ones — POST /mcp sits outside
 * the bearer hook, so an unconstrained path here is a remotely reachable arbitrary write.
 */

// A real 1x1 PNG, so what lands on disk can be compared byte-for-byte.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_BYTES = Buffer.from(PNG_B64, 'base64');

let fakeHome: string;
let realHome: string | undefined;

beforeEach(() => {
  realHome = process.env.HOME;
  // realpath: on macOS os.tmpdir() is itself a symlink, which the containment check resolves.
  fakeHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sb-shot-home-')));
  process.env.HOME = fakeHome;
});

afterEach(() => {
  if (realHome === undefined) delete process.env.HOME;
  else process.env.HOME = realHome;
  fs.rmSync(fakeHome, { recursive: true, force: true });
});

function makeHandler(opts: { image?: string; connected?: boolean } = {}): McpHandler {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-shot-cfg-'));
  const ext = {
    isConnected: async () => opts.connected ?? true,
    screenshot: async () => opts.image ?? PNG_B64,
  } as unknown as ExtensionClientImpl;
  return new McpHandler(tmp, tmp, tmp, tmp, ext, tmp);
}

async function callTool(
  handler: McpHandler,
  name: string,
  args: Record<string, unknown> = {}
): Promise<{ result?: any; error?: { message: string } }> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  return JSON.parse(await handler.handleRequest(body));
}

describe('screenshot tool — path option', () => {
  it('advertises path in tools/list without making it required', async () => {
    const handler = makeHandler();
    const res = JSON.parse(
      await handler.handleRequest(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    );
    const tool = res.result.tools.find((t: any) => t.name === 'screenshot')!;
    expect(tool.inputSchema.properties.path).toBeDefined();
    expect(tool.inputSchema.required ?? []).not.toContain('path');
  });

  it('writes the PNG to disk and returns text, not image bytes', async () => {
    const handler = makeHandler();
    const out = path.join(fakeHome, 'shots', '01-dashboard.png');

    const res = await callTool(handler, 'screenshot', { selector: '#app', path: out });

    expect(res.error).toBeUndefined();
    const blocks = res.result.content;
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('text');
    expect(blocks.some((b: any) => b.type === 'image')).toBe(false);
    expect(blocks[0].text).toContain(out);
    expect(blocks[0].text).toContain(String(PNG_BYTES.length));

    // The parent directory did not exist — the write creates it.
    expect(fs.readFileSync(out)).toEqual(PNG_BYTES);
  });

  it('strips a data-URL prefix before writing (else the PNG is corrupt but "succeeds")', async () => {
    const handler = makeHandler({ image: `data:image/png;base64,${PNG_B64}` });
    const out = path.join(fakeHome, 'prefixed.png');

    await callTool(handler, 'screenshot', { path: out });

    const written = fs.readFileSync(out);
    expect(written).toEqual(PNG_BYTES);
    // PNG magic number — proves it is a decodable file, not base64 text.
    expect(written.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('overwrites the same path on a retry rather than accumulating files', async () => {
    const handler = makeHandler();
    const out = path.join(fakeHome, 'shots', 'retry.png');

    await callTool(handler, 'screenshot', { path: out });
    await callTool(handler, 'screenshot', { path: out });

    expect(fs.readdirSync(path.join(fakeHome, 'shots'))).toEqual(['retry.png']);
    expect(fs.readFileSync(out)).toEqual(PNG_BYTES);
  });

  it('writes the file 0600 — a shot may hold pre-redaction pixels', async () => {
    const handler = makeHandler();
    const out = path.join(fakeHome, 'perms.png');

    await callTool(handler, 'screenshot', { path: out });

    expect(fs.statSync(out).mode & 0o777).toBe(0o600);
  });

  it('tightens the mode to 0600 even when overwriting a looser existing file', async () => {
    const handler = makeHandler();
    const out = path.join(fakeHome, 'preexisting.png');
    // writeFileSync's `mode` applies only on create, so an existing 0644 file would silently
    // keep 0644 — and a shot can hold pre-redaction pixels.
    fs.writeFileSync(out, 'stale', { mode: 0o644 });

    await callTool(handler, 'screenshot', { path: out });

    expect(fs.statSync(out).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(out)).toEqual(PNG_BYTES);
  });

  it('creates no directories outside home when the escape is through a symlink', async () => {
    const handler = makeHandler();
    const outsideDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sb-shot-mk-')));
    fs.symlinkSync(outsideDir, path.join(fakeHome, 'link'));

    // A recursive mkdir would follow the symlink and really create outsideDir/a/b before the
    // realpath check rejected the path — containment has to hold before any mkdir.
    const res = await callTool(handler, 'screenshot', { path: path.join(fakeHome, 'link', 'a', 'b', 'x.png') });

    expect(res.error?.message ?? JSON.stringify(res.result)).toMatch(/outside the home directory/i);
    expect(fs.readdirSync(outsideDir)).toEqual([]);
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it('resolves ~ and a relative path the same way publish_artifact does', async () => {
    const handler = makeHandler();

    await callTool(handler, 'screenshot', { path: '~/tilde.png' });
    expect(fs.existsSync(path.join(fakeHome, 'tilde.png'))).toBe(true);

    // Relative resolves against ~/workspace, so the same string means the same file to
    // both tools — that is what makes a written shot directly publishable.
    await callTool(handler, 'screenshot', { path: 'shots/rel.png' });
    expect(fs.existsSync(path.join(fakeHome, 'workspace', 'shots', 'rel.png'))).toBe(true);
  });

  it('rejects a path outside the home directory', async () => {
    const handler = makeHandler();
    const outside = path.join(os.tmpdir(), `sb-escape-${process.pid}.png`);

    const res = await callTool(handler, 'screenshot', { path: outside });

    expect(res.error?.message ?? JSON.stringify(res.result)).toMatch(/outside the home directory/i);
    expect(fs.existsSync(outside)).toBe(false);
  });

  it('rejects a traversal escape without creating directories on the way out', async () => {
    const handler = makeHandler();

    const res = await callTool(handler, 'screenshot', { path: `${fakeHome}/../escaped/x.png` });

    expect(res.error?.message ?? JSON.stringify(res.result)).toMatch(/outside the home directory/i);
    expect(fs.existsSync(path.join(path.dirname(fakeHome), 'escaped'))).toBe(false);
  });

  it('rejects an escape through a symlinked directory', async () => {
    const handler = makeHandler();
    const outsideDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sb-shot-out-')));
    fs.symlinkSync(outsideDir, path.join(fakeHome, 'link'));

    const res = await callTool(handler, 'screenshot', { path: path.join(fakeHome, 'link', 'x.png') });

    expect(res.error?.message ?? JSON.stringify(res.result)).toMatch(/outside the home directory/i);
    expect(fs.existsSync(path.join(outsideDir, 'x.png'))).toBe(false);
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it('rejects writing through a symlinked target file', async () => {
    const handler = makeHandler();
    const outsideDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sb-shot-tgt-')));
    const victim = path.join(outsideDir, 'victim.png');
    const link = path.join(fakeHome, 'target.png');
    fs.writeFileSync(victim, 'original');
    fs.symlinkSync(victim, link);

    const res = await callTool(handler, 'screenshot', { path: link });

    expect(res.error?.message ?? JSON.stringify(res.result)).toMatch(/symlink/i);
    expect(fs.readFileSync(victim, 'utf8')).toBe('original');
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it('is unchanged with no path: still returns an image block', async () => {
    const handler = makeHandler();

    const res = await callTool(handler, 'screenshot', { selector: '#app' });

    const blocks = res.result.content;
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('image');
    expect(blocks[0].mimeType).toBe('image/png');
    expect(blocks[0].data).toBe(PNG_B64);
    expect(fs.readdirSync(fakeHome)).toEqual([]);
  });
});

describe('inject_css MCP tool', () => {
  it('forwards css and id to the extension, and is batchable', async () => {
    const calls: { css: string; id?: string }[] = [];
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-css-'));
    const ext = {
      isConnected: async () => true,
      injectCSS: async (css: string, id?: string) => { calls.push({ css, id }); },
      screenshot: async () => PNG_B64,
      waitForElement: async () => {},
      ariaSnapshot: async () => 'snap',
    } as unknown as ExtensionClientImpl;
    const handler = new McpHandler(tmp, tmp, tmp, tmp, ext, tmp);

    const res = await callTool(handler, 'inject_css', { css: '.x { filter: blur(6px); }', id: 'sb-redact' });
    expect(res.error).toBeUndefined();
    expect(calls).toEqual([{ css: '.x { filter: blur(6px); }', id: 'sb-redact' }]);

    // AC3: the whole redaction recipe runs in one browser_batch call, returning text only.
    const out = path.join(fakeHome, 'batch.png');
    const batch = await callTool(handler, 'browser_batch', {
      steps: [
        { cmd: 'inject_css', css: '.secret { filter: blur(8px); }', id: 'sb-redact' },
        { cmd: 'wait', selector: '#app' },
        { cmd: 'screenshot', selector: '#app', path: out },
      ],
    });

    expect(batch.error).toBeUndefined();
    const blocks = batch.result.content;
    expect(JSON.stringify(blocks)).toContain('3/3 succeeded');
    expect(blocks.some((b: any) => b.type === 'image')).toBe(false);
    expect(fs.readFileSync(out)).toEqual(PNG_BYTES);
    expect(calls).toHaveLength(2);
  });
});
