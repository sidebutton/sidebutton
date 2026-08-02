import { describe, it, expect } from 'vitest';
import { matchRole, matchTarget } from './matching.js';

// Role playbooks are tiered: an account-wide `_roles/<slug>.md` (no `match` — it applies everywhere)
// and per-domain extensions `<domain>/_roles/<slug>.md` (scaffolded with `match: [<domain>]`). Context
// injection used to push EVERY enabled role body regardless of `match`, so one product's extension
// leaked into work on another. matchRole scopes them without stripping context from runs that have
// nothing to match on.

describe('matchRole', () => {
  it('always injects a role with no patterns (the universal tier + every legacy role file)', () => {
    // The bundled `agents` playbooks declare `focus`/`tags`, never `match` → normalizeMatch gives [].
    expect(matchRole([], 'app.example.com', 'agent_se_work', 'engineering')).toBe(true);
    expect(matchRole([], undefined, undefined, undefined)).toBe(true);
  });

  it('injects a domain extension only on its own domain', () => {
    expect(matchRole(['shop.test'], 'shop.test', undefined, undefined)).toBe(true);
    expect(matchRole(['shop.test'], 'admin.shop.test', undefined, undefined)).toBe(true); // subdomain
    expect(matchRole(['shop.test'], 'other.test', undefined, undefined)).toBe(false);
  });

  it('fails OPEN when a domain pattern cannot be judged — with or without a workflow id', () => {
    // A domain pattern is answerable only against a page URL. An agent's coding run has none; it does
    // carry a workflow id, but that says nothing about which product it is on — so excluding on it
    // would strip the domain playbook from the fleet runs that lean on it hardest.
    expect(matchRole(['shop.test'], undefined, undefined, undefined)).toBe(true);
    expect(matchRole(['shop.test'], undefined, 'agent_se_work', 'engineering')).toBe(true);
    // The leak this guards against is the KNOWN mismatch: we are on product B, the role is product A's.
    expect(matchRole(['shop.test'], 'other.test', 'agent_se_work', 'engineering')).toBe(false);
  });

  it('still excludes a non-domain pattern that the run CAN answer', () => {
    // `@tag` and `workflow_*` are judged against context the run always carries, so a miss is evidence.
    expect(matchRole(['@ops'], undefined, 'agent_se_work', 'engineering')).toBe(false);
    expect(matchRole(['jira_*'], undefined, 'agent_se_work', undefined)).toBe(false);
    // A mixed set keeps the domain half's benefit of the doubt while the URL is unknown.
    expect(matchRole(['@ops', 'shop.test'], undefined, 'agent_se_work', 'engineering')).toBe(true);
  });

  it('honours the same pattern vocabulary as targets', () => {
    for (const [patterns, domain, wf, cat] of [
      [['*'], 'other.test', undefined, undefined],
      [['@ops'], undefined, undefined, 'ops'],
      [['jira_*'], undefined, 'jira_sync', undefined],
    ] as const) {
      expect(matchRole([...patterns], domain, wf, cat)).toBe(
        matchTarget([...patterns], domain, wf, cat),
      );
    }
  });
});
