/**
 * Browser step executors
 * Implements: browser.navigate, browser.click, browser.type, browser.scroll,
 *             browser.extract, browser.extractAll, browser.wait, browser.exists,
 *             browser.hover, browser.key, browser.snapshot
 */

import type { Step } from '../types.js';
import type { ExecutionContext } from '../context.js';
import { WorkflowError } from '../types.js';
import { resolveDelay } from '../delay.js';

type BrowserNavigate = Extract<Step, { type: 'browser.navigate' }>;
type BrowserClick = Extract<Step, { type: 'browser.click' }>;
type BrowserType = Extract<Step, { type: 'browser.type' }>;
type BrowserScroll = Extract<Step, { type: 'browser.scroll' }>;
type BrowserExtract = Extract<Step, { type: 'browser.extract' }>;
type BrowserExtractAll = Extract<Step, { type: 'browser.extractAll' }>;
type BrowserExtractMap = Extract<Step, { type: 'browser.extractMap' }>;
type BrowserWait = Extract<Step, { type: 'browser.wait' }>;
type BrowserExists = Extract<Step, { type: 'browser.exists' }>;
type BrowserHover = Extract<Step, { type: 'browser.hover' }>;
type BrowserKey = Extract<Step, { type: 'browser.key' }>;
type BrowserSnapshot = Extract<Step, { type: 'browser.snapshot' }>;
type BrowserInjectCSS = Extract<Step, { type: 'browser.injectCSS' }>;
type BrowserInjectJS = Extract<Step, { type: 'browser.injectJS' }>;
type BrowserSelectOption = Extract<Step, { type: 'browser.select_option' }>;
type BrowserScrollIntoView = Extract<Step, { type: 'browser.scrollIntoView' }>;
type BrowserFill = Extract<Step, { type: 'browser.fill' }>;

function requireExtension(ctx: ExecutionContext) {
  if (!ctx.extensionClient) {
    throw new WorkflowError('Browser extension not connected', 'EXTENSION_ERROR');
  }
  return ctx.extensionClient;
}

export async function executeBrowserNavigate(
  step: BrowserNavigate,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  let url = ctx.interpolate(step.url);

  // Auto-prepend https:// if no protocol specified
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  ctx.emitLog('info', `Navigating to: ${url}`);
  await ext.navigate(url);
}

export async function executeBrowserClick(
  step: BrowserClick,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  const selector = ctx.interpolate(step.selector);

  ctx.emitLog('info', `Clicking: ${selector}`);
  await ext.click(selector);
}

export async function executeBrowserType(
  step: BrowserType,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  const selector = ctx.interpolate(step.selector);
  const text = ctx.interpolate(step.text);

  ctx.emitLog('info', `Typing into: ${selector}`);
  await ext.typeText(selector, text, false);
}

export async function executeBrowserScroll(
  step: BrowserScroll,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  const direction = step.direction ?? 'down';
  const amount = step.amount ?? 300;

  ctx.emitLog('info', `Scrolling ${direction}`);
  await ext.scroll(direction, amount);
}

export async function executeBrowserExtract(
  step: BrowserExtract,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  const selector = ctx.interpolate(step.selector);

  ctx.emitLog('info', `Extracting from: ${selector}${step.attribute ? ` [${step.attribute}]` : ''}`);
  const text = await ext.extract(selector, step.attribute);

  ctx.lastStepResult = text;
  ctx.variables[step.as] = text;
}

export async function executeBrowserExtractAll(
  step: BrowserExtractAll,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  const selector = ctx.interpolate(step.selector);
  const separator = step.separator ?? ', ';

  ctx.emitLog('info', `Extracting all from: ${selector}${step.attribute ? ` [${step.attribute}]` : ''}`);
  const text = await ext.extractAll(selector, separator, step.attribute);

  ctx.lastStepResult = text;
  ctx.variables[step.as] = text;
}

