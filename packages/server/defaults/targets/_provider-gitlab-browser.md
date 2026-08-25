---
name: GitLab (Browser)
match: ["*"]
enabled: false
provider: gitlab
---

# GitLab Integration — Browser

GitLab is connected via browser automation. Use SideButton browser tools to navigate merge requests, review diffs, and read issues.

**Important:** This connector assumes you are already logged in to GitLab in the browser. If you encounter a login page or authentication challenge, **stop and notify the user** — do not attempt to authenticate.

## Browser Tools

Use the standard `browser.*` tools to interact with GitLab:

| Tool | Usage |
|------|-------|
| `navigate` | Go to project, MR, or issue URL |
| `snapshot` | Capture current page for reading |
| `click` | Click tabs, buttons, links |
| `type` | Fill forms, comment boxes, search |

## Common Patterns

GitLab URLs put a `/-/` separator between the project path and the section, and the project path can nest through subgroups (`group/subgroup/project`).

**View an MR:**
1. Navigate to `{GITLAB_BROWSER_URL}/group/project/-/merge_requests/7`
2. Use `snapshot` to read MR details
3. Click "Changes" for diff review

**List MRs:**
1. Navigate to `{GITLAB_BROWSER_URL}/group/project/-/merge_requests`
2. Use `snapshot` to read the MR list

**View an issue:**
1. Navigate to `{GITLAB_BROWSER_URL}/group/project/-/issues/12`

## Authentication

Requires `GITLAB_BROWSER_URL` in Settings > Environment Variables (e.g. `https://gitlab.com`). You must be logged in to GitLab in the connected browser.
