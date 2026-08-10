/**
 * Preview passthrough — `/api/preview/:port/*` → `http://127.0.0.1:<port>` (SCRUM-1935).
 *
 * The agent daemon runs on a firewalled VM, so the portal relay is the only path
 * a browser has to anything on that box. Until now the only passthrough was the
 * raw-TCP `/ws/vnc` bridge; this plugin adds the missing hop so a project's dev
 * server — and its HMR WebSocket — can be framed in the portal.
 *
 * Deliberate shape:
 *   • The routes live under `/api/`, so the bearer-token `onRequest` hook in
 *     server.ts covers them for free — including WebSocket upgrades, which
 *     @fastify/websocket dispatches through the full request lifecycle *before*
 *     the handshake. The WS handler re-checks the token with the same semantics
 *     anyway (mirroring `/ws/vnc`) so the guarantee doesn't silently depend on
 *     where the plugin happens to be mounted.
 *   • The upstream host is hard-pinned to 127.0.0.1 and the port is validated
 *     against a range + denylist (+ optional env allowlist). The port segment is
 *     the only attacker-controlled part of the target, so that check is the SSRF
 *     boundary: no user input ever selects a host.
 *   • It is registered as an *encapsulated* plugin. The raw-passthrough content
 *     type parser it installs replaces the JSON/urlencoded parsers for these
 *     routes only, so arbitrary bodies stream through untouched while the rest
 *     of the API keeps its JSON parsing.
 *   • Nothing is rewritten — no HTML/base-href surgery, no header cosmetics. The
 *     proxy moves a port, not a format; serving a dev server under a path prefix
 *     is that dev server's own config (Vite `base` / `hmr.clientPort`).
 */

import * as http from 'node:http';
import * as net from 'node:net';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import { isLoopbackAddress } from './security.js';

export const PREVIEW_PREFIX = '/api/preview';

/** Host advertised upstream. User input picks the port, never the host. */
export const PREVIEW_UPSTREAM_HOST = '127.0.0.1';

/**
 * Loopback addresses dialled, in order. Both are hard-coded literals — no DNS,
 * nothing derived from the request — so the SSRF boundary is unchanged, but a
 * dev server left on its default `localhost` binding is still reachable: on a
 * host whose resolver answers `localhost` with ::1 first (Vite's default, and
 * how these VMs resolve), that server listens on [::1] *only* and an
 * IPv4-only pin 502s against the most ordinary setup there is.
 */
export const LOOPBACK_HOSTS: readonly string[] = ['127.0.0.1', '::1'];

/** Per-address budget for the upstream TCP connect (loopback: effectively instant). */
export const PREVIEW_CONNECT_TIMEOUT_MS = 5_000;

/** Unprivileged ports only — keeps SSH/DNS/etc. out of reach entirely. */
export const MIN_PREVIEW_PORT = 1024;
export const MAX_PREVIEW_PORT = 65535;

/**
 * Never proxied, whatever the allowlist says: the VM's remote-control surfaces.
 * A WebSocket pipe to x11vnc would hand a preview user an interactive desktop
 * (noVNC's view-only is client-side only), and 3389 is the same story for RDP.
 * The daemon's own port is denied separately — see {@link parsePreviewPort}.
 */
export const DENIED_PREVIEW_PORTS: ReadonlySet<number> = new Set([
  3389, // xrdp
  5900, // x11vnc (default)
  5910, // x11vnc (display :10, what the VMs actually run)
]);

/** Upstream gets this long to produce response headers; bodies may stream forever (SSE). */
export const PREVIEW_HEADERS_TIMEOUT_MS = 30_000;

/**
 * Cap on client frames held while the upstream WebSocket handshake completes.
 * On loopback that window is sub-millisecond, but a port that accepts TCP and
 * never upgrades would otherwise let a client buffer without limit.
 */
export const PREVIEW_WS_BUFFER_LIMIT_BYTES = 4 * 1024 * 1024;

