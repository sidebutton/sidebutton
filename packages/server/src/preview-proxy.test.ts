import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyFormbody from '@fastify/formbody';
import { WebSocket, WebSocketServer } from 'ws';
import { isLoopbackAddress } from './security.js';
import {
  PREVIEW_PREFIX,
  DENIED_PREVIEW_PORTS,
  parsePortAllowlist,
  parsePreviewPort,
  buildUpstreamPath,
  previewRedirectLocation,
  filterUpstreamHeaders,
  filterDownstreamHeaders,
  isPreviewAuthorized,
  previewProxyPlugin,
  connectLoopback,
} from './preview-proxy.js';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('parsePreviewPort', () => {
  const opts = { selfPort: 9876 };

  it('accepts unprivileged numeric ports', () => {
    for (const raw of ['1024', '3000', '5173', '65535']) {
      expect(parsePreviewPort(raw, opts)).toBe(Number(raw));
    }
  });

  it('rejects anything that is not a plain port number', () => {
    for (const raw of ['', 'abc', '51 73', '5173a', '-1', '5173.0', '0x10', '../etc', undefined, '123456']) {
      expect(parsePreviewPort(raw, opts)).toBeNull();
    }
  });

  it('rejects privileged and out-of-range ports', () => {
    for (const raw of ['0', '22', '80', '443', '1023', '65536', '99999']) {
      expect(parsePreviewPort(raw, opts)).toBeNull();
    }
  });

  it("rejects the daemon's own port (self-proxy loop)", () => {
    expect(parsePreviewPort('9876', opts)).toBeNull();
    expect(parsePreviewPort('9876', { selfPort: 1234 })).toBe(9876);
  });

  it('hard-denies the remote-control ports whatever the allowlist says', () => {
    for (const port of DENIED_PREVIEW_PORTS) {
      expect(parsePreviewPort(String(port), opts)).toBeNull();
      expect(parsePreviewPort(String(port), { ...opts, allowedPorts: [port] })).toBeNull();
    }
    // the x11vnc display the VMs actually run, spelled out
    expect(parsePreviewPort('5910', opts)).toBeNull();
    expect(parsePreviewPort('3389', opts)).toBeNull();
  });

  it('narrows to the allowlist when one is configured', () => {
    const allowed = { ...opts, allowedPorts: [5173, 3000] };
    expect(parsePreviewPort('5173', allowed)).toBe(5173);
    expect(parsePreviewPort('8080', allowed)).toBeNull();
    expect(parsePreviewPort('8080', { ...opts, allowedPorts: null })).toBe(8080);
  });
});

describe('parsePortAllowlist', () => {
  it('parses a comma list, ignoring blanks and junk', () => {
    expect(parsePortAllowlist('5173, 3000 ,')).toEqual([5173, 3000]);
    expect(parsePortAllowlist('5173')).toEqual([5173]);
  });

  it('returns null when unset or empty so no extra narrowing applies', () => {
    expect(parsePortAllowlist(undefined)).toBeNull();
    expect(parsePortAllowlist('')).toBeNull();
    expect(parsePortAllowlist(' , ')).toBeNull();
    expect(parsePortAllowlist('nope')).toBeNull();
  });
});

describe('buildUpstreamPath', () => {
  it('strips the preview prefix and keeps path + query verbatim', () => {
    expect(buildUpstreamPath('/api/preview/5173/')).toBe('/');
    expect(buildUpstreamPath('/api/preview/5173')).toBe('/');
    expect(buildUpstreamPath('/api/preview/5173/src/main.ts')).toBe('/src/main.ts');
    expect(buildUpstreamPath('/api/preview/5173/a/b?x=1&y=2')).toBe('/a/b?x=1&y=2');
    expect(buildUpstreamPath('/api/preview/5173?x=1')).toBe('/?x=1');
  });

  it('does not decode percent-encoding', () => {
    expect(buildUpstreamPath('/api/preview/5173/a%20b/c%2Fd?q=%3F')).toBe('/a%20b/c%2Fd?q=%3F');
  });

  it('leaves unrelated URLs alone', () => {
    expect(buildUpstreamPath('/api/health')).toBe('/api/health');
  });
});

describe('previewRedirectLocation', () => {
  it('points at the slashed form relatively, so any proxy prefix survives', () => {
    expect(previewRedirectLocation('/api/preview/5173')).toBe('5173/');
    expect(previewRedirectLocation('/api/preview/5173?x=1')).toBe('5173/?x=1');
  });
});

