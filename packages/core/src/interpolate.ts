/**
 * Variable interpolation for workflow execution
 * Replaces {{variable}} syntax with values from context
 */

/**
 * Interpolate variables in a string
 * Supports {{variable}} syntax for both variables and params
 */
export function interpolate(
  text: string,
  variables: Record<string, string>,
  params: Record<string, string>
): string {
  let result = text;

  // Replace variables
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  // Replace params
  for (const [key, value] of Object.entries(params)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  return result;
}

/**
 * Truncate text for display, adding ellipsis if too long
 */
export function truncateForDisplay(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen)}...`;
}

/**
 * Evaluate a condition string for control.if
 * Supports:
 * - Comparison: "value == 'literal'" or "value != 'literal'"
 * - Truthy check: non-empty string that's not "false" or "0"
 */
export function evaluateCondition(condition: string): boolean {
  const trimmed = condition.trim();

  // Check for equality comparison: value == 'literal' or value == "literal"
  const eqPos = trimmed.indexOf('==');
  if (eqPos !== -1) {
    const left = trimmed.slice(0, eqPos).trim();
    const right = stripQuotes(trimmed.slice(eqPos + 2).trim());
    return left === right;
  }

  // Check for inequality comparison: value != 'literal' or value != "literal"
  const neqPos = trimmed.indexOf('!=');
  if (neqPos !== -1) {
    const left = trimmed.slice(0, neqPos).trim();
    const right = stripQuotes(trimmed.slice(neqPos + 2).trim());
    return left !== right;
  }

  // Fallback: simple truthy check
  return trimmed !== '' && trimmed !== 'false' && trimmed !== '0';
}

/**
 * Strip surrounding quotes from a string
 */
function stripQuotes(s: string): string {
  const trimmed = s.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