/** RFC 9110 §7.6.1 — connection-scoped, must not be forwarded by a proxy. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export interface PreviewProxyOptions {
  /** The daemon's own listen port — proxying to it would loop back into this route. */
  selfPort: number;
  /** Shared secret from SIDEBUTTON_AGENT_TOKEN; undefined on a tokenless loopback dev box. */
  agentToken?: string;
  /** True when the daemon is bound to loopback — gates the same-host auth exemption. */
  boundLoopback: boolean;
  /** Optional narrowing from SIDEBUTTON_PREVIEW_PORTS; null means "any port in range". */
  allowedPorts?: readonly number[] | null;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested without standing up Fastify)
// ---------------------------------------------------------------------------

/**
 * Parse SIDEBUTTON_PREVIEW_PORTS ("5173, 3000") into an allowlist. Returns null
 * for unset/blank — i.e. no extra narrowing beyond range + denylist.
 */
export function parsePortAllowlist(raw: string | undefined): number[] | null {
  if (!raw) return null;
  const ports = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => (/^\d{1,5}$/.test(part) ? Number(part) : NaN))
    .filter((port) => Number.isInteger(port));
  return ports.length > 0 ? ports : null;
}

/**
 * Validate the `:port` segment. Returns the port number, or null when the
 * request must be refused: non-numeric, out of range, the daemon itself, a
 * remote-control port, or outside a configured allowlist.
 */
export function parsePreviewPort(
  raw: string | undefined,
  opts: { selfPort: number; allowedPorts?: readonly number[] | null },
): number | null {
  if (typeof raw !== 'string' || !/^\d{1,5}$/.test(raw)) return null;
  const port = Number(raw);
  if (port < MIN_PREVIEW_PORT || port > MAX_PREVIEW_PORT) return null;
  if (port === opts.selfPort) return null;
  if (DENIED_PREVIEW_PORTS.has(port)) return null;
  if (opts.allowedPorts && !opts.allowedPorts.includes(port)) return null;
  return port;
}

/**
 * Strip `/api/preview/<port>` off the raw request URL, leaving the upstream
 * path + query verbatim (no decode — percent-encoding is the upstream's
 * business). `/api/preview/5173` and `/api/preview/5173/` both yield `/`.
 */
export function buildUpstreamPath(rawUrl: string): string {
  if (!rawUrl.startsWith(`${PREVIEW_PREFIX}/`)) return rawUrl;
  const afterPrefix = rawUrl.slice(PREVIEW_PREFIX.length + 1); // "<port>/rest?query"
  const cut = afterPrefix.search(/[/?]/);
  if (cut === -1) return '/';
  return afterPrefix[cut] === '/' ? afterPrefix.slice(cut) : `/${afterPrefix.slice(cut)}`;
}

/**
 * Location for the bare `/api/preview/:port` → `/api/preview/:port/` redirect.
 * Deliberately *relative*: the portal relay mounts this API under its own prefix,
 * so an absolute path would send the browser outside the preview lane.
 */
export function previewRedirectLocation(rawUrl: string): string {
  const qIndex = rawUrl.indexOf('?');
  const pathname = qIndex === -1 ? rawUrl : rawUrl.slice(0, qIndex);
  const query = qIndex === -1 ? '' : rawUrl.slice(qIndex);
  const segment = pathname.slice(pathname.lastIndexOf('/') + 1);
  return `${segment}/${query}`;
}