describe('filterUpstreamHeaders', () => {
  const base = {
    host: 'agent-12:9876',
    authorization: 'Bearer super-secret',
    cookie: 'portal_session=abc',
    connection: 'keep-alive, x-custom-hop',
    'keep-alive': 'timeout=5',
    'transfer-encoding': 'chunked',
    upgrade: 'websocket',
    'x-custom-hop': 'dropped-by-connection-token',
    'content-type': 'text/plain',
    accept: '*/*',
  } as http.IncomingHttpHeaders;

  it('drops hop-by-hop headers and Connection-listed tokens', () => {
    const out = filterUpstreamHeaders(base, { port: 5173 });
    for (const name of ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'x-custom-hop']) {
      expect(out[name]).toBeUndefined();
    }
    expect(out['content-type']).toBe('text/plain');
    expect(out.accept).toBe('*/*');
  });

  it('never forwards the agent token or portal cookies to project code', () => {
    const out = filterUpstreamHeaders(base, { port: 5173 });
    expect(out.authorization).toBeUndefined();
    expect(out.cookie).toBeUndefined();
  });

  it('repoints host at the dev server and records the forwarding context', () => {
    const out = filterUpstreamHeaders(base, { port: 5173, clientIp: '10.0.0.9' });
    expect(out.host).toBe('127.0.0.1:5173');
    expect(out['x-forwarded-host']).toBe('agent-12:9876');
    expect(out['x-forwarded-proto']).toBe('http');
    expect(out['x-forwarded-prefix']).toBe('/api/preview/5173');
    expect(out['x-forwarded-for']).toBe('10.0.0.9');
  });

  it('appends to an existing x-forwarded-for chain and keeps an upstream proto', () => {
    const out = filterUpstreamHeaders(
      { ...base, 'x-forwarded-for': '203.0.113.7', 'x-forwarded-proto': 'https' },
      { port: 5173, clientIp: '10.0.0.9' },
    );
    expect(out['x-forwarded-for']).toBe('203.0.113.7, 10.0.0.9');
    expect(out['x-forwarded-proto']).toBe('https');
  });

  it('drops sec-websocket-* on the WS dial so `ws` owns the handshake', () => {
    const out = filterUpstreamHeaders(
      { ...base, 'sec-websocket-key': 'k', 'sec-websocket-version': '13', 'sec-websocket-protocol': 'vite-hmr' },
      { port: 5173, websocket: true },
    );
    expect(Object.keys(out).some((name) => name.startsWith('sec-websocket-'))).toBe(false);
  });
});

describe('filterDownstreamHeaders', () => {
  it('keeps payload headers verbatim and drops hop-by-hop', () => {
    const out = filterDownstreamHeaders({
      'content-type': 'text/html',
      'content-encoding': 'gzip',
      'content-length': '12',
      'set-cookie': ['a=1', 'b=2'],
      connection: 'keep-alive',
      'transfer-encoding': 'chunked',
    });
    expect(out['content-type']).toBe('text/html');
    expect(out['content-encoding']).toBe('gzip');
    expect(out['content-length']).toBe('12');
    expect(out['set-cookie']).toEqual(['a=1', 'b=2']);
    expect(out.connection).toBeUndefined();
    expect(out['transfer-encoding']).toBeUndefined();
  });
});

describe('isPreviewAuthorized', () => {
  const token = 'tok-123';

  it('mirrors the /api/* hook: loopback exempt only on a loopback bind', () => {
    expect(isPreviewAuthorized({ headers: {}, ip: '127.0.0.1' }, { agentToken: token, boundLoopback: true })).toBe(true);
    expect(isPreviewAuthorized({ headers: {}, ip: '127.0.0.1' }, { agentToken: token, boundLoopback: false })).toBe(false);
    expect(isPreviewAuthorized({ headers: {}, ip: '10.0.0.5' }, { agentToken: token, boundLoopback: true })).toBe(false);
  });

  it('accepts only an exact bearer match', () => {
    const opts = { agentToken: token, boundLoopback: false };
    expect(isPreviewAuthorized({ headers: { authorization: `Bearer ${token}` }, ip: '10.0.0.5' }, opts)).toBe(true);
    expect(isPreviewAuthorized({ headers: { authorization: 'Bearer nope' }, ip: '10.0.0.5' }, opts)).toBe(false);
    expect(isPreviewAuthorized({ headers: { authorization: token }, ip: '10.0.0.5' }, opts)).toBe(false);
  });

  it('denies a wide bind that has no token configured at all', () => {
    expect(isPreviewAuthorized({ headers: { authorization: 'Bearer ' }, ip: '10.0.0.5' }, { boundLoopback: false })).toBe(false);
  });
});

