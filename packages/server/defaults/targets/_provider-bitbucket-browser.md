---
name: Bitbucket (Browser)
match: ["*"]
enabled: false
provider: bitbucket
---

# Bitbucket Integration — Browser

Bitbucket is connected via browser automation. Use SideButton browser tools to navigate pull requests and review code.

**Important:** This connector assumes you are already logged in to Bitbucket in the browser. If you encounter a login page or authentication challenge, **stop and notify the user** — do not attempt to authenticate.

## Browser Tools

Use the standard `browser.*` tools to interact with Bitbucket:

| Tool | Usage |
|------|-------|
| `navigate` | Go to repo, PR, or branch URL |
| `snapshot` | Capture current page for reading |
| `click` | Click tabs, buttons, links |
| `type` | Fill forms, comment boxes, search |

## Default Workflows

Use `run_workflow` for common operations:

| Workflow | Purpose |
|----------|---------|
| `bitbucket_browser_view_pr` | Navigate to PR, snapshot details |
| `bitbucket_browser_list_prs` | Navigate to PR list, snapshot |

## Common Patterns

**View a PR:**
1. Navigate to `{BITBUCKET_BROWSER_URL}/workspace/repo/pull-requests/123`
2. Use `snapshot` to read PR details
3. Click "Diff" tab for code review

**List PRs:**
1. Navigate to `{BITBUCKET_BROWSER_URL}/workspace/repo/pull-requests`
2. Use `snapshot` to read PR list

## Authentication

Requires `BITBUCKET_BROWSER_URL` in Settings > Environment Variables (e.g. `https://bitbucket.org`). You must be logged in to Bitbucket in the connected browser.