/** Split a comma-separated header list (`Connection:`, `Sec-WebSocket-Protocol:`). */
function parseTokenList(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(',') : value;
  if (!raw) return [];
  return raw
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/** Tokens named in a `Connection:` header are hop-by-hop too. */
function connectionTokens(value: string | string[] | undefined): Set<string> {
  return new Set(parseTokenList(value).map((token) => token.toLowerCase()));
}

export interface UpstreamHeaderOptions {
  port: number;
  clientIp?: string;
  /** WS dials: `ws` writes its own handshake headers, ours must not collide. */
  websocket?: boolean;
}

/**
 * Request headers for the upstream hop: hop-by-hop dropped, host repointed at
 * the dev server, forwarding hints added. `authorization` and `cookie` are
 * dropped on purpose — the agent token and the portal's session cookies have no
 * business reaching code the user is editing.
 */
export function filterUpstreamHeaders(
  headers: http.IncomingHttpHeaders,
  opts: UpstreamHeaderOptions,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  const connectionScoped = connectionTokens(headers.connection);

  for (const [rawName, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const name = rawName.toLowerCase();
    if (HOP_BY_HOP.has(name) || connectionScoped.has(name)) continue;
    if (name === 'host' || name === 'x-forwarded-for') continue; // rebuilt below
    if (name === 'authorization' || name === 'cookie') continue; // never forwarded
    if (opts.websocket && name.startsWith('sec-websocket-')) continue;
    out[name] = value;
  }

  out.host = `${PREVIEW_UPSTREAM_HOST}:${opts.port}`;

  const inboundFor = headers['x-forwarded-for'];
  const chain = [
    ...(Array.isArray(inboundFor) ? inboundFor : inboundFor ? [inboundFor] : []),
    ...(opts.clientIp ? [opts.clientIp] : []),
  ];
  if (chain.length > 0) out['x-forwarded-for'] = chain.join(', ');
  if (!out['x-forwarded-proto']) out['x-forwarded-proto'] = 'http';
  if (!out['x-forwarded-host'] && typeof headers.host === 'string') out['x-forwarded-host'] = headers.host;
  out['x-forwarded-prefix'] = `${PREVIEW_PREFIX}/${opts.port}`;

  return out;
}

/** Response headers back to the client: hop-by-hop dropped, everything else verbatim. */
export function filterDownstreamHeaders(
  headers: http.IncomingHttpHeaders,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  const connectionScoped = connectionTokens(headers.connection);
  for (const [rawName, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const name = rawName.toLowerCase();
    if (HOP_BY_HOP.has(name) || connectionScoped.has(name)) continue;
    out[name] = value;
  }
  return out;
}

/**
 * Same rule as the `/api/*` bearer hook in server.ts: loopback callers are exempt
 * only on a loopback bind; everyone else presents the token. Re-checked in the WS
 * handler (as `/ws/vnc` does) so the guarantee is local to this file.
 */
export function isPreviewAuthorized(
  req: { headers: http.IncomingHttpHeaders; ip?: string },
  opts: { agentToken?: string; boundLoopback: boolean },
): boolean {
  if (opts.boundLoopback && isLoopbackAddress(req.ip)) return true;
  const authHeader = req.headers.authorization;
  return Boolean(opts.agentToken) && authHeader === `Bearer ${opts.agentToken}`;
}

/**
 * WS close codes a server may put on the wire — the same set `ws` itself
 * accepts (1004/1005/1006 and 1015 are reserved and never sendable). 1012-1014
 * matter in practice: a dev server restarting sends 1012, and dropping it would
 * relay the close as a bare 1005 with the reason stripped.
 */
function sanitizeCloseCode(code: number | undefined): number | undefined {
  if (typeof code !== 'number') return undefined;
  if (code >= 3000 && code <= 4999) return code;
  if (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) return code;
  return undefined;
}

/** Close reasons are capped at 123 *bytes* on the wire; over-long ones throw in `ws`. */
function sanitizeCloseReason(reason: Buffer | string | undefined): string {
  if (!reason) return '';
  const buf = Buffer.isBuffer(reason) ? reason : Buffer.from(reason, 'utf8');
  if (buf.byteLength <= 123) return buf.toString('utf8');
  // Cut on a byte budget, then drop a partial character left at the seam.
  return buf.subarray(0, 120).toString('utf8').replace(/�+$/, '');
}

function toBuffer(data: Buffer | ArrayBuffer | Buffer[]): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

/**
 * Open a socket to `port` on loopback, trying each address in
 * {@link LOOPBACK_HOSTS} until one connects. Connecting up front (rather than
 * letting http/ws dial) is what makes the fallback safe: the family is settled
 * before a single request byte is forwarded, so nothing has to be replayed.
 */
export function connectLoopback(port: number, hosts: readonly string[] = LOOPBACK_HOSTS): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    let index = 0;
    let lastError: Error = new Error(`no loopback address for port ${port}`);

    const attempt = (): void => {
      const host = hosts[index++];
      const socket = net.connect({ host, port });
      socket.setTimeout(PREVIEW_CONNECT_TIMEOUT_MS);

      const next = (err: Error): void => {
        socket.removeAllListeners();
        socket.destroy();
        lastError = err;
        if (index >= hosts.length) reject(lastError);
        else attempt();
      };

      socket.once('connect', () => {
        socket.removeAllListeners('error');
        socket.removeAllListeners('timeout');
        socket.setTimeout(0);
        resolve(socket);
      });
      socket.once('error', next);
      socket.once('timeout', () => next(new Error(`connect to ${host}:${port} timed out`)));
    };

    attempt();
  });
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers the preview routes. Mount it with `fastify.register()` (never
 * fastify-plugin) — the encapsulation is what keeps the raw body parser from
 * leaking into the JSON API.
 */
export const previewProxyPlugin: FastifyPluginAsync<PreviewProxyOptions> = async (fastify, opts) => {
  const { selfPort, agentToken, boundLoopback, allowedPorts = null } = opts;

  // Scope-local parsers: proxied bodies stream through as-is (any content type,
  // including none), while the parent scope keeps its JSON/urlencoded parsing.
  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser('*', (_request, payload, done) => {
    done(null, payload);
  });

  const resolvePort = (request: FastifyRequest): number | null =>
    parsePreviewPort((request.params as { port?: string }).port, { selfPort, allowedPorts });

  const httpProxy = (request: FastifyRequest, reply: FastifyReply): void => {
    const port = resolvePort(request);
    if (port === null) {
      reply.code(400).send({ error: 'Invalid preview port' });
      return;
    }

    const rawUrl = request.raw.url ?? request.url;

    // From here the response is ours to write byte-for-byte: no Fastify
    // serialisation, no injected headers.
    reply.hijack();
    const res = reply.raw;
    let upstreamReq: http.ClientRequest | null = null;
    let upstreamSocket: net.Socket | null = null;
    let settled = false;

    const fail = (status: number, message: string): void => {
      if (settled) return;
      settled = true;
      upstreamReq?.destroy();
      if (res.headersSent || res.writableEnded) {
        res.destroy();
        return;
      }
      const body = JSON.stringify({ error: message });
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
      });
      res.end(body);
    };

    const headersTimer = setTimeout(
      () => fail(504, `Preview upstream ${PREVIEW_UPSTREAM_HOST}:${port} timed out`),
      PREVIEW_HEADERS_TIMEOUT_MS,
    );
    headersTimer.unref?.();

    // Client hung up (iframe navigated away, relay dropped) — don't leave the
    // upstream request dangling. Harmless no-op on a clean finish.
    res.on('close', () => {
      clearTimeout(headersTimer);
      settled = true;
      upstreamReq?.destroy();
    });
    // A write that fails mid-stream (client gone) emits on the response; with no
    // listener node turns that into an uncaughtException and kills the daemon.
    res.on('error', () => {
      settled = true;
      upstreamReq?.destroy();
    });

    connectLoopback(port).then(
      (socket) => {
        upstreamSocket = socket;
        if (settled) {
          socket.destroy();
          return;
        }
        upstreamReq = http.request({
          host: PREVIEW_UPSTREAM_HOST,
          port,
          method: request.method,
          path: buildUpstreamPath(rawUrl),
          // One socket per proxied request, dialled above: ask the dev server
          // not to hold it open. Loopback connects are free, and never pooling
          // means a dev server that restarts mid-session can't hand us a stale
          // connection — the classic proxy "socket hang up".
          headers: { ...filterUpstreamHeaders(request.headers, { port, clientIp: request.ip }), connection: 'close' },
          // No `agent` key at all: `agent: false` would make node build a
          // throwaway Agent that dials 127.0.0.1 itself and ignores
          // createConnection, quietly undoing the loopback fallback above.
          createConnection: () => socket,
        });

        // We dialled the socket, so we close it. There is no agent to hand an
        // idle connection back to, and node only tears down sockets it owns —
        // without this every proxied request leaks one until the peer hangs up.
        // By 'close' the response body has already been read into `res`.
        upstreamReq.on('close', () => socket.destroy());

        upstreamReq.on('response', (upstreamRes) => {
          clearTimeout(headersTimer);
          if (settled || res.writableEnded || res.destroyed) {
            upstreamRes.destroy();
            return;
          }
          settled = true;
          res.writeHead(
            upstreamRes.statusCode ?? 502,
            upstreamRes.statusMessage,
            filterDownstreamHeaders(upstreamRes.headers),
          );
          upstreamRes.on('error', () => res.destroy());
          upstreamRes.pipe(res);
        });

        upstreamReq.on('error', (err: NodeJS.ErrnoException) => {
          clearTimeout(headersTimer);
          fail(502, `Preview upstream ${PREVIEW_UPSTREAM_HOST}:${port} failed: ${err.message}`);
        });

        const body = request.raw;
        if (body.readableEnded || body.destroyed) {
          upstreamReq.end();
        } else {
          body.on('error', () => upstreamReq?.destroy());
          body.pipe(upstreamReq);
        }
      },
      (err: NodeJS.ErrnoException) => {
        clearTimeout(headersTimer);
        const detail = err.code === 'ECONNREFUSED' ? 'no server listening' : err.message;
        fail(502, `Preview upstream ${PREVIEW_UPSTREAM_HOST}:${port} unreachable: ${detail}`);
      },
    ).catch((err: Error) => {
      // Neither handler above is expected to throw, but if one did the rejection
      // would be unhandled — and an unhandled rejection takes the whole daemon
      // down. A proxied request must never be able to do that (the WS lane has a
      // reachable case of exactly this).
      clearTimeout(headersTimer);
      upstreamSocket?.destroy();
      fail(502, `Preview upstream ${PREVIEW_UPSTREAM_HOST}:${port} failed: ${err.message}`);
    });
  };

  const wsProxy = (socket: WebSocket, request: FastifyRequest): void => {
    if (!isPreviewAuthorized(request, { agentToken, boundLoopback })) {
      socket.close(1008, 'unauthorized');
      return;
    }
    const port = resolvePort(request);
    if (port === null) {
      socket.close(1008, 'invalid preview port');
      return;
    }

    const rawUrl = request.raw.url ?? request.url;
    // Offered subprotocols are forwarded so the dev server can pick one (Vite
    // offers `vite-hmr`); `ws` already echoed the first offer back to the client
    // when @fastify/websocket completed the downstream handshake.
    const protocols = parseTokenList(request.headers['sec-websocket-protocol']);

    // Frames can arrive before the upstream handshake finishes; hold them rather
    // than dropping them (the portal relay uses the same buffer-until-open pipe).
    const pending: Array<{ data: Buffer; binary: boolean }> = [];
    let pendingBytes = 0;
    let upstream: WebSocket | null = null;
    let closed = false;

    const closeUpstream = (): void => {
      try {
        upstream?.close();
      } catch {
        /* already closing */
      }
    };

    const shutdown = (code?: number, reason?: string): void => {
      if (closed) return;
      closed = true;
      pending.length = 0;
      try {
        if (code === undefined) socket.close();
        else socket.close(code, reason);
      } catch {
        /* already closing */
      }
      closeUpstream();
    };

    socket.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      const frame = { data: toBuffer(data), binary: isBinary };
      if (upstream?.readyState === WebSocket.OPEN) {
        upstream.send(frame.data, { binary: frame.binary });
        return;
      }
      pendingBytes += frame.data.byteLength;
      if (pendingBytes > PREVIEW_WS_BUFFER_LIMIT_BYTES) {
        shutdown(1011, 'preview upstream never opened');
        return;
      }
      pending.push(frame);
    });
    socket.on('close', () => {
      closed = true;
      pending.length = 0;
      closeUpstream();
    });
    socket.on('error', () => shutdown(1011, 'preview client error'));

    connectLoopback(port).then(
      (upstreamSocket) => {
        if (closed) {
          upstreamSocket.destroy();
          return;
        }
        let client: WebSocket;
        try {
          client = new WebSocket(
            `ws://${PREVIEW_UPSTREAM_HOST}:${port}${buildUpstreamPath(rawUrl)}`,
            protocols,
            {
              headers: filterUpstreamHeaders(request.headers, { port, clientIp: request.ip, websocket: true }),
              createConnection: () => upstreamSocket,
              // A port that accepts TCP but never upgrades must not strand the
              // client socket open forever.
              handshakeTimeout: PREVIEW_HEADERS_TIMEOUT_MS,
            },
          );
        } catch {
          // `ws` refuses a few targets outright — the reachable one is a request
          // line carrying a `#` fragment, which the HTTP lane forwards verbatim
          // but the WebSocket constructor rejects. The throw lands inside this
          // promise callback, so without the catch it escapes as an unhandled
          // rejection (fatal on Node's default) while the already-upgraded
          // client socket hangs open. A refused dial is a close, never a crash.
          upstreamSocket.destroy();
          shutdown(1011, 'preview upstream dial failed');
          return;
        }
        upstream = client;

        client.on('open', () => {
          for (const frame of pending) client.send(frame.data, { binary: frame.binary });
          pending.length = 0;
          pendingBytes = 0;
        });
        client.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
          if (socket.readyState !== WebSocket.OPEN) return;
          socket.send(toBuffer(data), { binary: isBinary });
        });
        client.on('close', (code: number, reason: Buffer) =>
          shutdown(sanitizeCloseCode(code), sanitizeCloseReason(reason)),
        );
        client.on('error', () => shutdown(1011, 'preview upstream error'));
      },
      () => shutdown(1011, 'preview upstream unreachable'),
    ).catch(() => shutdown(1011, 'preview upstream dial failed'));
  };

  // GET carries both lanes: plain HTTP and — when the request is an upgrade —
  // the WebSocket pipe. HEAD is declared on the sibling route instead of being
  // auto-exposed so it reaches the proxy handler unmodified.
  fastify.route({
    method: 'GET',
    url: `${PREVIEW_PREFIX}/:port/*`,
    exposeHeadRoute: false,
    handler: httpProxy,
    wsHandler: wsProxy,
  });

  fastify.route({
    method: ['HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    url: `${PREVIEW_PREFIX}/:port/*`,
    handler: httpProxy,
  });

  // `/api/preview/5173` has no path to forward; bounce it to the slashed form so
  // the dev server's relative asset URLs resolve inside the preview prefix.
  fastify.route({
    method: ['GET', 'HEAD'],
    url: `${PREVIEW_PREFIX}/:port`,
    exposeHeadRoute: false,
    handler: (request, reply) => {
      if (resolvePort(request) === null) {
        reply.code(400).send({ error: 'Invalid preview port' });
        return;
      }
      reply.code(308).header('location', previewRedirectLocation(request.raw.url ?? request.url)).send();
    },
  });
};
