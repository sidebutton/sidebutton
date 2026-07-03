import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { McpHandler } from './handler.js';
import type { ExtensionClientImpl } from '../extension.js';

// SCRUM-1606 — publish_artifact: a thin MCP tool over POST /api/jobs/artifacts?attach=1&share=1
// (the B2 endpoint, SCRUM-1605). These tests mock global fetch and point HOME at a tmp dir holding
// ~/.sidebutton/job-context.json + a workspace file, then assert the request the tool builds and the
// paste-ready snippet it returns — including every non-fatal error path.

const ext = {} as unknown as ExtensionClientImpl;

/** A handler whose actions/workflows/templates/run-logs are empty tmp dirs (no browser needed). */
function makeHandler(configDir: string): McpHandler {
  const empty = (name: string): string => {
    const d = path.join(configDir, name);
    fs.mkdirSync(d, { recursive: true });
    return d;
  };
  return new McpHandler(empty('actions'), empty('workflows'), empty('templates'), empty('run-logs'), ext, configDir);
}

interface ToolResult {
  result?: { content?: { type: string; text: string }[]; isError?: boolean };
  error?: { message: string };
}

async function callPublish(handler: McpHandler, args: Record<string, unknown>): Promise<ToolResult> {
  const req = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'publish_artifact', arguments: args },
  });
  return JSON.parse(await handler.handleRequest(req)) as ToolResult;
}

const textOf = (r: ToolResult): string => r.result?.content?.[0]?.text ?? '';
const isError = (r: ToolResult): boolean => r.result?.isError === true;

/** A minimal fetch Response stand-in. */
function mockResponse(status: number, body: unknown): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

let tmpHome: string;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-pub-'));
  fs.mkdirSync(path.join(tmpHome, '.sidebutton'), { recursive: true });
  fs.mkdirSync(path.join(tmpHome, 'workspace', 'artifacts'), { recursive: true });

  vi.stubEnv('HOME', tmpHome);
  vi.stubEnv('USERPROFILE', tmpHome);
  vi.stubEnv('AGENT_TOKEN', 'sb_test_token');
  vi.stubEnv('AGENT_NAME', 'agent-test');
  vi.stubEnv('PORTAL_URL', 'https://portal.test');
  vi.stubEnv('SIDEBUTTON_AGENT_TOKEN', '');
  vi.stubEnv('SIDEBUTTON_AGENT_NAME', '');

  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch { /* best-effort */ }
});

/** Write ~/.sidebutton/job-context.json with the given fields. */
function writeJobContext(ctx: Record<string, unknown>): void {
  fs.writeFileSync(path.join(tmpHome, '.sidebutton', 'job-context.json'), JSON.stringify(ctx));
}

/** Write a workspace file under artifacts/ and return its bytes. */
function writeArtifact(name: string, contents = 'PNGDATA'): Buffer {
  const p = path.join(tmpHome, 'workspace', 'artifacts', name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, contents);
  return Buffer.from(contents);
}

