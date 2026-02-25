---
name: Jira (REST API)
match: ["*"]
enabled: false
provider: jira
---

# Jira Integration — REST API

Jira is connected via direct REST API. You can create, search, read, transition, and comment on issues without opening a browser.

## Step Types

| Step | Purpose |
|------|---------|
| `issues.create` | Create a new issue (project, summary, description, issue_type, labels) |
| `issues.get` | Fetch issue details by key (e.g. `ENG-123`) |
| `issues.search` | Search with JQL (e.g. `project = ENG AND status = "To Do"`) |
| `issues.attach` | Attach a file to an issue |
| `issues.transition` | Move issue to a new status (e.g. "In Progress", "Done") |
| `issues.comment` | Add a comment to an issue |

## Available Workflows

**Ops workflows** (`ops_*`, `sb_ops_*`) — autonomous dev cycle:

| Workflow | Purpose |
|----------|---------|
| `ops_pick_issue` | Search backlog and select a suitable issue |
| `ops_start_work` | Transition issue to In Progress, create branch |
| `ops_create_pr` | Create a PR from current changes |
| `ops_submit_work` | Transition issue to Done, link PR |
| `sb_ops_dev_cycle` | Full autonomous cycle: pick → start → work → PR → submit |

**Issue management:**

| Workflow | Purpose |
|----------|---------|
| `jira_create_from_message` | Create a Jira issue from a Slack/chat message |

## Common Sequences

**Pick and start work on an issue:**
1. `issues.search` — find open issues in backlog
2. `llm.decide` — pick the best one based on priority and skills
3. `issues.transition` — move to "In Progress"
4. `issues.comment` — note that work is starting

**Complete work and submit:**
1. `issues.comment` — summarize what was done
2. `issues.transition` — move to "Done" or "In Review"

**Search before creating (avoid duplicates):**
1. `issues.search` with JQL — e.g. `project = ENG AND summary ~ "login bug"`
2. If no match, use `issues.create`

## Autonomous Development Cycle

Jira API connector provides the `sb_ops_*` workflow chain implementing the SE dev cycle pattern:

| Workflow | Purpose |
|----------|---------|
| `sb_ops_dev_cycle` | Full cycle: pick → start → work → PR → submit |
| `sb_ops_pick_issue` / `ops_pick_issue` | Search active sprint with JQL, `llm.decide` to select |
| `sb_ops_start_work` / `ops_start_work` | Transition to "In Progress", generate instruction, create branch |
| `sb_ops_create_pr` / `ops_create_pr` | Create PR from current changes, generate title/body |
| `sb_ops_submit_work` / `ops_submit_work` | Link PR to issue, transition to "In Review" or "Done" |

**Jira-specific status names:** "To Do", "In Progress", "In Review", "Done" (may vary by project workflow).

**When to use the full cycle vs manual steps:**
- Use `sb_ops_dev_cycle` when you have a project key and want fully autonomous execution
- Use individual `ops_*` workflows when you already know the issue key or want finer control
- Use `issues.*` steps directly for one-off operations

## Authentication

Requires `JIRA_USER_EMAIL` and `JIRA_API_TOKEN` in Settings > Environment Variables. Optionally set `JIRA_URL` for Jira Server/Data Center (defaults to Atlassian Cloud).
