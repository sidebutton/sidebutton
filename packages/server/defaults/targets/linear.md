---
name: Linear
match:
  - linear.app
  - LINEAR_*
  - "@ops"
---

## Tickets
- Always include: title, description, acceptance criteria
- Use past tense in bug descriptions ("Button failed to load" not "Button fails to load")
- Link to source context (Slack thread, page URL) when creating from external input
- Set the right team and assignee — don't leave issues unassigned

## Keys, teams & states
- Issue keys are `TEAM-123` (e.g. `ENG-42`); the team key (`ENG`) is the routing key for a workspace
- Workflow **states are team-scoped** — use the state names that exist in the issue's team
  (e.g. "Backlog", "Todo", "In Progress", "In Review", "Done", "Canceled")
- There are **no issue types** — use **labels** ("Bug", "Story") for categorization

## Priority
- Urgent: Production outage or data loss
- High: Broken feature affecting users
- Medium: Enhancement or improvement
- Low: Cosmetic or nice-to-have

## Conventions
- Comments and descriptions are **Markdown** (no rich-JSON) — keep them concise
- Labels should be lowercase, hyphenated (e.g. `needs-review`, `tech-debt`)
- Search is **full-text**, not JQL — pass plain terms, not query expressions
- Don't reopen resolved issues — create a new one and link it