describe('connectLoopback', () => {
  it('falls through to the next loopback address when the first refuses', async () => {
    const server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, '::1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      const socket = await connectLoopback(port);
      expect(socket.remoteAddress).toBe('::1');
      socket.destroy();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects when nothing on loopback is listening', async () => {
    await expect(connectLoopback(4999, ['127.0.0.1'])).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Integration: real sockets, real upstream
// ---------------------------------------------------------------------------

interface Upstream {
  port: number;
  close: () => Promise<void>;
  /** Handshake headers of the last WS upgrade the stub accepted. */
  lastWsHeaders: http.IncomingHttpHeaders | null;
}

/** A stand-in dev server: echoes the request it saw, plus a couple of fixed routes. */
async function startUpstream(bindHost = '127.0.0.1'): Promise<Upstream> {
  const state: { lastWsHeaders: http.IncomingHttpHeaders | null } = { lastWsHeaders: null };

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      if (req.url === '/missing') {
        res.writeHead(404, { 'content-type': 'text/plain', 'x-upstream': 'yes' });
        res.end('nope');
        return;
      }
      if (req.url === '/binary') {
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'x-upstream': 'yes' });
        res.end(body);
        return;
      }
      const payload = JSON.stringify({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: body.toString('utf8'),
      });
      res.writeHead(200, { 'content-type': 'application/json', 'x-upstream': 'yes' });
      res.end(req.method === 'HEAD' ? undefined : payload);
    });
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (socket, req) => {
    state.lastWsHeaders = req.headers;
    if (req.url?.startsWith('/close-4001')) {
      socket.close(4001, 'upstream done');
      return;
    }
    socket.send(`hello ${req.url}`);
    socket.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) socket.send(data, { binary: true });
      else socket.send(`echo:${data.toString('utf8')}`);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, bindHost, resolve));
  return {
    port: (server.address() as AddressInfo).port,
    get lastWsHeaders() {
      return state.lastWsHeaders;
    },
    close: () =>
      new Promise<void>((resolve) => {
        wss.close();
        server.close(() => resolve());
      }),
  };
}

interface ProxyOpts {
  selfPort?: number;
  agentToken?: string;
  boundLoopback?: boolean;
  allowedPorts?: number[] | null;
  /** Extra routes, registered before `listen()` like they would be in serve mode. */
  extraRoutes?: (app: FastifyInstance) => void;
}

/** A Fastify instance wired exactly like serve mode: JSON parser, bearer hook, plugin. */
async function startProxy(opts: ProxyOpts = {}): Promise<{ app: FastifyInstance; port: number }> {
  const agentToken = opts.agentToken;
  const boundLoopback = opts.boundLoopback ?? true;

  const app = Fastify({ logger: false });

  // Same global parser as server.ts — the plugin must not disturb it.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || body === '') return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });
  await app.register(fastifyFormbody);
  await app.register(fastifyWebsocket);

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    if (boundLoopback && isLoopbackAddress(request.ip)) return;
    const authHeader = request.headers.authorization;
    if (!agentToken || !authHeader?.startsWith('Bearer ') || authHeader.slice(7) !== agentToken) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  app.post('/api/echo', async (request) => ({ parsed: request.body }));
  opts.extraRoutes?.(app);

  await app.register(previewProxyPlugin, {
    selfPort: opts.selfPort ?? 9876,
    agentToken,
    boundLoopback,
    allowedPorts: opts.allowedPorts ?? null,
  });

  await app.listen({ port: 0, host: '127.0.0.1' });
  return { app, port: (app.server.address() as AddressInfo).port };
}

