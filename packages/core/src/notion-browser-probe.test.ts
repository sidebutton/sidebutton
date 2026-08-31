/**
 * The four lane gates of `workflows/notion_browser_probe_subscription_ui.yaml` (SCRUM-2022 / N11).
 *
 * This is the first test in the repo to read the top-level `workflows/` directory, and the reach out
 * of the package is deliberate: the gates are the whole safety argument for a browser lane that
 * touches a production Notion workspace, and until now they were prose in a doc with nothing holding
 * them to the YAML that actually ships. Everything below is read out of the parsed file rather than
 * restated here, so a condition or a stop message that drifts fails the test instead of quietly
 * changing what the lane does.
 *
 * The gate order matters and is asserted as behaviour, not as line numbers: the cheap portal read
 * runs first, and a connection that is already verified must stop the run BEFORE the browser is ever
 * pointed at Notion — a blind re-run creates a second subscription signed with a verification token
 * we never stored, and every later delivery 401s behind a portal that still reads green.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseWorkflow } from './parser.js';
import { interpolate, evaluateCondition } from './interpolate.js';
import type { Step, Workflow } from './types.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workflowPath = path.join(repoRoot, 'workflows/notion_browser_probe_subscription_ui.yaml');

/**
 * The subject lives at the REPO ROOT, outside this package — and that reach is why both preconditions
 * below are checked rather than assumed.
 *
 * `sync-oss.sh` rsyncs `packages/` wholesale into the public sidebutton/sidebutton repo but copies
 * `workflows/` from a four-entry allowlist, so in that checkout this test file exists and its subject
 * does not. Reading at module scope would then throw ENOENT during collection and take down all of
 * `packages/core`'s suite with an error naming an internal ops workflow. Skip loudly instead.
 */
const hasWorkflow = fs.existsSync(workflowPath);

/**
 * The reader-mapping test runs the shipped pipeline for real, which means `jq` — a binary this package
 * declares nowhere. Without it the pipeline's own `|| echo error` fallback answers "error" for every
 * input, so the healthy cases fail as `expected 'error' to be 'false'`: a message that sends the reader
 * to the YAML's jq filter instead of to the missing tool. Skip rather than lie about which is broken.
 */
