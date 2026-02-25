/**
 * Utilities for determining the source of context items (roles, targets).
 *
 * Convention: filenames from skill packs use the prefix "skill:<domain>/..."
 * e.g. "skill:example.com/se.md" or "skill:example.com/tasks/qa.md"
 */

import type { ContextSource } from './types.js';

const SKILL_PREFIX = 'skill:';

/**
 * Parse a context filename to determine its source.
 * Returns { type: 'skill', domain } for skill pack items,
 * or { type: 'user' } for user-created items.
 */
export function getContextSource(filename: string): ContextSource {
  if (filename.startsWith(SKILL_PREFIX)) {
    const rest = filename.slice(SKILL_PREFIX.length);
    const slashIndex = rest.indexOf('/');
    const domain = slashIndex > 0 ? rest.slice(0, slashIndex) : rest;
    return { type: 'skill', domain };
  }
  return { type: 'user' };
}

/**
 * Shorthand: returns the skill domain from a filename, or undefined for user items.
 */
export function getSkillDomain(filename: string): string | undefined {
  const source = getContextSource(filename);
  return source.domain;
}
