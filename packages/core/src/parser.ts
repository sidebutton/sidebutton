/**
 * YAML parser for workflow definitions
 */

import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Workflow } from './types.js';
import { WorkflowError } from './types.js';
import { getAllStepTypes, UNIMPLEMENTED_STEP_TYPES } from './steps/index.js';

/**
 * Parse a workflow from YAML string
 */
export function parseWorkflow(content: string): Workflow {
  try {
    const data = yaml.load(content) as Workflow;
    if (!data || typeof data !== 'object') {
      throw new WorkflowError('Invalid workflow: not an object', 'PARSE_ERROR');
    }
    if (!data.id || typeof data.id !== 'string') {
      throw new WorkflowError('Invalid workflow: missing id', 'PARSE_ERROR');
    }
    if (!data.title || typeof data.title !== 'string') {
      throw new WorkflowError('Invalid workflow: missing title', 'PARSE_ERROR');
    }
    if (!Array.isArray(data.steps)) {
      throw new WorkflowError('Invalid workflow: steps must be an array', 'PARSE_ERROR');
    }
    validateStepTypes(data.steps as unknown[], 'steps');
    return data;
  } catch (e) {
    if (e instanceof WorkflowError) throw e;
    throw new WorkflowError(`Failed to parse YAML: ${e}`, 'PARSE_ERROR');
  }
}

/**
 * Recursively assert every step (including nested control bodies) uses a step type the engine
 * actually implements. Rejecting at parse/registration time — rather than letting the run reach an
 * unimplemented step and throw mid-run — is the "fail fast" half of SCRUM-1189. Types that are part
 * of the DSL conceptually but unwired in this build (see UNIMPLEMENTED_STEP_TYPES) get a clear
 * "not supported in this build" reason; anything else is reported as an unknown step type.
 */
function validateStepTypes(steps: unknown[], path: string): void {
  const supported = new Set(getAllStepTypes());

  const walk = (items: unknown[], at: string): void => {
    items.forEach((raw, i) => {
      const here = `${at}[${i}]`;
      if (!raw || typeof raw !== 'object') {
        throw new WorkflowError(`Invalid workflow: ${here} is not a step object`, 'PARSE_ERROR');
      }
      const step = raw as { type?: unknown; then?: unknown; else_steps?: unknown; steps?: unknown };
      if (typeof step.type !== 'string') {
        throw new WorkflowError(`Invalid workflow: ${here} is missing a string "type"`, 'PARSE_ERROR');
      }
      if (!supported.has(step.type)) {
        const reason = UNIMPLEMENTED_STEP_TYPES[step.type];
        throw new WorkflowError(
          reason
            ? `Unsupported step type "${step.type}" at ${here}: ${reason}`
            : `Unknown step type "${step.type}" at ${here}`,
          'PARSE_ERROR',
        );
      }
      // Recurse into nested step blocks (control.if / control.retry / control.foreach)
      if (step.type === 'control.if') {
        if (Array.isArray(step.then)) walk(step.then, `${here}.then`);
        if (Array.isArray(step.else_steps)) walk(step.else_steps, `${here}.else_steps`);
      } else if (step.type === 'control.retry' || step.type === 'control.foreach') {
        if (Array.isArray(step.steps)) walk(step.steps, `${here}.steps`);
      }
    });
  };

  walk(steps, path);
}

/**
 * Load a workflow from a YAML file
 */
export function loadWorkflow(filePath: string): Workflow {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseWorkflow(content);
  } catch (e) {
    if (e instanceof WorkflowError) throw e;
    throw new WorkflowError(`Failed to load workflow from ${filePath}: ${e}`, 'PARSE_ERROR');
  }
}

/**
 * Load all workflows from a directory
 * Supports both standalone YAML files and workflow.yaml in subdirectories
 */
export function loadWorkflowsFromDir(dir: string): Workflow[] {
  const workflows: Workflow[] = [];

  if (!fs.existsSync(dir)) {
    return workflows;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recursively load workflows from subdirectories
      workflows.push(...loadWorkflowsFromDir(entryPath));
    } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
      // Load standalone YAML files
      try {
        workflows.push(loadWorkflow(entryPath));
      } catch (e) {
        console.warn(`Failed to load workflow from ${entryPath}:`, e);
      }
    }
  }

  return workflows;
}

/**
 * Get step type name from step object
 */
export function getStepTypeName(step: { type: string }): string {
  return step.type;
}

/**
 * Count total steps including nested ones
 */
export function countSteps(steps: { type: string; then?: unknown[]; else_steps?: unknown[]; steps?: unknown[] }[]): number {
  let count = 0;
  for (const step of steps) {
    count += 1;
    if (step.type === 'control.if') {
      if (Array.isArray(step.then)) {
        count += countSteps(step.then as typeof steps);
      }
      if (Array.isArray(step.else_steps)) {
        count += countSteps(step.else_steps as typeof steps);
      }
    } else if (step.type === 'control.retry' || step.type === 'control.foreach') {
      if (Array.isArray(step.steps)) {
        count += countSteps(step.steps as typeof steps);
      }
    }
  }
  return count;
}

/**
 * Check if any step matches a type prefix
 */
export function hasStepType(steps: { type: string; then?: unknown[]; else_steps?: unknown[]; steps?: unknown[] }[], typePrefix: string): boolean {
  for (const step of steps) {
    if (step.type.startsWith(typePrefix)) {
      return true;
    }
    if (step.type === 'control.if') {
      if (Array.isArray(step.then) && hasStepType(step.then as typeof steps, typePrefix)) {
        return true;
      }
      if (Array.isArray(step.else_steps) && hasStepType(step.else_steps as typeof steps, typePrefix)) {
        return true;
      }
    } else if (step.type === 'control.retry' || step.type === 'control.foreach') {
      if (Array.isArray(step.steps) && hasStepType(step.steps as typeof steps, typePrefix)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Count steps matching a type prefix
 */
export function countStepType(steps: { type: string; then?: unknown[]; else_steps?: unknown[]; steps?: unknown[] }[], typePrefix: string): number {
  let count = 0;
  for (const step of steps) {
    if (step.type.startsWith(typePrefix)) {
      count += 1;
    }
    if (step.type === 'control.if') {
      if (Array.isArray(step.then)) {
        count += countStepType(step.then as typeof steps, typePrefix);
      }
      if (Array.isArray(step.else_steps)) {
        count += countStepType(step.else_steps as typeof steps, typePrefix);
      }
    } else if (step.type === 'control.retry' || step.type === 'control.foreach') {
      if (Array.isArray(step.steps)) {
        count += countStepType(step.steps as typeof steps, typePrefix);
      }
    }
  }
  return count;
}