const hasJq = (() => {
  try {
    execFileSync('sh', ['-c', 'command -v jq'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const source = hasWorkflow ? fs.readFileSync(workflowPath, 'utf8') : '';

/**
 * Replay the workflow the way the executor would, but with the two captured variables supplied
 * instead of run for real: `control.if` interpolates then evaluates through the SAME functions the
 * engine uses (a re-implementation here would pass while the engine failed), a `control.stop` ends
 * the run, and every other step is recorded so the test can assert what the lane touched before it
 * stopped. That is the assertion that matters for gate 2 — not the message, but that no `browser.*`
 * step ran ahead of it.
 */
function replay(steps: Step[], variables: Record<string, string>): { reached: string[]; stopped?: string } {
  const reached: string[] = [];
  const walk = (items: Step[]): string | undefined => {
    for (const step of items) {
      if (step.type === 'control.stop') return step.message ?? '';
      if (step.type === 'control.if') {
        // BOTH arms. `executeControlIf` runs `else_steps` when the condition is false, so a walk that
        // only followed `then` would report an `else:`-nested browser step as never reached — and the
        // "no browser.* step ran" assertions below, which are the entire safety argument of this file,
        // would pass on exactly the edit they exist to block.
        const taken = evaluateCondition(interpolate(step.condition, variables, {}))
          ? step.then
          : step.else_steps;
        if (taken) {
          const stopped = walk(taken);
          if (stopped !== undefined) return stopped;
        }
        continue;
      }
      reached.push(step.type);
      // control.retry / control.foreach carry a `steps` body the engine executes too (the parser walks
      // all three containers). Descend into any of them for the same reason as above; a browser step
      // wrapped in a `control.retry` — the natural response to a flaky Notion load — must not become
      // invisible to these assertions.
      const nested = (step as { steps?: Step[] }).steps;
      if (Array.isArray(nested)) {
        const stopped = walk(nested);
        if (stopped !== undefined) return stopped;
      }
    }
    return undefined;
  };
  return { reached, stopped: walk(steps) };
}

/** The `as:` name the portal read binds, resolved from the file so a rename cannot desync the test. */
const readerStep = (wf: Workflow) =>
  wf.steps.find((s): s is Extract<Step, { type: 'shell.run' }> => s.type === 'shell.run');

describe.skipIf(!hasWorkflow)('notion_browser_probe_subscription_ui gates (SCRUM-2022 / N11)', () => {
  // skipIf marks the tests, but this factory still RUNS during collection — so in a checkout
  // without the workflow the parse must not touch the empty placeholder, or collection throws the
  // very error the skip exists to prevent. Every test below is skipped there, so the undefined is
  // never dereferenced.
  const workflow = hasWorkflow ? parseWorkflow(source) : (undefined as unknown as Workflow);

  it('parses through the shipped parser — every step type is one the engine implements', () => {
    // `parseWorkflow` walks nested control bodies too, so this also lints the steps inside each
    // gate's `then:`. An unimplemented type here would otherwise only surface mid-run, on the VM,
    // after the browser had already been pointed at Notion.
    expect(workflow.id).toBe('notion_browser_probe_subscription_ui');
    expect(workflow.steps.length).toBeGreaterThan(0);
  });

  it('gate: an unreadable portal response stops the lane and never opens the browser', () => {
    const { reached, stopped } = replay(workflow.steps, { already_verified: 'error', login_wall: 'false' });
    expect(stopped).toContain('BLOCKED');
    expect(stopped).toContain('PORTAL_COOKIE');
    expect(reached.filter((t) => t.startsWith('browser.'))).toEqual([]);
  });

  it('gate: an already-verified connection is a no-op that stops BEFORE any browser step', () => {
    const { reached, stopped } = replay(workflow.steps, { already_verified: 'true', login_wall: 'false' });
    expect(stopped).toContain('NO-OP');
    // The expensive mistake this gate exists to prevent: a second subscription. Nothing may be
    // navigated, clicked or typed once we know the connection is already verified.
    expect(reached.filter((t) => t.startsWith('browser.'))).toEqual([]);
  });

  it('the login-wall detector fails closed: explicit timeout, and past the first sign-in screen', () => {
    // `browser.exists` answers 'false' for "absent" AND for "errored / timed out" alike, and defaults
    // to a 1000 ms timeout — so with a bare default a login page that has not painted yet reads as a
    // live session and the lane snapshots the wall and reports PROBE OK. That is the "never a silent
    // failure" acceptance criterion inverted, so both halves of the fix are pinned here.
    const detector = workflow.steps.find(
      (s): s is Extract<Step, { type: 'browser.exists' }> => s.type === 'browser.exists',
    );
    expect(detector).toBeDefined();
    expect(detector!.timeout ?? 1000).toBeGreaterThanOrEqual(10000);
    // Notion's sign-in is multi-step: only the FIRST screen carries an email field. An emailed-code
    // step renders a one-time-code box and an enterprise SSO hop renders username/password, and an
    // email-only selector reports both as signed in.
    expect(detector!.selector).toContain("input[type='password']");
    expect(detector!.selector).toContain("input[autocomplete='one-time-code']");
  });

  it('gate: a login wall stops with a named blocker and does not attempt to authenticate', () => {
    const { reached, stopped } = replay(workflow.steps, { already_verified: 'false', login_wall: 'true' });
    expect(stopped).toContain('BLOCKED');
    expect(stopped).toMatch(/signed out|login wall/i);
    // S4a: stop and notify. The lane may look (navigate/wait/exists) but must not type or click,
    // and must not snapshot — a snapshot of a login form is not evidence worth an artifact.
    expect(reached).not.toContain('browser.type');
    expect(reached).not.toContain('browser.click');
    expect(reached).not.toContain('browser.snapshot');
  });

  it('gate: signed in and unverified is the one branch that proceeds to the snapshot', () => {
    const { reached, stopped } = replay(workflow.steps, { already_verified: 'false', login_wall: 'false' });
    expect(reached).toContain('browser.navigate');
    expect(reached).toContain('browser.snapshot');
    expect(stopped).toContain('PROBE OK');
  });

  it('reads `verified` off the envelope — `.verified // "error"` would misread the healthy case', () => {
    // The regression this file was written for. jq's `//` yields its right side for `false` exactly
    // as it does for absent, so `.verified // "error"` collapses "signed in, not yet verified" — the
    // ONLY state the probe is useful in — onto the same string as an auth failure, and the lane
    // stops as BLOCKED before it can reach the browser at all.
    const cmd = readerStep(workflow)?.cmd ?? '';
    expect(cmd).toContain('/api/settings/notion/webhook-token');
    expect(cmd).not.toMatch(/\.verified\s*\/\//);
    expect(cmd).toContain('.success == true');
    // The cookie is a shell variable, never a workflow param: shell.run logs `Running: <cmd>`
    // verbatim, so an interpolated cookie would be written into every run log.
    expect(cmd).toContain('"$PORTAL_COOKIE"');
    expect(cmd).not.toMatch(/\{\{\s*\w*cookie/i);
  });

  it('replay() descends into every container the engine executes', () => {
    // The assertions above are only worth what this walk is worth: if `replay` ignored a container the
    // engine runs, every "no browser.* step ran" check would pass vacuously. Pin the walk itself
    // against each container shape instead of trusting it by inspection.
    const browserStep = { type: 'browser.click', selector: '#x' };
    const shapes: Array<[string, unknown]> = [
      ['control.if else_steps', { type: 'control.if', condition: "{{flag}} == 'yes'", then: [], else_steps: [browserStep] }],
      ['control.retry steps', { type: 'control.retry', steps: [browserStep] }],
      ['control.foreach steps', { type: 'control.foreach', items: 'a,b', as: 'i', steps: [browserStep] }],
    ];
    for (const [label, container] of shapes) {
      const { reached } = replay([container] as Step[], { flag: 'no' });
      expect(reached, `replay() is blind to ${label}`).toContain('browser.click');
    }
    // …and a stop nested in one of them still ends the run.
    const nestedStop = { type: 'control.retry', steps: [{ type: 'control.stop', message: 'INNER' }] };
    expect(replay([nestedStop] as Step[], {}).stopped).toBe('INNER');
  });

  it.skipIf(!hasJq)('the reader maps every portal response onto exactly one of true / false / error', () => {
    // Runs the real command, minus curl: whatever the portal answers arrives on stdin. The mapping
    // is what the string comparisons in the gates above are built on, so it is pinned against the
    // shapes the route can actually produce rather than only the happy one.
    const reader = (readerStep(workflow)?.cmd ?? '').replace(/curl[^|]*\|/, 'cat |');
    const run = (body: string) =>
      execFileSync('sh', ['-c', reader], { input: body, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();

    expect(run('{"success":true,"verified":false}')).toBe('false'); // healthy: proceed to the browser
    expect(run('{"success":true,"verified":true}')).toBe('true'); // already done: no-op
    expect(run('{"error":"Forbidden"}')).toBe('error'); // publisher, not admin
    expect(run('{"error":"Unauthorized"}')).toBe('error'); // no portal session
    expect(run('')).toBe('error'); // curl could not reach the portal
    expect(run('<html>login</html>')).toBe('error'); // an auth redirect, not JSON
    expect(run('{"success":true}')).toBe('error'); // fail closed on a shape we do not recognise
  });
});