interface Response {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

function send(
  port: number,
  path: string,
  opts: { method?: string; headers?: http.OutgoingHttpHeaders; body?: string | Buffer } = {},
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers: opts.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

const openSockets: Array<{ close: () => void }> = [];
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const socket of openSockets.splice(0)) {
    try {
      socket.close();
    } catch {
      /* already closed */
    }
  }
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function harness(
  opts: ProxyOpts = {},
  upstreamHost?: string,
): Promise<{ upstream: Upstream; proxyPort: number }> {
  const upstream = await startUpstream(upstreamHost);
  const { app, port } = await startProxy(opts);
  cleanups.push(() => app.close(), () => upstream.close());
  return { upstream, proxyPort: port };
}

describe('preview proxy — HTTP', () => {
  it('forwards path, query and method verbatim', async () => {
    const { upstream, proxyPort } = await harness();
    const res = await send(proxyPort, `${PREVIEW_PREFIX}/${upstream.port}/src/main.ts?hmr=1&x=a%20b`);
    expect(res.status).toBe(200);
    const seen = JSON.parse(res.body.toString('utf8'));
    expect(seen.method).toBe('GET');
    expect(seen.url).toBe('/src/main.ts?hmr=1&x=a%20b');
  });

  it('serves the site root for the slashed prefix', async () => {
    const { upstream, proxyPort } = await harness();
    const res = await send(proxyPort, `${PREVIEW_PREFIX}/${upstream.port}/`);
    expect(JSON.parse(res.body.toString('utf8')).url).toBe('/');
  });

  it('rewrites host, strips the token and cookies, adds forwarding hints', async () => {
    const { upstream, proxyPort } = await harness();
    const res = await send(proxyPort, `${PREVIEW_PREFIX}/${upstream.port}/`, {
      headers: { authorization: 'Bearer super-secret', cookie: 'portal_session=abc', 'x-trace': 'keep-me' },
    });
    const seen = JSON.parse(res.body.toString('utf8'));
    expect(seen.headers.host).toBe(`127.0.0.1:${upstream.port}`);
    expect(seen.headers.authorization).toBeUndefined();
    expect(seen.headers.cookie).toBeUndefined();
    expect(seen.headers['x-trace']).toBe('keep-me');
    expect(seen.headers['x-forwarded-prefix']).toBe(`${PREVIEW_PREFIX}/${upstream.port}`);
  });

  it('passes upstream status and headers straight through', async () => {
    const { upstream, proxyPort } = await harness();
    const res = await send(proxyPort, `${PREVIEW_PREFIX}/${upstream.port}/missing`);
    expect(res.status).toBe(404);
    expect(res.headers['x-upstream']).toBe('yes');
    expect(res.body.toString('utf8')).toBe('nope');
  });

  it('streams request bodies raw — even bodies the JSON parser would reject', async () => {
    const { upstream, proxyPort } = await harness();
    const malformed = '{"not valid json';
    const res = await send(proxyPort, `${PREVIEW_PREFIX}/${upstream.port}/api/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(malformed) },
      body: malformed,
    });
    expect(res.status).toBe(200);
    const seen = JSON.parse(res.body.toString('utf8'));
    expect(seen.method).toBe('POST');
    expect(seen.body).toBe(malformed);
  });

  it('round-trips arbitrary content types and binary payloads', async () => {
    const { upstream, proxyPort } = await harness();
    const payload = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x10]);
    const res = await send(proxyPort, `${PREVIEW_PREFIX}/${upstream.port}/binary`, {
      method: 'PUT',
      headers: { 'content-type': 'application/x-not-a-real-type', 'content-length': payload.length },
      body: payload,
    });
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body, payload)).toBe(0);
  });

  it('answers HEAD without a body', async () => {
    const { upstream, proxyPort } = await harness();
    const res = await send(proxyPort, `${PREVIEW_PREFIX}/${upstream.port}/`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers['x-upstream']).toBe('yes');
    expect(res.body.length).toBe(0);
  });

  it('308s the bare prefix to the slashed form, keeping the query', async () => {
    const { upstream, proxyPort } = await harness();
    const res = await send(proxyPort, `${PREVIEW_PREFIX}/${upstream.port}?x=1`);
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe(`${upstream.port}/?x=1`);
  });

  it('reaches a dev server that only bound [::1] — the `localhost` default', async () => {
    // Vite (and most frameworks) bind the name `localhost`, which resolves to ::1
    // first on these VMs, so an IPv4-only pin would 502 on the common case.
    const { upstream, proxyPort } = await harness({}, '::1');
    const res = await send(proxyPort, `${PREVIEW_PREFIX}/${upstream.port}/only-v6`);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body.toString('utf8')).url).toBe('/only-v6');
  });

  it('502s a dead port instead of hanging', async () => {
    const { upstream, proxyPort } = await harness();
    await upstream.close();
    const res = await send(proxyPort, `${PREVIEW_PREFIX}/${upstream.port}/`);
    expect(res.status).toBe(502);
    expect(JSON.parse(res.body.toString('utf8')).error).toContain('unreachable');
  });

  it('400s every port the validator refuses', async () => {
    const { proxyPort } = await harness({ selfPort: 9876 });
    for (const port of ['abc', '80', '70000', '5910', '3389', '9876']) {
      const res = await send(proxyPort, `${PREVIEW_PREFIX}/${port}/`);
      expect(res.status, `port ${port}`).toBe(400);
    }
  });

  it('400s ports outside a configured allowlist', async () => {
    const { upstream, proxyPort } = await harness({ allowedPorts: [4321] });
    const res = await send(proxyPort, `${PREVIEW_PREFIX}/${upstream.port}/`);
    expect(res.status).toBe(400);
  });

  it('requires the bearer token on a wide bind', async () => {
    const { upstream, proxyPort } = await harness({ boundLoopback: false, agentToken: 'tok-123' });
    const denied = await send(proxyPort, `${PREVIEW_PREFIX}/${upstream.port}/`);
    expect(denied.status).toBe(401);

    const wrong = await send(proxyPort, `${PREVIEW_PREFIX}/${upstream.port}/`, {
      headers: { authorization: 'Bearer nope' },
    });
    expect(wrong.status).toBe(401);

    const allowed = await send(proxyPort, `${PREVIEW_PREFIX}/${upstream.port}/`, {
      headers: { authorization: 'Bearer tok-123' },
    });
    expect(allowed.status).toBe(200);
  });

  it('leaves the JSON parsing of sibling API routes alone', async () => {
    const { proxyPort } = await harness();
    const ok = await send(proxyPort, '/api/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"a":1}',
    });
    expect(JSON.parse(ok.body.toString('utf8'))).toEqual({ parsed: { a: 1 } });

    // Malformed JSON is still rejected on sibling routes rather than streamed
    // through like a preview body — the exact status is the app's error handler's
    // business (serve mode surfaces the parser's SyntaxError as a 500).
    const bad = await send(proxyPort, '/api/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{oops',
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });
});

// ---------------------------------------------------------------------------
// Integration: WebSocket lane (HMR)
// ---------------------------------------------------------------------------

interface WsSession {
  socket: WebSocket;
  messages: string[];
  closed: Promise<{ code: number; reason: string }>;
}

function connectWs(
  url: string,
  opts: { protocols?: string[]; headers?: Record<string, string> } = {},
): Promise<WsSession> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, opts.protocols ?? [], { headers: opts.headers });
    openSockets.push({ close: () => socket.close() });
    const messages: string[] = [];
    socket.on('message', (data: Buffer) => messages.push(data.toString('utf8')));
    const closed = new Promise<{ code: number; reason: string }>((resolveClosed) => {
      socket.on('close', (code, reason) => resolveClosed({ code, reason: reason.toString('utf8') }));
    });
    socket.on('open', () => resolve({ socket, messages, closed }));
    socket.on('error', reject);
  });
}

/** Wait for `predicate` without racing the event loop on a fixed sleep. */
async function until(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('preview proxy — WebSocket', () => {
  it('pipes frames both ways and keeps the upstream path', async () => {
    const { upstream, proxyPort } = await harness();
    const session = await connectWs(`ws://127.0.0.1:${proxyPort}${PREVIEW_PREFIX}/${upstream.port}/ws-path?token=x`);

    await until(() => session.messages.length > 0);
    expect(session.messages[0]).toBe('hello /ws-path?token=x');

    session.socket.send('ping-from-browser');
    await until(() => session.messages.length > 1);
    expect(session.messages[1]).toBe('echo:ping-from-browser');
  });

  it('preserves binary frames', async () => {
    const { upstream, proxyPort } = await harness();
    const socket = new WebSocket(`ws://127.0.0.1:${proxyPort}${PREVIEW_PREFIX}/${upstream.port}/bin`);
    openSockets.push({ close: () => socket.close() });
    const binaryFrames: Array<{ data: Buffer; isBinary: boolean }> = [];
    socket.on('message', (data: Buffer, isBinary: boolean) => binaryFrames.push({ data, isBinary }));
    await new Promise((resolve, reject) => {
      socket.on('open', resolve);
      socket.on('error', reject);
    });
    socket.send(Buffer.from([0x01, 0x02, 0x03]));
    await until(() => binaryFrames.some((frame) => frame.isBinary));
    const binary = binaryFrames.find((frame) => frame.isBinary)!;
    expect(Buffer.compare(binary.data, Buffer.from([0x01, 0x02, 0x03]))).toBe(0);
  });

  it("echoes the subprotocol so Vite's vite-hmr handshake completes end to end", async () => {
    const { upstream, proxyPort } = await harness();
    const session = await connectWs(`ws://127.0.0.1:${proxyPort}${PREVIEW_PREFIX}/${upstream.port}/`, {
      protocols: ['vite-hmr'],
    });
    expect(session.socket.protocol).toBe('vite-hmr');
    await until(() => upstream.lastWsHeaders !== null);
    expect(upstream.lastWsHeaders?.['sec-websocket-protocol']).toBe('vite-hmr');
  });

  it('does not send handshake headers twice on the upstream dial', async () => {
    const { upstream, proxyPort } = await harness();
    await connectWs(`ws://127.0.0.1:${proxyPort}${PREVIEW_PREFIX}/${upstream.port}/`);
    await until(() => upstream.lastWsHeaders !== null);
    for (const [name, value] of Object.entries(upstream.lastWsHeaders ?? {})) {
      expect(Array.isArray(value), `${name} was sent twice`).toBe(false);
    }
    expect(upstream.lastWsHeaders?.host).toBe(`127.0.0.1:${upstream.port}`);
    expect(upstream.lastWsHeaders?.authorization).toBeUndefined();
  });

  it('pipes to an [::1]-only dev server, like an unconfigured Vite HMR socket', async () => {
    const { upstream, proxyPort } = await harness({}, '::1');
    const session = await connectWs(`ws://127.0.0.1:${proxyPort}${PREVIEW_PREFIX}/${upstream.port}/hmr`, {
      protocols: ['vite-hmr'],
    });
    expect(session.socket.protocol).toBe('vite-hmr');
    await until(() => session.messages.length > 0);
    expect(session.messages[0]).toBe('hello /hmr');
  });

  it('mirrors the upstream close code and reason', async () => {
    const { upstream, proxyPort } = await harness();
    const session = await connectWs(`ws://127.0.0.1:${proxyPort}${PREVIEW_PREFIX}/${upstream.port}/close-4001`);
    const closed = await session.closed;
    expect(closed.code).toBe(4001);
    expect(closed.reason).toBe('upstream done');
  });

  it('closes cleanly when nothing is listening on the port', async () => {
    const { upstream, proxyPort } = await harness();
    await upstream.close();
    const socket = new WebSocket(`ws://127.0.0.1:${proxyPort}${PREVIEW_PREFIX}/${upstream.port}/`);
    openSockets.push({ close: () => socket.close() });
    const code = await new Promise<number>((resolve, reject) => {
      socket.on('close', resolve);
      socket.on('error', reject);
    });
    expect(code).toBe(1011);
  });

  it('refuses a denied port before dialling anything', async () => {
    const { proxyPort } = await harness();
    const socket = new WebSocket(`ws://127.0.0.1:${proxyPort}${PREVIEW_PREFIX}/5910/`);
    openSockets.push({ close: () => socket.close() });
    const closed = await new Promise<{ code: number; reason: string }>((resolve, reject) => {
      socket.on('close', (code, reason) => resolve({ code, reason: reason.toString('utf8') }));
      socket.on('error', reject);
    });
    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe('invalid preview port');
  });

  it('refuses the upgrade without a bearer token on a wide bind', async () => {
    const { upstream, proxyPort } = await harness({ boundLoopback: false, agentToken: 'tok-123' });
    const failure = await new Promise<string>((resolve) => {
      const socket = new WebSocket(`ws://127.0.0.1:${proxyPort}${PREVIEW_PREFIX}/${upstream.port}/`);
      openSockets.push({ close: () => socket.close() });
      socket.on('unexpected-response', (_req, res) => resolve(`status:${res.statusCode}`));
      socket.on('error', (err) => resolve(`error:${err.message}`));
      socket.on('open', () => resolve('opened'));
    });
    expect(failure).toBe('status:401');

    const session = await connectWs(`ws://127.0.0.1:${proxyPort}${PREVIEW_PREFIX}/${upstream.port}/`, {
      headers: { authorization: 'Bearer tok-123' },
    });
    expect(session.socket.readyState).toBe(WebSocket.OPEN);
  });

  it('leaves subprotocol-less sockets on other routes untouched', async () => {
    const { app, port } = await startProxy({
      extraRoutes: (instance) => {
        instance.get('/ws/probe', { websocket: true }, (socket) => socket.send('probe-ok'));
      },
    });
    cleanups.push(() => app.close());
    const session = await connectWs(`ws://127.0.0.1:${port}/ws/probe`);
    expect(session.socket.protocol).toBe('');
    await until(() => session.messages.length > 0);
    expect(session.messages[0]).toBe('probe-ok');
  });
});
