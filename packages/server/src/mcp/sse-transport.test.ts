import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { startServer } from '../server.js';

/**
 * KAN-32 — regression coverage for the old HTTP+SSE transport (2024-11-05), the one
 * Claude Code speaks. Ported from the probe scripts attached to the ticket; they drive a
 * real server over real sockets, no mocks.
 *
 *   D1  two clients must not share a session: neither stream is closed by the other
 *       connecting, and neither receives the other's replies.
 *   D2  a reply produced while a client is disconnected must survive to its reconnect.
 *   D3  resources/read on a missing URI must answer -32002 with the uri in `data`.
 *
 * Both surfaces are covered: /mcp (GET+POST) and the legacy /sse + /message pair.
 */

let server: FastifyInstance;
let port: number;
let tmpDir: string;
/** Hijacked SSE replies keep their sockets alive, so every client is released before close. */
const openClients: SseClient[] = [];

/** Minimal old-transport SSE client: parses the event stream and POSTs JSON-RPC. */
class SseClient {
  endpoint: string | null = null;
  ended = false;
  sawErrorEvent = false;
  readonly responses = new Map<string | number, Record<string, any>>();
  protected req?: http.ClientRequest;
  private readonly waiters = new Map<string | number, (msg: Record<string, any>) => void>();

  connect(routePath = '/mcp', lastEventId?: string): Promise<this> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = { Accept: 'text/event-stream' };
      if (lastEventId) headers['Last-Event-ID'] = lastEventId;
      const req = http.request(
        { host: '127.0.0.1', port, path: routePath, method: 'GET', headers },
        (res) => {
          let buf = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            buf += chunk;
            let idx: number;
            while ((idx = buf.indexOf('\n\n')) !== -1) {
              const raw = buf.slice(0, idx);
              buf = buf.slice(idx + 2);
              let event = 'message';
              let data = '';
              for (const line of raw.split('\n')) {
                if (line.startsWith('event: ')) event = line.slice(7);
                else if (line.startsWith('data: ')) data += line.slice(6);
              }
              if (!data) continue;
              if (event === 'endpoint') {
                this.endpoint = data;
                resolve(this);
              } else if (event === 'error') {
                this.sawErrorEvent = true;
              } else {
                let msg: Record<string, any> | null = null;
                try { msg = JSON.parse(data); } catch { /* ping or partial */ }
                if (msg && msg.id !== undefined && msg.id !== null) {
                  this.responses.set(msg.id, msg);
                  this.waiters.get(msg.id)?.(msg);
                  this.waiters.delete(msg.id);
                }
              }
            }
          });
          res.on('end', () => { this.ended = true; });
          res.on('close', () => { this.ended = true; });
        },
      );
      req.on('error', reject);
      req.end();
      this.req = req;
      openClients.push(this);
      setTimeout(() => reject(new Error('no endpoint event in 5s')), 5000).unref();
    });
  }

  /** Open a Streamable-HTTP stream, which is addressed by header rather than by endpoint event. */
  connectWithSessionHeader(sessionId: string): Promise<this> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1', port, path: '/mcp', method: 'GET',
          headers: { Accept: 'text/event-stream', 'Mcp-Session-Id': sessionId },
        },
        (res) => {
          if (res.statusCode !== 200) { reject(new Error(`stream open failed: ${res.statusCode}`)); return; }
          let buf = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            buf += chunk;
            let idx: number;
            while ((idx = buf.indexOf('\n\n')) !== -1) {
              const raw = buf.slice(0, idx);
              buf = buf.slice(idx + 2);
              const data = raw.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('');
              if (!data) continue;
              try {
                const msg = JSON.parse(data);
                if (msg?.id !== undefined && msg.id !== null) this.responses.set(msg.id, msg);
              } catch { /* ping */ }
            }
          });
          res.on('end', () => { this.ended = true; });
          res.on('close', () => { this.ended = true; });
          resolve(this);
        },
      );
      req.on('error', reject);
      req.end();
      this.req = req;
      openClients.push(this);
      // The new transport writes nothing until it has a message, so the response headers
      // only flush with the server's 5s keep-alive ping.
      setTimeout(() => reject(new Error('new-transport stream did not open in 9s')), 9000).unref();
    });
  }

  /** POST to the URL the server advertised in its endpoint event. */
  post(payload: Record<string, unknown>, urlOverride?: string): Promise<{ status: number; body: string }> {
    const target = urlOverride ?? this.endpoint ?? '/mcp';
    const routePath = target.startsWith('http') ? new URL(target).pathname + new URL(target).search : target;
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(payload);
      const req = http.request(
        {
          host: '127.0.0.1', port, path: routePath, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        },
        (res) => {
          let out = '';
          res.setEncoding('utf8');
          res.on('data', (d: string) => { out += d; });
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: out }));
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  waitFor(id: string | number, ms: number): Promise<Record<string, any> | null> {
    const have = this.responses.get(id);
    if (have) return Promise.resolve(have);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.waiters.delete(id); resolve(null); }, ms);
      this.waiters.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    });
  }

  sessionId(): string {
    const match = /[?&]sessionId=([^&]+)/.exec(this.endpoint ?? '');
    return match ? match[1] : '';
  }

  abort(): void {
    try { this.req?.destroy(); } catch { /* ignore */ }
    this.ended = true;
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

/** DELETE /mcp — the client-initiated session termination the MCP spec defines. */
function terminateSession(sessionId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1', port, path: '/mcp', method: 'DELETE',
        headers: { 'Mcp-Session-Id': sessionId },
      },
      (res) => { res.resume(); res.on('end', () => resolve(res.statusCode ?? 0)); },
    );
    req.on('error', reject);
    req.end();
  });
}

