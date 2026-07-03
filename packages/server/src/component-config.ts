/**
 * Component-config apply rail — agent-side receiver (SCRUM-1601 / epic SCRUM-1597, A3).
 *
 * Backs `POST /api/component-config/apply`. The portal sends an agent's full *effective* set of
 * decrypted component config profiles (WireGuard `.conf`, OpenVPN `.ovpn`, `rdp.env`); this stages
 * each under the server's own dir and hands it to the ONE privileged hop — `sudo sb-config-place`
 * (SCRUM-1599 / A1) — which validates the target against the installed component's declaration and
 * installs it root:600 at the component's default path, where the component's watcher consumes it.
 *
 * This is the PRIVILEGED, per-component sibling of the shared-files receiver (`files.ts`):
 *  - shared files are a flat, unprivileged `shared/<name>` set owned by a `.sb-files` manifest;
 *  - component config lands under `/etc/...` via `sb-config-place`, owned by a `.sb-config` manifest
 *    keyed by component slug → filename → { sha, config_id }.
 *
 * Reconcile mirrors `.sb-files`: only files this manifest records are ever removed (a de-scoped file
 * is torn down via `sb-config-place --remove`; the component watcher drops the tunnel/service);
 * manually-placed files are never touched. Idempotency is sha-based: an unchanged sha skips the
 * privileged write entirely, so a re-apply never flaps a live tunnel.
 *
 * The agent server stays non-root: it only ever writes inside its OWN staging dir; `sb-config-place`
 * is the entire trust boundary (it re-validates slug + filename + target confinement as root).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Hidden ownership manifest (slug → filename → {sha, config_id}). Sibling of files.ts' `.sb-files`. */
const MANIFEST_NAME = '.sb-config';

/**
 * Per-route body limit for POST /api/component-config/apply. VPN/RDP profiles are small (a few KB),
 * but the payload carries an agent's full effective set base64-inflated, so raise it well above
 * Fastify's 1 MB default while staying far below the shared-files cap.
 */
export const COMPONENT_CONFIG_APPLY_BODY_LIMIT = 16 * 1024 * 1024; // 16 MB

/** Wall-clock budget for a single `sudo sb-config-place` invocation (a fast local install). */
const PLACE_TIMEOUT_MS = 30_000;

// Slug rule: keep in sync with sb-config-place's `^[a-z0-9][a-z0-9-]*$` (SCRUM-1599). Anchored, so an
// embedded newline/control char is rejected rather than splitting into a conforming first line.
const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
// Filename rule: a single safe segment, no leading dot/dash — matches sb-config-place's filename check
// (stricter than the shared-files rule, which allows a leading dot). Defence-in-depth; the wrapper
// re-validates as root.
const SAFE_FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface ApplyComponentConfigItem {
  /** Catalog component slug, e.g. 'wireguard'. */
  component: string;
  /** Catalog config_files[].id, e.g. 'wg-profile'. */
  config_id: string;
  /** Single safe path segment, e.g. 'wg0.conf'. */
  filename: string;
  /** sha256 of the plaintext — drives idempotency (matches the portal's stored sha). */
  sha: string;
  /** base64-encoded plaintext bytes of the profile. */
  content_b64: string;
}

export interface ComponentConfigResult {
  component: string;
  config_id: string;
  filename: string;
  ok: boolean;
  status: 'applied' | 'skipped' | 'removed' | 'error';
  error?: string;
}

/** Result of one `sb-config-place` invocation — split out as a seam so tests can stub the sudo hop. */
export type PlaceRunner = (args: string[]) => Promise<{ stdout: string; stderr: string }>;

interface ManifestEntry {
  sha: string;
  config_id: string;
}
/** slug → filename → { sha, config_id }. Filenames are unique per slug (the catalog contract). */
type Manifest = Record<string, Record<string, ManifestEntry>>;

function isSafeSlug(slug: string): boolean {
  return typeof slug === 'string' && slug.length > 0 && slug.length <= 64 && SAFE_SLUG_RE.test(slug);
}

