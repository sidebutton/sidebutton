---
name: GitHub (Browser)
match: ["*"]
enabled: false
provider: github
---

# GitHub Integration — Browser

GitHub is connected via browser automation. Use SideButton browser tools to navigate PRs, review diffs, and manage issues.

**Important:** This connector assumes you are already logged in to GitHub in the browser. If you encounter a login page or authentication challenge, **stop and notify the user** — do not attempt to authenticate.

## Browser Tools

Use the standard `browser.*` tools to interact with GitHub:

| Tool | Usage |
|------|-------|
| `navigate` | Go to repo, PR, or issue URL |
| `snapshot` | Capture current page for reading |
| `click` | Click tabs, buttons, links |
| `type` | Fill forms, comment boxes, search |

## Default Workflows

Use `run_workflow` for common operations:

| Workflow | Purpose |
|----------|---------|
| `github_browser_view_pr` | Navigate to PR page, snapshot details + diff |
| `github_browser_list_prs` | Navigate to PR list, snapshot |
| `github_browser_create_issue` | Navigate to new issue form, fill, submit |

## Common Patterns

**View a PR:**
1. Navigate to `{GITHUB_BROWSER_URL}/owner/repo/pull/123`
2. Use `snapshot` to read PR details
3. Click "Files changed" tab for diff review

**List PRs:**
1. Navigate to `{GITHUB_BROWSER_URL}/owner/repo/pulls`
2. Use `snapshot` to read PR list

**Create an issue:**
1. Use `run_workflow` with `github_browser_create_issue`
2. Or navigate to `{GITHUB_BROWSER_URL}/owner/repo/issues/new`

## Authentication

Requires `GITHUB_BROWSER_URL` in Settings > Environment Variables (e.g. `https://github.com`). You must be logged in to GitHub in the connected browser.
