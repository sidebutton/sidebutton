#!/usr/bin/env node
/**
 * Browser-profile conformance probe.
 *
 * The stdio probe (mcp-stdio-probe.mjs) proves the server speaks MCP. This one
 * proves the `browser` container profile actually drives a browser: that the
 * Web Store extension installed, attached to a tab, and that the browser tools
 * return real page data rather than "browser not connected".
 *
 * It asserts against a live page, so it needs network egress — both to the
 * Chrome Web Store (for the extension) and to the page it navigates to.
 *
 * Usage:
 *   node packages/server/scripts/mcp-browser-probe.mjs -- docker run -i --rm sidebutton:browser
 *
 * Exits non-zero with a report on the first failed assertion.
 */

import { spawn } from 'node:child_process';

const PROTOCOL_VERSION = '2025-06-18';
const REQUEST_TIMEOUT_MS = 90_000;
// The extension is fetched from the Web Store on first launch, and the
// entrypoint restarts Chromium if that fetch fails, so the ceiling has to
// cover several attempts rather than one.
const ATTACH_TIMEOUT_MS = Number(process.env.SIDEBUTTON_PROBE_ATTACH_TIMEOUT ?? 240_000);
const TARGET_URL = process.env.SIDEBUTTON_PROBE_URL ?? 'https://example.com';

const separator = process.argv.indexOf('--');
if (separator === -1) {
  console.error('usage: mcp-browser-probe.mjs -- <command to spawn>');
  process.exit(2);
}
const argv = process.argv.slice(separator + 1);

const child = spawn(argv[0], argv.slice(1), { stdio: ['pipe', 'pipe', 'pipe'] });

let stdout = '';
let stderr = '';
const pending = new Map();

child.stdout.setEncoding('utf8');
child.stdout.on('data', chunk => {
  stdout += chunk;
  let newline;
  while ((newline = stdout.indexOf('\n')) !== -1) {
    const line = stdout.slice(0, newline);
    stdout = stdout.slice(newline + 1);
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      fail(`stdout carried a non-JSON line (breaks every stdio client): ${JSON.stringify(line)}`);
      return;
    }
    const resolve = pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message);
    }
  }
});
child.stderr.setEncoding('utf8');
child.stderr.on('data', chunk => (stderr += chunk));

const failures = [];
function fail(message) {
  failures.push(message);
  console.error(`  FAIL  ${message}`);
}
function pass(message) {
  console.log(`  ok    ${message}`);
}
function check(condition, message) {
  condition ? pass(message) : fail(message);
}

let nextId = 1;
function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${method} timed out after ${REQUEST_TIMEOUT_MS}ms`)),
      REQUEST_TIMEOUT_MS,
    );
    pending.set(id, message => {
      clearTimeout(timer);
      resolve(message);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}
function notify(method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Returns the tool's text payload, or throws with the tool's own error text. */
async function callTool(name, args = {}) {
  const response = await request('tools/call', { name, arguments: args });
  if (response.error) throw new Error(response.error.message ?? JSON.stringify(response.error));
  const content = response.result?.content ?? [];
  if (response.result?.isError) {
    throw new Error(content.map(c => c.text).join(' ').slice(0, 200));
  }
  return content;
}
const textOf = content => content.map(c => c.text ?? '').join('\n');

try {
  console.log(`\n  probing: ${argv.join(' ')}\n`);

  const initialize = await request('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'sidebutton-browser-probe', version: '1.0.0' },
  });
  check(!initialize.error, 'initialize returns a result');
  notify('notifications/initialized');

  // The whole point of this profile: the extension installs itself and attaches
  // without any host involvement. Everything below depends on it.
  const started = Date.now();
  let attached = false;
  while (Date.now() - started < ATTACH_TIMEOUT_MS) {
    const status = textOf(await callTool('get_browser_status'));
    if (/Browser Connected:\*\*\s*true/.test(status)) {
      attached = true;
      break;
    }
    await sleep(5_000);
  }
  const attachSeconds = Math.round((Date.now() - started) / 1000);
  check(
    attached,
    `Web Store extension installed and attached to a tab (after ${attachSeconds}s)`,
  );

  if (attached) {
    check(
      /Tab ID:\*\*\s*\d+/.test(textOf(await callTool('get_browser_status'))),
      'a real tab is attached, not just an open socket',
    );

    await callTool('navigate', { url: TARGET_URL });
    pass(`navigate reaches ${TARGET_URL}`);

    const snapshot = textOf(await callTool('snapshot'));
    check(snapshot.includes(TARGET_URL), 'snapshot reports the navigated URL');

    const heading = textOf(await callTool('extract', { selector: 'h1' })).trim();
    check(heading.length > 0, `extract returns live DOM text (got "${heading.slice(0, 40)}")`);

    check(
      textOf(await callTool('exists', { selector: 'h1' })).includes('"exists":true'),
      'exists resolves a selector against the live page',
    );

    const shot = await callTool('screenshot');
    const image = shot.find(c => c.type === 'image');
    check(
      Boolean(image?.data?.length),
      `screenshot returns image bytes (got ${image?.data?.length ?? 0})`,
    );

    const evaluated = textOf(await callTool('evaluate', { js: 'location.href' }));
    check(evaluated.includes(TARGET_URL), 'evaluate runs JavaScript in the page context');
  }

  check(stdout.trim() === '', 'stdout ends with no trailing garbage');
} catch (err) {
  fail(err.message);
} finally {
  child.stdin.end();
  child.kill('SIGTERM');
}

if (failures.length) {
  console.error(`\n  ${failures.length} check(s) failed\n`);
  if (stderr.trim()) console.error(`  --- server stderr ---\n${stderr}`);
  process.exit(1);
}
console.log('\n  all checks passed\n');
process.exit(0);
