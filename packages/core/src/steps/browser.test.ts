/**
 * browser.screenshot step tests (SCRUM-2045).
 *
 * The step writes a PNG to the agent machine so a docs screenshot can be produced without
 * image bytes entering the model's context. What is worth guarding here is everything around
 * the capture: path containment, interpolation, retry-safety, and keeping base64 out of the
 * run log.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { executeStep } from './index.js';
import { ExecutionContext } from '../context.js';
import type { ExtensionClient } from '../context.js';
import { WorkflowError } from '../types.js';
import type { Step } from '../types.js';

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_BYTES = Buffer.from(PNG_B64, 'base64');

let fakeHome: string;
let realHome: string | undefined;

beforeEach(() => {
  realHome = process.env.HOME;
  fakeHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sb-core-shot-')));
  process.env.HOME = fakeHome;
});

afterEach(() => {
  if (realHome === undefined) delete process.env.HOME;
  else process.env.HOME = realHome;
  fs.rmSync(fakeHome, { recursive: true, force: true });
});

type ShotCall = { ref?: number; selector?: string; region?: unknown };

function makeCtx(opts: { image?: string; calls?: ShotCall[] } = {}): ExecutionContext {
  const ctx = new ExecutionContext('run-1');
  ctx.extensionClient = {
    screenshot: async (o?: ShotCall) => {
      opts.calls?.push(o ?? {});
      return opts.image ?? PNG_B64;
    },
  } as unknown as ExtensionClient;
  return ctx;
}

const shot = (s: Partial<Extract<Step, { type: 'browser.screenshot' }>> & { path: string }): Step =>
  ({ type: 'browser.screenshot', ...s }) as Step;

describe('browser.screenshot', () => {
  it('writes the decoded PNG to the given path', async () => {
    const ctx = makeCtx();
    const out = path.join(fakeHome, 'shots', 'a.png');

    await executeStep(shot({ path: out, selector: '#app' }), ctx);

    expect(fs.readFileSync(out)).toEqual(PNG_BYTES);
    expect(fs.statSync(out).mode & 0o777).toBe(0o600);
  });

  it('records the path — never the base64 — as the step result', async () => {
    const ctx = makeCtx();
    const out = path.join(fakeHome, 'b.png');

    await executeStep(shot({ path: out, as: 'shot' }), ctx);

    expect(ctx.lastStepResult).toBe(out);
    expect(ctx.variables.shot).toBe(out);
    expect(ctx.lastStepResult).not.toContain('iVBOR');
  });

  it('interpolates path and selector from params', async () => {
    const calls: ShotCall[] = [];
    const ctx = makeCtx({ calls });
    ctx.params.crop = '#main';
    ctx.params.shot_path = path.join(fakeHome, 'interp.png');

    await executeStep(shot({ path: '{{shot_path}}', selector: '{{crop}}' }), ctx);

    expect(calls[0].selector).toBe('#main');
    expect(fs.existsSync(path.join(fakeHome, 'interp.png'))).toBe(true);
  });

  it('treats an empty selector as no crop rather than a bad CSS selector', async () => {
    const calls: ShotCall[] = [];
    const ctx = makeCtx({ calls });
    ctx.params.crop = '';

    await executeStep(shot({ path: path.join(fakeHome, 'full.png'), selector: '{{crop}}' }), ctx);

    expect(calls[0].selector).toBeUndefined();
  });

  it('fails loudly when a param was never passed, instead of using the literal placeholder', async () => {
    const ctx = makeCtx();

    // interpolate() leaves unknown placeholders as-is, so without this guard the step would
    // create a directory literally named "{{shot_path}}".
    await expect(executeStep(shot({ path: '{{shot_path}}' }), ctx)).rejects.toThrow(/was not provided/);
    expect(fs.readdirSync(fakeHome)).toEqual([]);
  });

  it('strips a data-URL prefix so the file is a decodable PNG', async () => {
    const ctx = makeCtx({ image: `data:image/png;base64,${PNG_B64}` });
    const out = path.join(fakeHome, 'prefixed.png');

    await executeStep(shot({ path: out }), ctx);

    expect(fs.readFileSync(out).subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('overwrites in place, so the executor auto-retry cannot leave a trail of files', async () => {
    const ctx = makeCtx();
    const out = path.join(fakeHome, 'shots', 'retry.png');

    await executeStep(shot({ path: out }), ctx);
    await executeStep(shot({ path: out }), ctx);

    expect(fs.readdirSync(path.join(fakeHome, 'shots'))).toEqual(['retry.png']);
  });

  it('refuses a path outside the home directory', async () => {
    const ctx = makeCtx();
    const outside = path.join(os.tmpdir(), `sb-core-escape-${process.pid}.png`);

    await expect(executeStep(shot({ path: outside }), ctx)).rejects.toThrow(/outside the home directory/i);
    expect(fs.existsSync(outside)).toBe(false);
  });

  it('refuses to inject an unresolved placeholder as CSS, so a capture is never silently unredacted', async () => {
    const injected: string[] = [];
    const ctx = makeCtx();
    (ctx.extensionClient as unknown as { injectCSS: (css: string) => Promise<void> }).injectCSS =
      async (css: string) => { injected.push(css); };

    // A literal "{{redact_css}}" is non-empty, so the empty-CSS skip does not catch it: the
    // step would style nothing, report success, and let the next screenshot capture the page
    // unredacted — the one failure this recipe exists to prevent.
    await expect(
      executeStep({ type: 'browser.injectCSS', css: '{{redact_css}}', id: 'sb-redact' } as Step, ctx)
    ).rejects.toThrow(/was not provided/);
    expect(injected).toEqual([]);

    // An explicit empty string still means "no redaction" and stays a no-op.
    ctx.params.redact_css = '';
    await executeStep({ type: 'browser.injectCSS', css: '{{redact_css}}' } as Step, ctx);
    expect(injected).toEqual([]);
  });

  it('surfaces EXTENSION_ERROR when no browser is connected', async () => {
    const ctx = new ExecutionContext('run-1');

    const err = await executeStep(shot({ path: path.join(fakeHome, 'x.png') }), ctx).catch((e) => e);

    expect(err).toBeInstanceOf(WorkflowError);
    expect((err as WorkflowError).code).toBe('EXTENSION_ERROR');
  });

  it('rejects a step with no path instead of writing a file named "undefined"', async () => {
    const ctx = makeCtx();

    // parseWorkflow validates step types, not required fields, and interpolate() stringifies
    // undefined — so without this guard the PNG lands at ~/workspace/undefined and the run
    // reports success.
    const err = await executeStep({ type: 'browser.screenshot' } as Step, ctx).catch((e) => e);

    expect(err).toBeInstanceOf(WorkflowError);
    expect((err as WorkflowError).code).toBe('PATH_ERROR');
    expect(fs.existsSync(path.join(fakeHome, 'workspace', 'undefined'))).toBe(false);
  });

  it('tightens the mode to 0600 when overwriting a looser existing file', async () => {
    const ctx = makeCtx();
    const out = path.join(fakeHome, 'preexisting.png');
    fs.writeFileSync(out, 'stale', { mode: 0o644 });

    await executeStep(shot({ path: out }), ctx);

    expect(fs.statSync(out).mode & 0o777).toBe(0o600);
  });

  it('creates no directories outside home when the escape is through a symlink', async () => {
    const ctx = makeCtx();
    const outsideDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sb-core-mk-')));
    fs.symlinkSync(outsideDir, path.join(fakeHome, 'link'));

    await expect(
      executeStep(shot({ path: path.join(fakeHome, 'link', 'a', 'b.png') }), ctx)
    ).rejects.toThrow(/outside the home directory/i);
    expect(fs.readdirSync(outsideDir)).toEqual([]);

    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it('rejects empty image data rather than writing a 0-byte PNG', async () => {
    const ctx = makeCtx({ image: '' });
    const out = path.join(fakeHome, 'empty.png');

    await expect(executeStep(shot({ path: out }), ctx)).rejects.toThrow(/empty/i);
    expect(fs.existsSync(out)).toBe(false);
  });
});