export async function executeBrowserWait(
  step: BrowserWait,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);

  if (step.selector) {
    const selector = ctx.interpolate(step.selector);
    const timeout = step.timeout ?? 30000;
    ctx.emitLog('info', `Waiting for: ${selector} (timeout: ${timeout}ms)`);
    await ext.waitForElement(selector, timeout);
  } else if (step.ms) {
    const ms = resolveDelay(step.ms);
    ctx.emitLog('info', `Waiting ${ms}ms`);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export async function executeBrowserExists(
  step: BrowserExists,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  const selector = ctx.interpolate(step.selector);
  const timeout = step.timeout ?? 1000;

  ctx.emitLog('info', `Checking existence: ${selector} (timeout: ${timeout}ms)`);

  const exists = await ext.exists(selector, timeout);
  const result = exists ? 'true' : 'false';

  ctx.lastStepResult = result;
  ctx.variables[step.as] = result;
  ctx.emitLog('info', `Element exists: ${result}`);
}

export async function executeBrowserHover(
  step: BrowserHover,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  const selector = ctx.interpolate(step.selector);

  ctx.emitLog('info', `Hovering over: ${selector}`);
  await ext.hover(selector);
}

export async function executeBrowserKey(
  step: BrowserKey,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  const key = ctx.interpolate(step.key);
  const selector = step.selector ? ctx.interpolate(step.selector) : undefined;

  if (selector) {
    ctx.emitLog('info', `Pressing key '${key}' on: ${selector}`);
  } else {
    ctx.emitLog('info', `Pressing key: ${key}`);
  }

  await ext.pressKey(key, selector);
}

export async function executeBrowserSnapshot(
  step: BrowserSnapshot,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  const includeContent = step.includeContent ?? false;

  ctx.emitLog('info', `Capturing accessibility snapshot (includeContent: ${includeContent})`);
  const snapshot = await ext.ariaSnapshot({ includeContent });

  ctx.lastStepResult = snapshot;
  ctx.variables[step.as] = snapshot;
}

export async function executeBrowserInjectCSS(
  step: BrowserInjectCSS,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  const css = ctx.interpolate(step.css);
  const id = step.id ? ctx.interpolate(step.id) : undefined;

  if (!css.trim()) {
    ctx.emitLog('info', `Skipping empty CSS injection${id ? ` (id: ${id})` : ''}`);
    return;
  }

  ctx.emitLog('info', `Injecting CSS${id ? ` (id: ${id})` : ''}`);
  await ext.injectCSS(css, id);
}

export async function executeBrowserInjectJS(
  step: BrowserInjectJS,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  const js = ctx.interpolate(step.js);
  const id = step.id ? ctx.interpolate(step.id) : undefined;

  ctx.emitLog('info', `Injecting JavaScript${id ? ` (id: ${id})` : ''}`);
  const response = await ext.injectJS(js, id);

  if (response.error) {
    ctx.emitLog('warn', `JS execution error: ${response.error}`);
  }

  const raw = response.error ? response.error : (response.result ?? '');
  const resultValue = typeof raw === 'string' ? raw : JSON.stringify(raw);
  ctx.lastStepResult = resultValue;

  if (step.as) {
    ctx.variables[step.as] = resultValue;
  }
}

export async function executeBrowserExtractMap(
  step: BrowserExtractMap,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  const selector = ctx.interpolate(step.selector);
  const separator = step.separator ?? '\n';

  ctx.emitLog('info', `Extracting map from: ${selector}`);
  const text = await ext.extractMap(selector, step.fields, separator);

  ctx.lastStepResult = text;
  ctx.variables[step.as] = text;
}

export async function executeBrowserSelectOption(
  step: BrowserSelectOption,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  const selector = ctx.interpolate(step.selector);
  const value = step.value ? ctx.interpolate(step.value) : undefined;
  const label = step.label ? ctx.interpolate(step.label) : undefined;

  ctx.emitLog('info', `Selecting option in: ${selector} (value=${value}, label=${label})`);
  const selected = await ext.selectOption(selector, undefined, value, label);
  ctx.lastStepResult = selected;
}

export async function executeBrowserScrollIntoView(
  step: BrowserScrollIntoView,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  const selector = ctx.interpolate(step.selector);
  const block = step.block ?? 'center';

  ctx.emitLog('info', `Scrolling into view: ${selector} (block: ${block})`);
  await ext.scrollIntoView(selector, block);
}

export async function executeBrowserFill(
  step: BrowserFill,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  const selector = ctx.interpolate(step.selector);
  const value = ctx.interpolate(step.value);

  ctx.emitLog('info', `Filling input: ${selector}`);
  await ext.fill(selector, value);
}