function isSafeFilename(name: string): boolean {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 255 &&
    name !== MANIFEST_NAME &&
    !/[/\\]/.test(name) &&
    !name.includes('..') &&
    SAFE_FILENAME_RE.test(name)
  );
}

/** Default staging + manifest root: the agent server's own `~/.sidebutton/component-config/`. */
function defaultBaseDir(): string {
  return path.join(os.homedir(), '.sidebutton', 'component-config');
}

/** The real privileged hop. `sudo`'s env_reset drops SB_COMPONENTS_DIR, so the fleet always reads /etc. */
const defaultPlace: PlaceRunner = async (args) => {
  const { stdout, stderr } = await execFileAsync('sudo', ['sb-config-place', ...args], {
    timeout: PLACE_TIMEOUT_MS,
  });
  return { stdout: String(stdout), stderr: String(stderr) };
};

/** Pull the most useful message out of an execFile rejection (sb-config-place `die`s on stderr). */
function placeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { stderr?: unknown; message?: unknown };
    const stderr = typeof e.stderr === 'string' ? e.stderr.trim() : '';
    if (stderr) return stderr;
    if (typeof e.message === 'string') return e.message;
  }
  return String(err);
}

function readManifest(manifestPath: string): Manifest {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Manifest = {};
      for (const [slug, files] of Object.entries(parsed as Record<string, unknown>)) {
        if (!files || typeof files !== 'object' || Array.isArray(files)) continue;
        const inner: Record<string, ManifestEntry> = {};
        for (const [fn, meta] of Object.entries(files as Record<string, unknown>)) {
          const m = meta as { sha?: unknown; config_id?: unknown };
          if (m && typeof m === 'object' && typeof m.sha === 'string') {
            inner[fn] = { sha: m.sha, config_id: typeof m.config_id === 'string' ? m.config_id : '' };
          }
        }
        if (Object.keys(inner).length > 0) out[slug] = inner;
      }
      return out;
    }
  } catch {
    // Missing / unreadable / malformed manifest → treat as "nothing owned yet".
  }
  return {};
}

function writeManifest(manifestPath: string, manifest: Manifest): void {
  try {
    const pruned: Manifest = {};
    for (const [slug, files] of Object.entries(manifest)) {
      if (files && Object.keys(files).length > 0) pruned[slug] = files;
    }
    if (Object.keys(pruned).length === 0) {
      if (fs.existsSync(manifestPath)) fs.rmSync(manifestPath, { force: true });
    } else {
      fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
      fs.writeFileSync(manifestPath, JSON.stringify(pruned, null, 2), 'utf8');
    }
  } catch {
    // A manifest write failure is non-fatal for this apply; the next apply re-reconciles.
  }
}

/**
 * Reconcile-remove one owned file. A directory-target component (wireguard/openvpn) needs the explicit
 * filename; a single-file target (rdp.env) PINS its own basename and rejects any other, so if the
 * filename-qualified remove is rejected we retry without it — that path only fires for single-file
 * targets, whose pinned file then tears down regardless of the stored name.
 */
async function removeConfig(place: PlaceRunner, slug: string, filename: string): Promise<void> {
  try {
    await place(['--remove', slug, filename]);
  } catch {
    await place(['--remove', slug]);
  }
}

/**
 * Full-set apply of an agent's effective component-config profiles.
 *
 * For each item: validate slug + filename; sha-skip when the manifest already records the same sha
 * (the dest is root:600 under the component's declared path — we trust our own manifest rather than
 * stat a file we cannot read; A1's watcher re-applies on drift). Otherwise stage the bytes 0600 under
 * the server's dir and `sudo sb-config-place <slug> <staged>` (filename arg omitted so a single-file
 * target keeps its pinned basename). After the loop, any (slug, filename) recorded in the OLD manifest
 * but absent from this request is reconcile-removed — iterating the manifest keys means a fully
 * de-scoped component (absent from `items`) still tears its last file down. The new manifest is
 * written last so it always reflects exactly what we own.
 *
 * `opts.place` / `opts.baseDir` are test seams (stub the sudo hop; redirect staging to a tmpdir).
 */
