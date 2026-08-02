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
 * Role-playbook variant of {@link matchTarget}.
 *
 * Role files come in tiers: an account-wide playbook (`_roles/<slug>.md`, no `match` — the whole point
 * is that it applies everywhere) and per-domain extensions (`<domain>/_roles/<slug>.md`, which the
 * portal scaffolds with `match: [<domain>]`). Injecting every role body unconditionally leaked one
 * product's extension into work on another; honouring `match` scopes it.
 *
 * Scoping only ever EXCLUDES on evidence — a role is dropped only when the run carried the context its
 * patterns are written against and that context said no. Two fail-open rules:
 *   - no patterns          → always inject (the universal tier, and every legacy role file — the
 *                            bundled `agents` playbooks declare `focus`, not `match`)
 *   - unevaluable patterns → always inject. A domain pattern can only be judged against a page URL, and
 *                            an agent's coding run has none (it has a workflow id, but that says nothing
 *                            about which product it is on). Dropping there would strip the domain
 *                            playbook from exactly the fleet runs that lean on it hardest, which is a
 *                            regression, not scoping — the leak this guards against is the *known*
 *                            mismatch: we are on product B and the role is scoped to product A.
 */
export function matchRole(
  patterns: string[],
  requestDomain: string | undefined,
  workflowId: string | undefined,
  categoryDomain: string | undefined,
): boolean {
  if (patterns.length === 0) return true;
  if (matchTarget(patterns, requestDomain, workflowId, categoryDomain)) return true;
  // No match — but was the pattern set even answerable? A domain pattern with no page URL was not.
  if (!requestDomain && patterns.some(isDomainPattern)) return true;
  return false;
}

/**
 * Is `pattern` matched against the page URL hostname? Mirrors {@link matchTarget}'s branch order: the
 * wildcard and `@tag` forms are checked first, then a trailing-`*` workflow prefix (but `*.host` is a
 * domain wildcard, not a prefix), leaving dotted patterns as the domain form.
 */
function isDomainPattern(pattern: string): boolean {
  if (pattern === '*' || pattern.startsWith('@')) return false;
  if (pattern.endsWith('*') && !pattern.startsWith('*.')) return false;
  return pattern.includes('.');
}

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
