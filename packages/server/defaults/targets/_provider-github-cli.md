---
name: GitHub (CLI)
match: ["*"]
enabled: false
provider: github
---

# GitHub Integration — CLI (gh)

GitHub is connected via the `gh` CLI. You can manage pull requests and issues directly without opening a browser.

## Step Types

### Git Operations

| Step | Purpose |
|------|---------|
| `git.listPRs` | List pull requests (optional: repo, state, limit) |
| `git.getPR` | Get PR details by number (title, diff stats, review status) |
| `git.createPR` | Create a pull request (title, body, head branch, base branch) |
| `git.listIssues` | List issues (optional: repo, state, labels, limit) |
| `git.getIssue` | Get issue details by number |

### Issue Operations

| Step | Purpose |
|------|---------|
| `issues.create` | Create a new issue (project=repo, summary=title, description=body) |
| `issues.get` | Get issue details by number (use `#123` format) |
| `issues.search` | Search issues by query text |
| `issues.transition` | Close or reopen an issue (status: "closed" or "open") |
| `issues.comment` | Add a comment to an issue |

## Common Sequences

**Review open PRs:**
1. `git.listPRs` with `state: "open"` — see what needs review
2. `git.getPR` with number — read details and diff stats
3. Use browser tools for visual diff review if needed

**Create a PR after coding:**
1. `git.createPR` with title, head branch, base branch
2. `issues.comment` on related issue linking the PR

**Triage issues:**
1. `git.listIssues` with `state: "open"` — see all open issues
2. `git.getIssue` for details on specific ones
3. `issues.comment` to respond or assign

## Autonomous Development Cycle

GitHub CLI connector supports the SE dev cycle pattern using issues and PRs:

**Pick an issue:**
1. `git.listIssues` with `state: "open"` — browse available issues
2. `git.getIssue` — read details on candidates
3. `llm.decide` — select the best one based on priority and scope

**Start work:**
1. `issues.comment` — note that work is starting
2. GitHub Issues have simple state (open/closed) — no "In Progress" transition. The comment serves as the status signal.

**Submit work:**
1. `git.createPR` — create a pull request from the current branch
2. `issues.comment` on the original issue — link the PR
3. `issues.transition` with status `"closed"` — close the issue when the PR is merged

**Key differences from full project management tools:**
- GitHub Issues lack custom workflows — state is just open/closed
- Sprint/board management is limited — use labels and milestones instead
- Focus is on PR creation and issue linking, not complex status transitions

## Authentication

Requires `gh` CLI installed and authenticated. Run `gh auth login` to set up.
