---
name: GitLab (CLI)
match: ["*"]
enabled: false
provider: gitlab
---

# GitLab Integration — CLI (glab)

GitLab is connected via the `glab` CLI. You can manage merge requests and read issues directly without opening a browser.

GitLab calls a pull request a **merge request (MR)**, numbers it per-project as an **iid** (written `!7`), and nests namespaces (`group/subgroup/project`). Whenever a step or command wants a repo, pass the **whole path after the host**, not just the last two segments.

## Step Types

### Git Operations

| Step | Purpose |
|------|---------|
| `git.listPRs` | List merge requests (optional: repo, state, limit) |
| `git.getPR` | Get MR details by iid (title, branches, merge status) |
| `git.createPR` | Create a merge request (title, body, source branch, target branch) |
| `git.listIssues` | List issues (optional: repo, state, labels, limit) |
| `git.getIssue` | Get issue details by iid |

`state` accepts `open`, `closed`, `merged` (MRs only), or `all`. `limit` is one page, capped at 100.

**Set `provider: gitlab` on every `git.*` step.** A `git.*` step with no `provider:` field goes to GitHub — that is the engine-wide default and it does not change when this connector is active.

**Issue *writes* are not available on this connector** — no `issues.create` / `issues.transition` / `issues.comment`. GitLab is wired as a git host only; use Jira or Linear as the issues provider.

## Common Sequences

**Review open MRs:**
1. `git.listPRs` with `state: "open"` — see what needs review
2. `git.getPR` with the iid — read details and merge status
3. Use browser tools for visual diff review if needed

**Create an MR after coding:**
1. Push the feature branch
2. `git.createPR` with title, source branch, target branch

## CLI Equivalents

The same operations from a terminal, and the ones the step types do not cover (merging, approving):

```bash
glab mr list --output json                       # list open MRs
glab mr view 7 --output json                     # MR !7 as JSON
glab mr create --title "..." --description "..." \
  --source-branch feature --target-branch main --yes
glab mr view 7                                   # verify state (must read merged)
glab mr merge 7 --auto-merge=false -d            # merge NOW and delete the source branch
glab issue list --output json
glab -R group/subgroup/project mr list           # target another project
```

`glab mr merge` without `--auto-merge=false` only *schedules* the merge whenever a pipeline is running — it exits 0 while the MR stays open, so always pass the flag and then confirm with `glab mr view`.

`--output json` is the long form that works on every subcommand; the short flag is `-F` everywhere except `glab issue list`, where it is `-O` (there `-F` means `--output-format`).

## Authentication

Requires `glab` installed and authenticated. Set `GITLAB_TOKEN` (a personal or project access token with `api` + `write_repository` scope) and run `glab auth login`. Check with `glab auth status`.

Provisioned agent VMs install `glab` by default and authenticate it automatically when `GITLAB_TOKEN` is present, so on those boxes this connector is ready without manual setup.
