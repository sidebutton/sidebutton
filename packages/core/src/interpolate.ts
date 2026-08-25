/**
 * Variable interpolation for workflow execution
 * Replaces {{variable}} syntax with values from context
 */

/**
 * Interpolate variables in a string
 * Supports {{variable}} and {{ variable }} syntax (whitespace-tolerant)
 */
export function interpolate(
  text: string,
  variables: Record<string, string>,
  params: Record<string, string>
): string {
  let result = String(text);

  // Build combined lookup (params override variables)
  const lookup: Record<string, string> = { ...variables, ...params };

  // Single regex pass: match {{ key }} with optional whitespace
  result = result.replace(/\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g, (match, key: string) => {
    if (key in lookup) return String(lookup[key]);
    return match; // leave unmatched placeholders as-is
  });

  return result;
}

/**
 * Return the first `{{…}}` placeholder still present in an already-interpolated string,
 * or undefined if there are none.
 *
 * interpolate() deliberately leaves an unknown placeholder as-is rather than blanking it,
 * which is right for free text but dangerous for a step whose parameter is load-bearing:
 * a literal "{{path}}" becomes a real filename, and a literal "{{redact_css}}" is a
 * non-empty stylesheet that blurs nothing while the step reports success. Steps where the
 * placeholder cannot be a legitimate value use this to fail loudly instead.
 *
 * The pattern is wider than interpolate()'s own `[a-zA-Z_]\w*` key syntax on purpose:
 * `{{item.path}}` is never substitutable, so leaving it in place is still a caller error.
 * `{{_repo:…}}` never survives ExecutionContext.interpolate (it falls back to `~`), so it
 * cannot trip this.
 */
export function findUnresolvedPlaceholder(value: string): string | undefined {
  return value.match(/\{\{[^{}]*\}\}/)?.[0];
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
