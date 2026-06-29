/**
 * Network-exposure & secret-handling guards for the local HTTP API (SCRUM-1490).
 *
 * The server historically bound 0.0.0.0 with opt-in auth, an unconditional
 * loopback auth-exemption, reflective CORS, an unvalidated completion_callback
 * that forwarded the inbound bearer, and an unredacted GET /api/settings. These
 * pure helpers centralise the hardening so the wiring in server.ts stays small
 * and the logic is unit-testable without standing up Fastify.
 */

import * as path from 'node:path';
import * as net from 'node:net';
import { REDACTED_SECRET, type Settings, type FullLlmConfig } from '@sidebutton/core';

// ---------------------------------------------------------------------------
// Bind-host / client-address classification
// ---------------------------------------------------------------------------

/** Hosts that mean "loopback only" when passed as a bind address. */
const LOOPBACK_BIND_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', 'ip6-localhost']);

/**
 * True when `host` is a loopback bind address (server reachable only from the
 * same machine). Used to (a) decide whether a wide bind needs a token and
 * (b) scope the request-IP auth exemption to loopback binds only.
 */
export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (LOOPBACK_BIND_HOSTS.has(h)) return true;
  // 127.0.0.0/8
  if (net.isIPv4(h)) return h.startsWith('127.');
  return false;
}

/** True when a request's remote address is a loopback client. */
export function isLoopbackAddress(ip: string | undefined): boolean {
  if (!ip) return false;
  let h = ip.trim().toLowerCase();
  if (h === 'localhost' || h === '::1') return true;
  // IPv4-mapped IPv6 (::ffff:127.0.0.1)
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) h = mapped[1];
  if (net.isIPv4(h)) return h.startsWith('127.');
  return false;
}

// ---------------------------------------------------------------------------
// Settings secret redaction (GET /api/settings) + write-path preservation
// ---------------------------------------------------------------------------

/**
 * Return a deep clone of `settings` with stored secrets masked by
 * {@link REDACTED_SECRET}. Empty secrets are left empty so callers can still
 * distinguish "configured" from "not configured". The original is not mutated.
 */
export function redactSettings(settings: Settings): Settings {
  const clone: Settings = JSON.parse(JSON.stringify(settings));
  if (clone.llm && typeof clone.llm.api_key === 'string' && clone.llm.api_key.length > 0) {
    clone.llm.api_key = REDACTED_SECRET;
  }
  return clone;
}

/**
 * When an incoming settings write echoes back the redaction sentinel for a
 * secret (the dashboard round-tripping the masked value), substitute the
 * currently-stored secret so the real key is preserved rather than wiped.
 * A genuine new value passes through untouched.
 */
export function preserveLlmSecret(
  incoming: FullLlmConfig | undefined,
  current: FullLlmConfig | undefined,
): FullLlmConfig | undefined {
  if (!incoming) return incoming;
  if (incoming.api_key === REDACTED_SECRET) {
    return { ...incoming, api_key: current?.api_key ?? '' };
  }
  return incoming;
}

// ---------------------------------------------------------------------------
// completion_callback SSRF validation
// ---------------------------------------------------------------------------

/** Blocked IPv4 literal? (loopback, private, link-local, CGNAT, "this host"). */
function isBlockedIPv4(ip: string): boolean {
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = o;
  if (a === 0) return true;                       // 0.0.0.0/8 "this host"
  if (a === 127) return true;                     // loopback
  if (a === 10) return true;                      // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true;        // private
  if (a === 169 && b === 254) return true;        // link-local incl. 169.254.169.254 metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  return false;
}

/** Blocked IPv6 literal? (loopback, unspecified, ULA, link-local, mapped v4). */
function isBlockedIPv6(ip: string): boolean {
  const h = ip.toLowerCase();
  if (h === '::1' || h === '::') return true;     // loopback / unspecified
  // IPv4-mapped (::ffff:a.b.c.d). The WHATWG URL parser normalises these to
  // compressed hex (::ffff:7f00:1), so decode the dotted form when present and
  // otherwise block the whole mapped range — a mapped literal is never a
  // legitimate callback target.
  if (h.startsWith('::ffff:')) {
    const dotted = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return dotted ? isBlockedIPv4(dotted[1]) : true;
  }
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;  // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true;  // fe80::/10 link-local
  return false;
}

/** Hostnames that are always blocked regardless of DNS resolution. */
function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === 'ip6-localhost' || h === 'ip6-loopback') return true;
  if (h === 'metadata.google.internal' || h === 'metadata') return true;
  return false;
}

