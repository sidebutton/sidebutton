/**
 * Shared target-matching logic for context injection.
 *
 * Targets specify match patterns in their YAML frontmatter.  A pattern can be:
 *   - Domain:          "atlassian.net", "github.com"   → matched against the page URL hostname
 *   - Workflow prefix: "jira_*", "ops_*", "sb_ops_*"   → matched against the running workflow ID
 *   - Tag:            "@ops", "@engineering"            → matched against workflow category.domain
 *   - Wildcard:       "*"                               → always matches
 */

/**
 * Returns true when at least one pattern in `patterns` matches the current
 * request context (domain, workflowId, or category domain).
 */
export function matchTarget(
  patterns: string[],
  requestDomain: string | undefined,
  workflowId: string | undefined,
  categoryDomain: string | undefined,
): boolean {
  for (const pattern of patterns) {
    // Wildcard — always matches
    if (pattern === '*') return true;

    // Tag — matches workflow category.domain (e.g. "@ops" → "ops")
    if (pattern.startsWith('@')) {
      if (categoryDomain && categoryDomain === pattern.slice(1)) return true;
      continue;
    }

    // Workflow prefix — contains a trailing wildcard (e.g. "jira_*", "sb_ops_*")
    if (pattern.endsWith('*') && !pattern.startsWith('*.')) {
      const prefix = pattern.slice(0, -1); // strip the trailing *
      if (workflowId && workflowId.startsWith(prefix)) return true;
      continue;
    }

    // Domain — anything containing a dot (e.g. "atlassian.net", "*.github.com")
    if (pattern.includes('.') && requestDomain) {
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(2);
        if (requestDomain === suffix || requestDomain.endsWith('.' + suffix)) return true;
      } else {
        if (requestDomain === pattern || requestDomain.endsWith('.' + pattern)) return true;
      }
      continue;
    }
  }

  return false;
}