describe('publish_artifact — happy path', () => {
  it('POSTs attach=1&share=1 with basename filename + job-context attribution, and returns a snippet with the link + [^filename]', async () => {
    const handler = makeHandler(tmpHome);
    writeJobContext({ job_id: 42, step_index: 3, session_id: 'sess-xyz' });
    const bytes = writeArtifact('evidence.png');
    fetchMock.mockResolvedValue(
      mockResponse(200, {
        ok: true,
        id: 7,
        artifact_id: 7,
        kind: 'screenshot',
        filename: 'evidence.png',
        size: bytes.length,
        download_url: 'https://portal.test/api/artifacts/shared/tok123',
        attachment: { id: 'att-1', filename: 'evidence.png' },
        warnings: [],
      }),
    );

    const res = await callPublish(handler, { path: 'artifacts/evidence.png' });

    expect(isError(res)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [urlArg, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const u = new URL(urlArg);
    expect(u.origin + u.pathname).toBe('https://portal.test/api/jobs/artifacts');
    expect(u.searchParams.get('attach')).toBe('1');
    expect(u.searchParams.get('share')).toBe('1');
    expect(u.searchParams.get('job_id')).toBe('42');
    expect(u.searchParams.get('step_index')).toBe('3');
    expect(u.searchParams.get('session_id')).toBe('sess-xyz');
    expect(u.searchParams.get('filename')).toBe('evidence.png');
    expect(u.searchParams.get('kind')).toBe('screenshot');

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sb_test_token');
    expect(headers['X-Agent-Name']).toBe('agent-test');
    expect(headers['Content-Type']).toBe('application/octet-stream');
    expect(init.method).toBe('POST');
    // Exact bytes, matching the Stop hook's --data-binary.
    const sent = Buffer.from(init.body as Uint8Array);
    expect(sent.equals(bytes)).toBe(true);

    const text = textOf(res);
    expect(text).toContain('https://portal.test/api/artifacts/shared/tok123');
    expect(text).toContain('[^evidence.png]');
    expect(text).toContain('attached to the ticket');
  });

  it('keeps only the basename in the dedup key when the path has subdirectories', async () => {
    const handler = makeHandler(tmpHome);
    writeJobContext({ job_id: 1, step_index: 0, session_id: 's' });
    writeArtifact('sub/deep.png');
    fetchMock.mockResolvedValue(mockResponse(200, { filename: 'deep.png', kind: 'screenshot', attachment: null, warnings: [] }));

    await callPublish(handler, { path: 'artifacts/sub/deep.png' });

    const [urlArg] = fetchMock.mock.calls[0] as [string];
    expect(new URL(urlArg).searchParams.get('filename')).toBe('deep.png');
  });
});

describe('publish_artifact — kind + step_index handling', () => {
  it('infers kind from the extension when the arg is omitted (.md → report)', async () => {
    const handler = makeHandler(tmpHome);
    writeJobContext({ job_id: 1, step_index: 2, session_id: 's' });
    writeArtifact('rca.md', '# report');
    fetchMock.mockResolvedValue(mockResponse(200, { filename: 'rca.md', kind: 'report', attachment: null, warnings: [] }));

    await callPublish(handler, { path: 'artifacts/rca.md' });

    expect(new URL((fetchMock.mock.calls[0] as [string])[0]).searchParams.get('kind')).toBe('report');
  });

  it('honours an explicit kind arg over the extension', async () => {
    const handler = makeHandler(tmpHome);
    writeJobContext({ job_id: 1, step_index: 0, session_id: 's' });
    writeArtifact('diagram.png');
    fetchMock.mockResolvedValue(mockResponse(200, { filename: 'diagram.png', kind: 'mock', attachment: null, warnings: [] }));

    await callPublish(handler, { path: 'artifacts/diagram.png', kind: 'mock' });

    expect(new URL((fetchMock.mock.calls[0] as [string])[0]).searchParams.get('kind')).toBe('mock');
  });

  it('sends step_index=0 (not dropped as falsy) and omits session_id when absent', async () => {
    const handler = makeHandler(tmpHome);
    writeJobContext({ job_id: 9, step_index: 0 }); // legacy runtime: no session_id
    writeArtifact('shot.png');
    fetchMock.mockResolvedValue(mockResponse(200, { filename: 'shot.png', kind: 'screenshot', attachment: null, warnings: [] }));

    await callPublish(handler, { path: 'artifacts/shot.png' });

    const u = new URL((fetchMock.mock.calls[0] as [string])[0]);
    expect(u.searchParams.get('step_index')).toBe('0');
    expect(u.searchParams.get('job_id')).toBe('9');
    expect(u.searchParams.has('session_id')).toBe(false);
  });
});

describe('publish_artifact — ticketless / link-only (AC4)', () => {
  it('surfaces a link-only snippet + warning when share succeeds but attach returns null', async () => {
    const handler = makeHandler(tmpHome);
    writeJobContext({ job_id: 5, step_index: 1, session_id: 's' });
    writeArtifact('evidence.png');
    fetchMock.mockResolvedValue(
      mockResponse(200, {
        filename: 'evidence.png',
        kind: 'screenshot',
        download_url: 'https://portal.test/api/artifacts/shared/tok',
        attachment: null,
        warnings: ['Could not attach: job owner not found.'],
      }),
    );

    const res = await callPublish(handler, { path: 'artifacts/evidence.png' });

    expect(isError(res)).toBe(false);
    const text = textOf(res);
    expect(text).toContain('https://portal.test/api/artifacts/shared/tok');
    expect(text).not.toContain('[^evidence.png]'); // no attachment → no inline hint
    expect(text.toLowerCase()).toContain('link-only');
    expect(text).toContain('Could not attach: job owner not found.');
  });
});

describe('publish_artifact — non-fatal failures leave the file for the Stop hook', () => {
  it('reports an actionable message when fetch throws (portal unreachable)', async () => {
    const handler = makeHandler(tmpHome);
    writeJobContext({ job_id: 1, step_index: 0, session_id: 's' });
    writeArtifact('shot.png');
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await callPublish(handler, { path: 'artifacts/shot.png' });

    expect(isError(res)).toBe(true);
    expect(textOf(res)).toContain('Could not reach the portal');
    expect(textOf(res)).toContain('still on disk');
  });

  it('reports HTTP status + endpoint error on a non-2xx (404 ticketless step)', async () => {
    const handler = makeHandler(tmpHome);
    writeJobContext({ job_id: 1, step_index: 0, session_id: 's' });
    writeArtifact('shot.png');
    fetchMock.mockResolvedValue(mockResponse(404, { error: 'Step not found' }));

    const res = await callPublish(handler, { path: 'artifacts/shot.png' });

    expect(isError(res)).toBe(true);
    const text = textOf(res);
    expect(text).toContain('HTTP 404');
    expect(text).toContain('Step not found');
    expect(text).toContain('ticketless');
  });

  it('reports missing agent credentials without calling fetch', async () => {
    const handler = makeHandler(tmpHome);
    writeJobContext({ job_id: 1, step_index: 0, session_id: 's' });
    writeArtifact('shot.png');
    vi.stubEnv('AGENT_TOKEN', '');
    vi.stubEnv('SIDEBUTTON_AGENT_TOKEN', '');

    const res = await callPublish(handler, { path: 'artifacts/shot.png' });

    expect(isError(res)).toBe(true);
    expect(textOf(res)).toContain('Missing agent credentials');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to SIDEBUTTON_AGENT_* credentials', async () => {
    const handler = makeHandler(tmpHome);
    writeJobContext({ job_id: 1, step_index: 0, session_id: 's' });
    writeArtifact('shot.png');
    vi.stubEnv('AGENT_TOKEN', '');
    vi.stubEnv('AGENT_NAME', '');
    vi.stubEnv('SIDEBUTTON_AGENT_TOKEN', 'sb_fallback');
    vi.stubEnv('SIDEBUTTON_AGENT_NAME', 'agent-fallback');
    fetchMock.mockResolvedValue(mockResponse(200, { filename: 'shot.png', kind: 'screenshot', attachment: null, warnings: [] }));

    await callPublish(handler, { path: 'artifacts/shot.png' });

    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sb_fallback');
    expect(headers['X-Agent-Name']).toBe('agent-fallback');
  });
});

describe('publish_artifact — input validation', () => {
  it('rejects a missing file', async () => {
    const handler = makeHandler(tmpHome);
    writeJobContext({ job_id: 1, step_index: 0, session_id: 's' });
    const res = await callPublish(handler, { path: 'artifacts/nope.png' });
    expect(isError(res)).toBe(true);
    expect(textOf(res)).toContain('File not found');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an empty file', async () => {
    const handler = makeHandler(tmpHome);
    writeJobContext({ job_id: 1, step_index: 0, session_id: 's' });
    writeArtifact('empty.png', '');
    const res = await callPublish(handler, { path: 'artifacts/empty.png' });
    expect(isError(res)).toBe(true);
    expect(textOf(res)).toContain('empty');
  });

  it('rejects a file over the 25 MB cap', async () => {
    const handler = makeHandler(tmpHome);
    writeJobContext({ job_id: 1, step_index: 0, session_id: 's' });
    const big = path.join(tmpHome, 'workspace', 'artifacts', 'big.png');
    fs.writeFileSync(big, Buffer.alloc(25 * 1024 * 1024 + 1));
    const res = await callPublish(handler, { path: 'artifacts/big.png' });
    expect(isError(res)).toBe(true);
    expect(textOf(res)).toContain('25 MB');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a directory', async () => {
    const handler = makeHandler(tmpHome);
    writeJobContext({ job_id: 1, step_index: 0, session_id: 's' });
    const res = await callPublish(handler, { path: 'artifacts' });
    expect(isError(res)).toBe(true);
    expect(textOf(res)).toContain('directory');
  });

  it('refuses a path that escapes the home directory', async () => {
    const handler = makeHandler(tmpHome);
    writeJobContext({ job_id: 1, step_index: 0, session_id: 's' });
    const res = await callPublish(handler, { path: '/etc/passwd' });
    expect(isError(res)).toBe(true);
    expect(textOf(res)).toContain('outside your home directory');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports no active job when job-context.json is absent', async () => {
    const handler = makeHandler(tmpHome);
    writeArtifact('shot.png'); // no job-context written
    const res = await callPublish(handler, { path: 'artifacts/shot.png' });
    expect(isError(res)).toBe(true);
    expect(textOf(res)).toContain('No active job');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