export interface CallbackAssessment {
  allowed: boolean;
  url?: URL;
  reason?: string;
}

/**
 * Validate a caller-supplied completion_callback URL against SSRF abuse.
 * Rejects non-http(s) schemes and any host that is a loopback / private /
 * link-local / cloud-metadata literal or a known-internal hostname.
 *
 * Note: this is a syntactic/literal check and does not resolve DNS, so a
 * hostname that resolves to a private address (DNS rebinding) is a documented
 * residual — mitigated in practice by deny-by-default auth on this endpoint
 * and by only ever forwarding the bearer to a trusted origin.
 */
export function assessCallbackUrl(raw: string | undefined): CallbackAssessment {
  if (!raw) return { allowed: false, reason: 'empty' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { allowed: false, reason: 'invalid URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { allowed: false, reason: `scheme ${url.protocol} not allowed` };
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIPv4(host)) {
    if (isBlockedIPv4(host)) return { allowed: false, reason: 'blocked IPv4 range' };
  } else if (net.isIPv6(host)) {
    if (isBlockedIPv6(host)) return { allowed: false, reason: 'blocked IPv6 range' };
  } else if (isBlockedHostname(host)) {
    return { allowed: false, reason: 'blocked hostname' };
  }
  return { allowed: true, url };
}

// ---------------------------------------------------------------------------
// Trusted callback origins (whether to forward the inbound Authorization)
// ---------------------------------------------------------------------------

/** Parse a set of origin/URL strings into a deduped list of `origin` values. */
export function parseOriginList(values: Array<string | undefined>): string[] {
  const out = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    for (const part of v.split(',')) {
      const s = part.trim();
      if (!s) continue;
      try {
        out.add(new URL(s).origin);
      } catch {
        /* ignore malformed entries */
      }
    }
  }
  return [...out];
}

/** Origins the inbound bearer may be forwarded to (the portal, by default). */
export function getTrustedCallbackOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return parseOriginList([
    env.PORTAL_URL,
    env.WEBSITE_BASE_URL,
    env.SIDEBUTTON_CALLBACK_ORIGINS,
  ]);
}

/** True when `url`'s origin is in the trusted list (forward the bearer). */
export function isTrustedCallbackOrigin(url: URL, trusted: string[]): boolean {
  return trusted.includes(url.origin);
}

// ---------------------------------------------------------------------------
// CORS origin policy
// ---------------------------------------------------------------------------

/** True for browser origins served from the same machine (any port). */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return isLoopbackAddress(hostname) || hostname.toLowerCase() === 'localhost';
  } catch {
    return false;
  }
}

/**
 * CORS decision for a given Origin header. A missing Origin (same-origin
 * fetch, curl, server-to-server) is allowed; loopback origins and explicitly
 * configured origins are allowed; everything else is denied (no reflection).
 */
export function isAllowedCorsOrigin(origin: string | undefined, extra: string[]): boolean {
  if (!origin) return true;
  if (isLoopbackOrigin(origin)) return true;
  return extra.includes(origin);
}

/** Read the operator-configured extra CORS origins. */
export function getCorsExtraOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return parseOriginList([env.SIDEBUTTON_CORS_ORIGINS]);
}

/**
 * Build a @fastify/cors `origin` delegate enforcing {@link isAllowedCorsOrigin}.
 */
export function makeCorsOriginDelegate(
  env: NodeJS.ProcessEnv = process.env,
): (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => void {
  const extra = getCorsExtraOrigins(env);
  return (origin, cb) => cb(null, isAllowedCorsOrigin(origin, extra));
}

// ---------------------------------------------------------------------------
// /api/config/apply path containment
// ---------------------------------------------------------------------------

/**
 * Resolve a caller-supplied path for /api/config/apply, expanding a leading
 * `~` to the home dir and rejecting anything that escapes the home dir
 * (absolute paths elsewhere, `..` traversal). Returns the resolved absolute
 * path, or null when the path is not contained within `homeDir`.
 */
export function resolveApplyPath(p: string | undefined, homeDir: string): string | null {
  if (!p || typeof p !== 'string') return null;
  const home = path.resolve(homeDir);
  const expanded = p.startsWith('~') ? path.join(home, p.slice(1)) : p;
  const resolved = path.resolve(expanded);
  if (resolved === home || resolved.startsWith(home + path.sep)) return resolved;
  return null;
}
