---
name: Jira
match:
  - atlassian.net
  - jira_*
  - "@ops"
---

## Tickets
- Always include: summary, description, acceptance criteria
- Use past tense in bug descriptions ("Button failed to load" not "Button fails to load")
- Link to source context (Slack thread, page URL) when creating from external input
- Assign to the right team — don't leave unassigned

## Priority
- P1: Production outage or data loss
- P2: Broken feature affecting users
- P3: Enhancement or improvement
- P4: Cosmetic or nice-to-have

## Conventions
- Labels should be lowercase, hyphenated (e.g. `needs-review`, `tech-debt`)
- Story points: use your team's scale consistently
- Don't reopen resolved tickets — create a new one and link
