---
name: Linear (GraphQL API)
match: ["*"]
enabled: false
provider: linear
---

# Linear Integration — GraphQL API

Linear is connected via its GraphQL API. You can create, search, read, transition, and comment on
issues without opening a browser. The same provider-agnostic `issues.*` steps that drive Jira drive
Linear — only the conventions below differ.

## Step Types

| Step | Purpose |
|------|---------|
| `issues.create` | Create an issue. `project` is the **team key** (e.g. `ENG`); `issue_type` maps to a **label** (Linear has no issue types); `labels` are applied if they exist |
| `issues.get` | Fetch issue details by key (e.g. `ENG-123`) |
| `issues.search` | **Full-text** search (e.g. `login crash`) — see "No JQL" below |
| `issues.attach` | Attach a file to an issue (two-step upload, handled for you) |
| `issues.transition` | Move an issue to a workflow **state by name** (e.g. "In Progress", "Done") |
| `issues.comment` | Add a **Markdown** comment to an issue |

## Linear conventions (how it differs from Jira)

- **Keys are `TEAM-123`.** `ENG-42` is a team key (`ENG`) plus a number — the same shape as a Jira key.
- **`project` is a team key.** A workspace routes one Linear **team's** issues. For `issues.create`,
  pass the team key (e.g. `ENG`) as `project`.
- **Status = workflow-state name.** `issues.transition` takes a state **name**; it is resolved
  against the issue's own team. State names are **team-scoped**, so a playbook reused across teams
  must use names that exist in each team (the same caveat as Jira project workflows). The terminal
  "Done" intent resolves to the team's *completed* state even if it is named differently (e.g.
  "Merged", "Shipped"); "Canceled" resolves to the *canceled* state.
- **No issue types — labels instead.** Linear has no first-class issue type. `issue_type` is treated
  as a label. Key playbooks off labels ("Bug", "Story") rather than a type field.
- **No JQL.** `issues.search` is Linear **full-text** search, not JQL. A JQL string like
  `project = ENG AND status = "To Do"` will not work — pass plain search terms (e.g. `login crash`).
- **Comments are Markdown.** No ADF/rich-JSON wrapping. Write plain Markdown; keep it concise, and
  follow the comment-then-transition convention.

## Common Sequences

**Pick and start work on an issue:**
1. `issues.search` — find open issues (full-text terms)
2. `llm.decide` — pick the best one based on priority and skills
3. `issues.transition` — move to "In Progress"
4. `issues.comment` — note that work is starting

**Complete work and submit:**
1. `issues.comment` — summarize what was done (Markdown)
2. `issues.transition` — move to "In Review" or "Done"

## Autonomous Development Cycle

The Linear API connector provides the same `sb_ops_*` / `ops_*` workflow chain as Jira — the engine
is provider-agnostic, so no workflow needs to know it is talking to Linear:

| Workflow | Purpose |
|----------|---------|
| `sb_ops_dev_cycle` | Full cycle: pick → start → work → PR → submit |
| `sb_ops_pick_issue` / `ops_pick_issue` | Search the backlog, `llm.decide` to select |
| `sb_ops_start_work` / `ops_start_work` | Transition to "In Progress", generate instruction, create branch |
| `sb_ops_create_pr` / `ops_create_pr` | Create a PR from current changes |
| `sb_ops_submit_work` / `ops_submit_work` | Link the PR, transition to "In Review" or "Done" |

**Typical Linear state names:** "Backlog", "Todo", "In Progress", "In Review", "Done", "Canceled"
(these vary per team workflow).

## Agent MCP tools

When the Linear MCP is connected, the agent also has the `mcp__linear__*` tools for richer,
interactive work (find/create/update issues, projects, comments). See
[`_provider-linear-mcp.md`](./_provider-linear-mcp.md). Prefer the `issues.*` steps inside
workflows; reach for the MCP tools for ad-hoc exploration. Linear comments are Markdown in both paths.

## Authentication

Two credential shapes are accepted (the workspace is identified by the credential, so no URL or email
is needed, unlike Jira):

- **`LINEAR_API_KEY`** — a Linear **personal API key**, sent **raw** in the `Authorization` header
  (no `Bearer` prefix).
- **`LINEAR_ACCESS_TOKEN`** — an **OAuth app access token** (from "Connect with Linear"), sent as
  `Authorization: Bearer <token>`.

When both are set the **OAuth token wins**, so a stale leftover personal key never shadows the
account's live app token. For OAuth-connected accounts the portal supplies `LINEAR_ACCESS_TOKEN`; you
do not paste it by hand.