export async function applyComponentConfig(
  items: ApplyComponentConfigItem[],
  opts: { baseDir?: string; place?: PlaceRunner } = {},
): Promise<ComponentConfigResult[]> {
  const baseDir = opts.baseDir ?? defaultBaseDir();
  const place = opts.place ?? defaultPlace;
  const manifestPath = path.join(baseDir, MANIFEST_NAME);
  const stagingRoot = path.join(baseDir, 'staging');

  const oldManifest = readManifest(manifestPath);
  const newManifest: Manifest = {};
  const results: ComponentConfigResult[] = [];

  // Every (slug, filename) in this request is "claimed" — even one that errors — so the reconcile pass
  // below never deletes a file that is still in the desired set (mirrors applyFiles' `incoming` set).
  const incoming = new Map<string, Set<string>>();
  const claim = (slug: string, filename: string) => {
    let set = incoming.get(slug);
    if (!set) incoming.set(slug, (set = new Set()));
    set.add(filename);
  };
  const own = (slug: string, filename: string, entry: ManifestEntry) => {
    (newManifest[slug] ??= {})[filename] = entry;
  };

  for (const item of items) {
    const component = String(item?.component ?? '');
    const config_id = String(item?.config_id ?? '');
    const filename = String(item?.filename ?? '');
    claim(component, filename);

    const pushErr = (error: string) => {
      results.push({ component, config_id, filename, ok: false, status: 'error', error });
      // Preserve prior ownership so a transient error doesn't make reconcile tear the good file down.
      const prior = oldManifest[component]?.[filename];
      if (prior) own(component, filename, prior);
    };

    if (!isSafeSlug(component)) { pushErr(`invalid component slug "${component}"`); continue; }
    if (!config_id) { pushErr('config_id is required'); continue; }
    if (!isSafeFilename(filename)) { pushErr(`filename "${filename}" is not a safe single path segment`); continue; }
    if (!item.sha || typeof item.sha !== 'string') { pushErr('sha is required'); continue; }
    if (typeof item.content_b64 !== 'string') { pushErr('content_b64 is required'); continue; }

    // SHA-skip: the manifest already records this exact sha for this (slug, filename) → no privileged
    // write, no tunnel flap.
    if (oldManifest[component]?.[filename]?.sha === item.sha) {
      own(component, filename, { sha: item.sha, config_id });
      results.push({ component, config_id, filename, ok: true, status: 'skipped' });
      continue;
    }

    const slugStaging = path.join(stagingRoot, component);
    const staged = path.join(slugStaging, filename);
    try {
      fs.mkdirSync(slugStaging, { recursive: true });
      fs.writeFileSync(staged, Buffer.from(item.content_b64, 'base64'), { mode: 0o600 });
      await place([component, staged]);
      own(component, filename, { sha: item.sha, config_id });
      results.push({ component, config_id, filename, ok: true, status: 'applied' });
    } catch (err: unknown) {
      pushErr(placeError(err));
    } finally {
      // Never leave a decrypted profile sitting in staging.
      try { fs.rmSync(staged, { force: true }); } catch { /* best-effort */ }
    }
  }

  // Reconcile-remove: any (slug, filename) we previously owned that is absent from this request.
  // Iterating oldManifest keys covers a fully de-scoped component — absent from `items`, still here.
  for (const slug of Object.keys(oldManifest)) {
    for (const [filename, entry] of Object.entries(oldManifest[slug])) {
      if (incoming.get(slug)?.has(filename)) continue;
      // Never act on a malformed historical entry (defence-in-depth; sb-config-place re-checks too).
      if (!isSafeSlug(slug) || !isSafeFilename(filename)) continue;
      try {
        await removeConfig(place, slug, filename);
        results.push({ component: slug, config_id: entry.config_id, filename, ok: true, status: 'removed' });
      } catch {
        // Non-fatal (mirrors applyFiles): keep the entry so the next apply retries the teardown.
        own(slug, filename, entry);
      }
    }
  }

  writeManifest(manifestPath, newManifest);
  return results;
}
