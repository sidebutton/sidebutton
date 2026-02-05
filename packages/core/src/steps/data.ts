/**
 * Data manipulation step executors
 * Implements: data.first, data.get, variable.set
 */

import type { Step } from '../types.js';
import type { ExecutionContext } from '../context.js';

type DataFirst = Extract<Step, { type: 'data.first' }>;
type DataGet = Extract<Step, { type: 'data.get' }>;
type VariableSet = Extract<Step, { type: 'variable.set' }>;

export async function executeDataFirst(
  step: DataFirst,
  ctx: ExecutionContext
): Promise<void> {
  const input = ctx.interpolate(step.input);
  const separator = step.separator ?? ', ';

  ctx.emitLog('info', `Picking first from list (separator: '${separator}')`);

  // Split by separator and get first item
  const first = input.split(separator)[0]?.trim() ?? '';

  ctx.lastStepResult = first;
  ctx.variables[step.as] = first;
}

export async function executeDataGet(
  step: DataGet,
  ctx: ExecutionContext
): Promise<void> {
  const input = ctx.interpolate(step.input);
  const separator = step.separator ?? ', ';
  const index = parseInt(ctx.interpolate(step.index), 10);

  const items = input.split(separator);

  if (isNaN(index) || index < 0 || index >= items.length) {
    ctx.emitLog('warn', `data.get index ${index} out of range (${items.length} items)`);
    ctx.lastStepResult = '';
    ctx.variables[step.as] = '';
    return;
  }

  const value = items[index].trim();
  ctx.emitLog('info', `data.get[${index}] → ${value.substring(0, 80)}`);

  ctx.lastStepResult = value;
  ctx.variables[step.as] = value;
}

export async function executeVariableSet(
  step: VariableSet,
  ctx: ExecutionContext
): Promise<void> {
  const value = ctx.interpolate(step.value);

  ctx.emitLog('info', `Setting ${step.name} = ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);

  ctx.lastStepResult = value;
  ctx.variables[step.name] = value;
}
