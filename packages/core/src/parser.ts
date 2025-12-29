/**
 * YAML parser for workflow definitions
 */

import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Workflow } from './types.js';
import { WorkflowError } from './types.js';

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
    return data;
  } catch (e) {
    if (e instanceof WorkflowError) throw e;
    throw new WorkflowError(`Failed to parse YAML: ${e}`, 'PARSE_ERROR');
  }
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
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Look for workflow.yaml in subdirectory
      const workflowPath = path.join(entryPath, 'workflow.yaml');
      if (fs.existsSync(workflowPath)) {
        try {
          workflows.push(loadWorkflow(workflowPath));
        } catch (e) {
          console.warn(`Failed to load workflow from ${workflowPath}:`, e);
        }
      }
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
    } else if (step.type === 'control.retry') {
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
    } else if (step.type === 'control.retry') {
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
    } else if (step.type === 'control.retry') {
      if (Array.isArray(step.steps)) {
        count += countStepType(step.steps as typeof steps, typePrefix);
      }
    }
  }
  return count;
}
