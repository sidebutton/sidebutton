/**
 * Browser step executors
 * Implements: browser.navigate, browser.click, browser.type, browser.scroll,
 *             browser.extract, browser.extractAll, browser.wait, browser.exists,
 *             browser.hover, browser.key
 */

import type { Step } from '../types.js';
import type { ExecutionContext } from '../context.js';
import { WorkflowError } from '../types.js';
import { truncateForDisplay } from '../interpolate.js';

type BrowserNavigate = Extract<Step, { type: 'browser.navigate' }>;
type BrowserClick = Extract<Step, { type: 'browser.click' }>;
type BrowserType = Extract<Step, { type: 'browser.type' }>;
type BrowserScroll = Extract<Step, { type: 'browser.scroll' }>;
type BrowserExtract = Extract<Step, { type: 'browser.extract' }>;
type BrowserExtractAll = Extract<Step, { type: 'browser.extractAll' }>;
type BrowserWait = Extract<Step, { type: 'browser.wait' }>;
type BrowserExists = Extract<Step, { type: 'browser.exists' }>;
type BrowserHover = Extract<Step, { type: 'browser.hover' }>;
type BrowserKey = Extract<Step, { type: 'browser.key' }>;

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

  ctx.emitLog('info', `Extracting from: ${selector}`);
  const text = await ext.extract(selector);

  // Store result for display
  ctx.lastStepResult = truncateForDisplay(text, 500);
  ctx.variables[step.as] = text;
}

export async function executeBrowserExtractAll(
  step: BrowserExtractAll,
  ctx: ExecutionContext
): Promise<void> {
  const ext = requireExtension(ctx);
  const selector = ctx.interpolate(step.selector);
  const separator = step.separator ?? ', ';

  ctx.emitLog('info', `Extracting all from: ${selector}`);
  const text = await ext.extractAll(selector, separator);

  ctx.lastStepResult = truncateForDisplay(text, 500);
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
    ctx.emitLog('info', `Waiting ${step.ms}ms`);
    await new Promise((resolve) => setTimeout(resolve, step.ms));
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
