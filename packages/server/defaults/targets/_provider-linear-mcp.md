---
name: Linear (MCP)
match: ["*"]
enabled: false
provider: linear
---

# Linear Integration — MCP Tools

When a Linear account is connected, the agent VM launches Linear's official remote MCP server
(`https://mcp.linear.app/mcp`, Streamable HTTP). Its tools appear with the `mcp__linear__*` prefix
and cover roughly 25 operations: find / create / update issues, projects, cycles, comments, and a
raw GraphQL passthrough.

## When to use the MCP vs the `issues.*` steps

| Use | Reach for |
|-----|-----------|
| Inside a workflow / playbook (create, transition, comment, attach) | the provider-agnostic `issues.*` steps (see `_provider-linear-api.md`) |
| Ad-hoc exploration, multi-step investigation, or operations the steps don't cover | the `mcp__linear__*` tools |

The `issues.*` steps keep workflows portable across Jira and Linear. The MCP is for interactive,
exploratory work where you want Linear's full surface directly.

## Tool families

| Family | Typical tools |
|--------|---------------|
| Issues | find / get / create / update issues; set state, assignee, labels |
| Projects & cycles | list and read projects, cycles, milestones |
| Comments | list and add comments |
| Teams & users | list teams, workflow states, members |
| Raw | a GraphQL passthrough for anything not covered above |

(Exact tool names come from the server at connect time — list them after connecting rather than
hardcoding.)

## Conventions

- **Comments are Markdown.** Linear has no ADF. Write plain Markdown — no literal `{}`/`[]` wrapping,
  no rich-JSON. The "comment-then-transition" convention still holds.
- **Keys vs ids.** `ENG-123` is the human key (`identifier`); most write operations also accept it,
  but some take the issue UUID. When a tool wants an id, resolve the key first (find the issue, read
  its `id`).
- **Teams scope everything.** Workflow states and labels are team-scoped; name them as they exist in
  the issue's team.

## Authentication

The MCP connection sends the credential as an `Authorization: Bearer <token>` header (the remote MCP
accepts it directly). The Bearer slot takes whichever credential the account uses: an OAuth app access
token (`LINEAR_ACCESS_TOKEN`, from "Connect with Linear") or a personal API key (`LINEAR_API_KEY`).
Note the contrast with the GraphQL API path, which sends a **personal key raw** (no `Bearer`) but an
**OAuth token as Bearer** — see `_provider-linear-api.md`.
