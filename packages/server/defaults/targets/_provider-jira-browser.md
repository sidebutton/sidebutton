---
name: Jira (Browser)
match: ["*"]
enabled: false
provider: jira
---

# Jira Integration — Browser

Jira is connected via browser automation. Use SideButton browser tools (`navigate`, `snapshot`, `click`, `type`) to interact with Jira boards and issues.

**Important:** This connector assumes you are already logged in to Jira in the browser. If you encounter a login page or authentication challenge, **stop and notify the user** — do not attempt to authenticate.

## Browser Tools

Use the standard `browser.*` tools to interact with Jira:

| Tool | Usage |
|------|-------|
| `navigate` | Go to Jira board, issue, or search URL |
| `snapshot` | Capture current page state for reading |
| `click` | Click buttons, links, issue cards |
| `type` | Fill forms, search fields, JQL input |

## Default Workflows

Use `run_workflow` for common operations:

| Workflow | Purpose |
|----------|---------|
| `jira_browser_create_issue` | Navigate to create issue form, fill fields, submit |
| `jira_browser_search` | Navigate to search, enter JQL/text, snapshot results |
| `jira_browser_view_issue` | Navigate to issue by key, snapshot details |

## Common Patterns

**View an issue:**
1. Navigate to `{JIRA_BROWSER_URL}/browse/ENG-123`
2. Use `snapshot` to read issue details

**Search issues:**
1. Navigate to `{JIRA_BROWSER_URL}/issues/?jql=...`
2. Use `snapshot` to read search results

**Create an issue:**
1. Use `run_workflow` with `jira_browser_create_issue`
2. Or navigate to `{JIRA_BROWSER_URL}/secure/CreateIssue.jspa`

## Authentication

Requires `JIRA_BROWSER_URL` in Settings > Environment Variables (e.g. `https://yoursite.atlassian.net`). You must be logged in to Jira in the connected browser.
