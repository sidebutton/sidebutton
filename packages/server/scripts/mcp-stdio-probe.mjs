#!/usr/bin/env node
/**
 * MCP stdio conformance probe.
 *
 * Drives a SideButton MCP server over stdio exactly the way an MCP client does
 * (initialize -> notifications/initialized -> tools/list -> resources/list) and
 * asserts the answers plus the one thing stdio clients cannot tolerate: stray
 * non-JSON-RPC bytes on stdout.
 *
 * Usage:
 *   node packages/server/scripts/mcp-stdio-probe.mjs                  # built tree
 *   node packages/server/scripts/mcp-stdio-probe.mjs -- docker run -i --rm mcp/sidebutton
 *
 * Anything after `--` is the command to spawn; it defaults to running this
 * checkout's bin. Exits non-zero with a report on the first failed assertion.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const EXPECTED_TOOL_COUNT = 28;
const PROTOCOL_VERSION = '2025-06-18';
const TIMEOUT_MS = 60_000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const separator = process.argv.indexOf('--');
const argv =
  separator === -1
    ? [process.execPath, path.join(__dirname, '..', 'bin', 'sidebutton.js'), 'serve', '--stdio']
    : process.argv.slice(separator + 1);

// A throwaway HOME keeps the probe honest: the server must come up with no
// pre-existing config, no credentials and no browser.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sidebutton-probe-'));

const child = spawn(argv[0], argv.slice(1), {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, HOME: home, USERPROFILE: home },
});

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
    if (message.jsonrpc !== '2.0') {
      fail(`stdout carried a non-JSON-RPC object: ${line}`);
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
      () => reject(new Error(`${method} timed out after ${TIMEOUT_MS}ms`)),
      TIMEOUT_MS,
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

try {
  console.log(`\n  probing: ${argv.join(' ')}\n`);

  const initialize = await request('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'sidebutton-stdio-probe', version: '1.0.0' },
  });
  check(!initialize.error, 'initialize returns a result');
  check(
    initialize.result?.protocolVersion === PROTOCOL_VERSION,
    `initialize negotiates protocol ${PROTOCOL_VERSION} (got ${initialize.result?.protocolVersion})`,
  );
  check(
    initialize.result?.serverInfo?.name === 'sidebutton',
    `serverInfo.name is "sidebutton" (got ${initialize.result?.serverInfo?.name})`,
  );

  notify('notifications/initialized');

  const tools = await request('tools/list');
  const toolNames = (tools.result?.tools ?? []).map(t => t.name);
  check(
    toolNames.length === EXPECTED_TOOL_COUNT,
    `tools/list returns ${EXPECTED_TOOL_COUNT} tools with no credentials (got ${toolNames.length})`,
  );
  check(
    toolNames.every(name => typeof name === 'string' && name.length > 0),
    'every tool has a name',
  );
  check(
    (tools.result?.tools ?? []).every(t => t.description && t.inputSchema),
    'every tool has a description and an inputSchema',
  );

  const resources = await request('resources/list');
  const skills = (resources.result?.resources ?? []).filter(r => r.uri?.startsWith('skill://'));
  check(!resources.error, 'resources/list returns a result');
  // First-run seeding (defaults/skills/agents) must expose the pack even with
  // a blank HOME: 4 module skills + role playbooks. Floor of 8 so pack content
  // can evolve without breaking the probe.
  check(
    skills.some(r => r.uri === 'skill://agents/_skill.md'),
    "seeded 'agents' pack root skill is exposed as skill://agents/_skill.md",
  );
  check(
    skills.length >= 8,
    `seeded pack yields at least 8 skill:// resources (got ${skills.length})`,
  );

  check(stdout.trim() === '', 'stdout ends with no trailing garbage');
  check(/\[sidebutton\]/.test(stderr), 'diagnostics go to stderr, not stdout');
} catch (err) {
  fail(err.message);
} finally {
  child.stdin.end();
  child.kill('SIGTERM');
  fs.rmSync(home, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n  ${failures.length} check(s) failed\n`);
  if (stderr.trim()) console.error(`  --- server stderr ---\n${stderr}`);
  process.exit(1);
}
console.log('\n  all checks passed\n');
process.exit(0);
