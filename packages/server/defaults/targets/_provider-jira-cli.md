---
name: Jira (CLI)
match: ["*"]
enabled: false
provider: jira
---

# Jira Integration — Atlassian CLI (acli)

Jira is connected via the Atlassian CLI (`acli`). All `issues.*` step types route through `acli jira workitem` commands.

## Step Types

| Step | Purpose |
|------|---------|
| `issues.create` | Create a new issue (project, summary, description, issue_type, labels) |
| `issues.get` | Fetch issue details by key (e.g. `ENG-123`) |
| `issues.search` | Search with JQL (e.g. `project = ENG AND status = "To Do"`) |
| `issues.attach` | Attach a file to an issue |
| `issues.transition` | Move issue to a new status (e.g. "In Progress", "Done") |
| `issues.comment` | Add a comment to an issue |

## ACLI Command Mapping

| Step Type | ACLI Command |
|-----------|-------------|
| `issues.create` | `acli jira workitem create --project X --summary "..." --type Task` |
| `issues.get` | `acli jira workitem view ENG-123` |
| `issues.search` | `acli jira workitem list --jql "project = ENG"` |
| `issues.transition` | `acli jira workitem transition ENG-123 --transition "In Progress"` |
| `issues.comment` | `acli jira workitem comment ENG-123 --body "..."` |

## Available Workflows

Same workflows as the REST API connector — `issues.*` steps are abstract and work with either connector.

| Workflow | Purpose |
|----------|---------|
| `sb_ops_dev_cycle` | Full autonomous cycle: pick → start → work → PR → submit |
| `ops_pick_issue` | Search backlog and select a suitable issue |
| `jira_create_from_message` | Create a Jira issue from a message |

## Authentication

ACLI uses browser-based OAuth. Run `acli jira auth login` to authenticate. Credentials are cached locally — no environment variables needed.