/** A workflow with enough steps to stay in flight while a session is torn down. */
const SLOW_WORKFLOW = [
  'schema_version: 1',
  'version: "1.0.0"',
  'id: kan32_slow',
  'title: KAN-32 slow probe',
  'description: "Stays in flight long enough to race a session teardown"',
  'steps:',
  '  - type: terminal.open',
  '    title: "KAN-32"',
  '    cwd: "/tmp"',
  ...Array.from({ length: 20 }, (_, i) => `  - type: terminal.run\n    cmd: "echo step${i}"`),
].join('\n') + '\n';

/**
 * The mid-request teardown race rides `kan32_slow`, whose 21 terminal steps only take real time
 * when tmux exists to spawn them. Without it (Windows dev boxes) every step fails in microseconds,
 * the reply is written before the DELETE lands, and the race test asserts nothing about the code
 * under test — so it skips loudly there instead of failing on its own scaffolding.
 */
const hasTmux = (() => {
  try {
    execFileSync('tmux', ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/**
 * Open a Streamable-HTTP (2025-06-18) session with a live SSE stream, so tests can prove
 * the old-transport routing never reaches into it.
 */
async function openNewTransportSession(): Promise<SseClient> {
  const sessionId = await new Promise<string>((resolve, reject) => {
    const body = JSON.stringify(initialize(700));
    const req = http.request(
      {
        host: '127.0.0.1', port, path: '/mcp', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          const header = res.headers['mcp-session-id'];
          if (typeof header === 'string') resolve(header);
          else reject(new Error('no Mcp-Session-Id on initialize response'));
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  const client = new SseClient();
  await client.connectWithSessionHeader(sessionId);
  return client;
}

const initialize = (id: number): Record<string, unknown> => ({
  jsonrpc: '2.0', id, method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'kan32-test', version: '1' } },
});

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kan32-sse-'));
  const dir = (name: string): string => {
    const d = path.join(tmpDir, name);
    fs.mkdirSync(d, { recursive: true });
    return d;
  };
  fs.writeFileSync(path.join(dir('actions'), 'kan32_slow.yaml'), SLOW_WORKFLOW);
  server = await startServer({
    port: 0,
    host: '127.0.0.1',
    actionsDir: dir('actions'),
    workflowsDir: dir('workflows'),
    templatesDir: dir('templates'),
    runLogsDir: dir('run-logs'),
    configDir: dir('config'),
    dashboardDir: dir('dashboard'),
  });
  const address = server.server.address();
  port = typeof address === 'object' && address ? address.port : 0;
}, 30000);

afterAll(async () => {
  for (const client of openClients) client.abort();
  await sleep(300);
  await server?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}, 30000);

describe('KAN-32 D3 — resources/read on a missing URI (SSE transport)', () => {
  it('answers -32002 with the offending uri in data, for skill:// and workflow://', async () => {
    const client = new SseClient();
    await client.connect();
    await client.post(initialize(1));
    await client.waitFor(1, 4000);

    const misses = [
      { id: 2, uri: 'skill://kan32.nope/_skill.md' },
      { id: 3, uri: 'skill://agents/nope.md' },
      { id: 4, uri: 'workflow://does-not-exist' },
    ];
    for (const miss of misses) {
      await client.post({ jsonrpc: '2.0', id: miss.id, method: 'resources/read', params: { uri: miss.uri } });
      const response = await client.waitFor(miss.id, 4000);
      expect(response, `no response for ${miss.uri}`).not.toBeNull();
      expect(response!.error?.code, `wrong code for ${miss.uri}`).toBe(-32002);
      expect(response!.error?.data).toEqual({ uri: miss.uri });
    }
    client.abort();
  }, 20000);
});

describe('KAN-32 D1 — per-client identity on the old transport (/mcp)', () => {
  it('advertises a session id in the endpoint event', async () => {
    const client = new SseClient();
    await client.connect();
    expect(client.endpoint).toMatch(/\/mcp\?sessionId=[0-9a-f-]{36}$/);
    client.abort();
  }, 15000);

  it('keeps two concurrent clients isolated: no stream takeover, no cross-client replies', async () => {
    const a = new SseClient();
    await a.connect();
    await a.post(initialize(10));
    expect(await a.waitFor(10, 4000)).not.toBeNull();

    const b = new SseClient();
    await b.connect();
    await sleep(300);

    // A must survive B connecting, and must not be silently cut off.
    expect(a.ended).toBe(false);
    expect(a.sawErrorEvent).toBe(false);
    expect(b.sessionId()).not.toBe(a.sessionId());
    // B must not be replayed A's earlier response.
    expect(b.responses.has(10)).toBe(false);

    await a.post({ jsonrpc: '2.0', id: 11, method: 'tools/list', params: {} });
    expect(await a.waitFor(11, 4000)).not.toBeNull();
    expect(await b.waitFor(11, 300)).toBeNull();

    // …and the reverse direction: B's own request reaches B, not A.
    await b.post({ jsonrpc: '2.0', id: 12, method: 'tools/list', params: {} });
    expect(await b.waitFor(12, 4000)).not.toBeNull();
    expect(await a.waitFor(12, 300)).toBeNull();

    a.abort();
    b.abort();
  }, 25000);
});

describe('KAN-32 D2 — a reply produced while disconnected survives the reconnect', () => {
  it('delivers the buffered reply when the client reconnects with its session id', async () => {
    const a = new SseClient();
    await a.connect();
    const sessionId = a.sessionId();
    await a.post(initialize(20));
    expect(await a.waitFor(20, 4000)).not.toBeNull();

    // Drop the stream, then issue a request against the (now streamless) session.
    a.abort();
    await sleep(150);
    const accepted = await a.post({ jsonrpc: '2.0', id: 21, method: 'tools/list', params: {} }, `/mcp?sessionId=${sessionId}`);
    expect(accepted.status).toBe(202);  // accepted, reply owed over SSE
    await sleep(200);

    const reconnected = new SseClient();
    await reconnected.connect(`/mcp?sessionId=${sessionId}`);
    expect(reconnected.sessionId()).toBe(sessionId);
    expect(await reconnected.waitFor(21, 4000)).not.toBeNull();
    reconnected.abort();
  }, 25000);

  it('delivers it to a legacy client that reconnects on the bare URL', async () => {
    const a = new SseClient();
    await a.connect();
    const sessionId = a.sessionId();
    a.abort();
    await sleep(150);
    await a.post({ jsonrpc: '2.0', id: 30, method: 'tools/list', params: {} }, `/mcp?sessionId=${sessionId}`);
    await sleep(200);

    // No sessionId on the reconnect — the sole disconnected session is resumed.
    const reconnected = new SseClient();
    await reconnected.connect('/mcp');
    expect(reconnected.sessionId()).toBe(sessionId);
    expect(await reconnected.waitFor(30, 4000)).not.toBeNull();
    reconnected.abort();
  }, 25000);

  it('does not re-send an already-resent reply on a second reconnect', async () => {
    const a = new SseClient();
    await a.connect();
    const sessionId = a.sessionId();
    a.abort();
    await sleep(150);
    await a.post({ jsonrpc: '2.0', id: 40, method: 'tools/list', params: {} }, `/mcp?sessionId=${sessionId}`);
    await sleep(200);

    const first = new SseClient();
    await first.connect(`/mcp?sessionId=${sessionId}`);
    expect(await first.waitFor(40, 4000)).not.toBeNull();
    first.abort();
    await sleep(150);

    const second = new SseClient();
    await second.connect(`/mcp?sessionId=${sessionId}`);
    await sleep(400);
    expect(second.responses.has(40)).toBe(false);
    second.abort();
  }, 25000);
});

describe('KAN-32 — old-transport compatibility guarantees', () => {
  it('still answers a direct POST /mcp synchronously when no SSE stream is open', async () => {
    await sleep(300);  // let any stream the previous test aborted finish closing
    const direct = new SseClient();
    const res = await direct.post({ jsonrpc: '2.0', id: 50, method: 'tools/list', params: {} }, '/mcp');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).id).toBe(50);
  }, 15000);
});

describe('KAN-32 BUG 4 — the legacy /sse + /message pair', () => {
  it('advertises a session id and keeps two clients isolated', async () => {
    const a = new SseClient();
    await a.connect('/sse');
    expect(a.endpoint).toMatch(/^\/message\?sessionId=[0-9a-f-]{36}$/);

    const b = new SseClient();
    await b.connect('/sse');
    await sleep(300);
    expect(a.ended).toBe(false);
    expect(b.sessionId()).not.toBe(a.sessionId());

    await a.post(initialize(60));
    expect(await a.waitFor(60, 4000)).not.toBeNull();
    expect(await b.waitFor(60, 300)).toBeNull();

    a.abort();
    b.abort();
  }, 25000);

  it('routes a bare /message POST to a legacy client, never to a Streamable-HTTP stream', async () => {
    // The /message fallback scan had no isNewTransport filter at all, so it could
    // deliver a reply into an unrelated Streamable-HTTP client's stream.
    await sleep(300);
    const newTransport = await openNewTransportSession();
    const legacy = new SseClient();
    await legacy.connect('/sse');

    // Bare POST — no sessionId — must still find the legacy session, not the new one.
    await legacy.post({ jsonrpc: '2.0', id: 71, method: 'tools/list', params: {} }, '/message');
    expect(await legacy.waitFor(71, 4000)).not.toBeNull();
    expect(newTransport.responses.has(71)).toBe(false);

    legacy.abort();
    newTransport.abort();
  }, 30000);
});

describe('KAN-32 — the replay set must not grow into replies the client already has', () => {
  it('replays only the unacknowledged tail, not the whole message buffer', async () => {
    await sleep(300);
    const a = new SseClient();
    await a.connect();
    const sessionId = a.sessionId();

    // Three requests, each answered on a live stream. Every later request is itself
    // proof the client is alive and has moved past the replies before it.
    await a.post(initialize(80));
    expect(await a.waitFor(80, 4000)).not.toBeNull();
    for (const id of [81, 82]) {
      await a.post({ jsonrpc: '2.0', id, method: 'tools/list', params: {} });
      expect(await a.waitFor(id, 4000), `no response for ${id}`).not.toBeNull();
    }

    a.abort();
    await sleep(200);

    const reconnected = new SseClient();
    await reconnected.connect(`/mcp?sessionId=${sessionId}`);
    await sleep(500);

    // 80 and 81 were acknowledged by the requests that followed them. Re-sending them
    // hands the client responses it has already resolved — and since the per-POST buffer
    // wipe is gone, that is the whole buffer (up to MESSAGE_BUFFER_SIZE), not one reply.
    expect(reconnected.responses.has(80)).toBe(false);
    expect(reconnected.responses.has(81)).toBe(false);
    // …while the tail, which nothing has acknowledged, is still recovered: that is the
    // reply-written-into-a-dying-socket case D2 exists for.
    expect(reconnected.responses.has(82)).toBe(true);
    reconnected.abort();
  }, 30000);
});

describe('KAN-32 D1 — a POST naming a session the server does not have must not fall back', () => {
  const GHOST = '00000000-0000-4000-8000-000000000000';

  it('answers a stale /mcp?sessionId= caller directly, never into another live stream', async () => {
    await sleep(300);
    const victim = new SseClient();
    await victim.connect();
    await victim.post(initialize(90));
    expect(await victim.waitFor(90, 4000)).not.toBeNull();

    // A client whose session expired (or outlived a server restart) keeps POSTing to the
    // endpoint URL it was handed. Falling back to the first-live-stream scan here would
    // put its reply in the victim stream — D1 reached through a stale id.
    const stale = new SseClient();
    const res = await stale.post(
      { jsonrpc: '2.0', id: 91, method: 'tools/list', params: {} },
      `/mcp?sessionId=${GHOST}`,
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).id).toBe(91);
    expect(await victim.waitFor(91, 600)).toBeNull();
    victim.abort();
  }, 30000);

  it('does the same on the legacy /message endpoint', async () => {
    await sleep(300);
    const victim = new SseClient();
    await victim.connect('/sse');
    await victim.post(initialize(95));
    expect(await victim.waitFor(95, 4000)).not.toBeNull();

    const stale = new SseClient();
    const res = await stale.post(
      { jsonrpc: '2.0', id: 96, method: 'tools/list', params: {} },
      `/message?sessionId=${GHOST}`,
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).id).toBe(96);
    expect(await victim.waitFor(96, 600)).toBeNull();
    victim.abort();
  }, 30000);
});

describe('KAN-32 — a reply must not be written into a session that went away mid-request', () => {
  it.skipIf(!hasTmux)('answers /message synchronously when its session is terminated while the request runs', async () => {
    await sleep(300);
    const a = new SseClient();
    await a.connect('/sse');
    const sessionId = a.sessionId();

    // A request slow enough to outlive its own session, as a long workflow would outlive
    // the 5-minute expiry of a client that never comes back.
    const inflight = a.post({
      jsonrpc: '2.0', id: 100, method: 'tools/call',
      params: { name: 'run_workflow', arguments: { workflow_id: 'kan32_slow' } },
    });
    await sleep(400);
    expect(await terminateSession(sessionId)).toBe(204);

    // Resolving the target before dispatch is what lets a reply be buffered across a brief
    // disconnect — but the session object must be re-checked afterwards. Writing into one
    // that is no longer in the map discards the reply after promising the caller a 202.
    const res = await inflight;
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).id).toBe(100);
    a.abort();
  }, 30000);
});
