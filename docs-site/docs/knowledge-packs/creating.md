# Creating Knowledge Packs

This guide covers how to build, test, and publish knowledge packs.

## Directory Structure

A knowledge pack is a folder named after the target domain:

```
my-app.example.com/
├── skill-pack.json       # Required: manifest
├── _skill.md             # Required: domain target (knowledge base)
├── _roles/               # Optional: agent roles
│   └── qa.md
├── login.yaml            # Workflows at root level
├── dashboard/            # Module subfolder
│   ├── _skill.md         # Module-specific target
│   ├── _roles/
│   │   └── qa.md
│   └── export_report.yaml
└── settings/             # Another module
    ├── _skill.md
    └── update_profile.yaml
```

### Conventions

| Convention | Rule |
|-----------|------|
| Folder name | Must match the `domain` field in `skill-pack.json` |
| `_skill.md` | Target file — describes the domain/module for AI context |
| `_roles/` | Directory for role markdown files |
| `*.yaml` | Workflow files — loaded recursively |
| `_` or `.` prefixed dirs | Skipped during workflow loading (except `_roles/` and `_skill.md`) |

## Manifest: skill-pack.json

Create `skill-pack.json` at the pack root:

```json
{
  "name": "yourorg/app-name",
  "version": "1.0.0",
  "title": "App Name Automation",
  "description": "Workflows and context for app-name.example.com",
  "domain": "app-name.example.com",
  "requires": {
    "browser": true,
    "llm": false
  }
}
```

- **`name`** — Use `org/pack` format for namespacing
- **`version`** — Semver; SideButton prevents overwriting a different version without `--force`
- **`domain`** — The web domain this pack targets; becomes the install directory name under `skills/`
- **`requires`** — Declares dependencies so users know what's needed

## Target Files: _skill.md

Target files provide domain knowledge that gets injected into AI context when the user visits matching URLs.

```markdown
---
name: My App
domain: app-name.example.com
tags: ["@productivity"]
confidence: 0.9
---

## What This Is
My App is a project management tool at app-name.example.com.

## Authentication
- Login at /login with email + password
- Session persists via cookies

## Navigation
- Left sidebar: Projects, Tasks, Calendar, Settings
- Top bar: Search, Notifications, Profile

## Key Pages
| Page | URL | Purpose |
|------|-----|---------|
| Dashboard | `/` | Overview |
| Projects | `/projects` | Project list |
| Tasks | `/tasks` | Task management |
```

### Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name |
| `domain` | string | Domain for auto-matching |
| `match` | string[] | URL patterns (defaults to domain if omitted) |
| `tags` | string[] | Tags like `@ops`, `@qa` |
| `confidence` | number | 0.0–1.0, how reliable this knowledge is |
| `enabled` | boolean | Default `true` |

## Role Files

Roles in `_roles/` define agent behavior for this domain:

```markdown
---
name: QA for My App
match:
  - "app-name.example.com"
enabled: true
---

## Testing Guidelines
- Always verify page loads before interacting
- Check for error banners after form submissions
- Screenshot failures for evidence
```

## Workflows

Standard SideButton YAML workflows. Use the domain as a prefix for workflow IDs to avoid collisions:

```yaml
id: myapp_tasks_create
title: "My App: Create Task"
description: "Create a new task in My App"
params:
  title: string
  priority:
    type: string
    default: "Medium"
steps:
  - type: browser.navigate
    url: "https://app-name.example.com/tasks"
  - type: browser.click
    selector: "button:has-text('New Task')"
  - type: browser.type
    selector: "input[name='title']"
    text: "{{title}}"
```

## Creating a Registry

A registry lets you distribute multiple knowledge packs together. Create a directory with `index.json` at the root:

```
my-registry/
├── index.json
├── app-one.example.com/
│   ├── skill-pack.json
│   ├── _skill.md
│   └── ...
└── app-two.example.com/
    ├── skill-pack.json
    ├── _skill.md
    └── ...
```

### index.json

```json
{
  "version": 1,
  "name": "My Team's Skills",
  "packs": [
    {
      "name": "team/app-one",
      "domain": "app-one.example.com",
      "version": "1.0.0",
      "title": "App One Automation",
      "description": "Workflows for App One",
      "path": "app-one.example.com"
    },
    {
      "name": "team/app-two",
      "domain": "app-two.example.com",
      "version": "1.0.0",
      "title": "App Two Automation",
      "description": "Workflows for App Two",
      "path": "app-two.example.com"
    }
  ]
}
```

The `path` field is relative to the registry root.

## Local Directory vs Git Repository

Registries can be either local directories or git repositories:

| Type | Use Case | Add Command |
|------|----------|-------------|
| **Local** | Development, shared network drives | `sidebutton registry add /path/to/registry` |
| **Git** | Distribution, team sharing | `sidebutton registry add https://github.com/org/skills` |

Git registries support `registry update` to pull the latest changes and re-install modified packs.

## Testing Locally

Before publishing, test your pack by installing it from a local path:

```bash
# Install directly from your development directory
sidebutton install ./my-app.example.com

# Verify it loaded
sidebutton install --list

# Start the server and check:
# - Workflows appear in dashboard and list_workflows
# - Targets inject when visiting the domain
# - Roles activate for matching URLs
```

To iterate during development:

```bash
# Uninstall the old version
sidebutton uninstall my-app.example.com

# Re-install after changes
sidebutton install ./my-app.example.com
```

Or use a local registry for multi-pack development:

```bash
# Point to your local registry directory
sidebutton registry add ./my-registry --name dev

# After making changes, re-sync
sidebutton registry update dev
```

## Development Workflow

End-to-end: scaffold, develop, validate, publish.

### 1. Scaffold

```bash
sidebutton init my-app.example.com
```

Creates a directory with `skill-pack.json`, `_skill.md`, and `_roles/qa.md` templates.

### 2. Develop

Edit `_skill.md` with domain knowledge (selectors, navigation, data model, gotchas). Fill in `_roles/qa.md` with test sequences and verification criteria. Add YAML workflows for common operations.

### 3. Validate

```bash
sidebutton validate ./my-app.example.com
```

Checks manifest, `_skill.md`, YAML syntax, and `_roles/` directory. Exits with code 1 on errors.

### 4. Publish

```bash
sidebutton publish ./my-app.example.com --registry /path/to/registry
```

Validates the pack, copies it into the registry, regenerates `index.json`, and auto-commits if the registry is a git repo. Use `--dry-run` to preview.

### 5. Test

```bash
# Install from the registry
sidebutton registry add /path/to/registry

# Verify everything loaded
sidebutton install --list
```

See the [CLI Reference](/knowledge-packs/cli) for full command details, including in-place publishing mode and all options.

## Editing in the Portal

The workflow above is CLI-first — clone the repo, edit files, `sidebutton publish`. If your pack is an **account pack** on the Fleet Control portal, you can edit the same content in the browser instead. The portal commits each save straight to the pack repository — authored as your signed-in user — and running agents pick the change up automatically. It's the portal-side equivalent of committing and pushing: no clone, no separate publish step.

### What you can edit

| Content | Where | How |
|---------|-------|-----|
| Module skill (`_skill.md`) | **Skills** → a module | **Edit** on the file card |
| Role playbook (`_roles/<slug>.md`) | **Roles** → a role (or a role with no playbook) | **Edit**, or **Create playbook file** on the empty state |
| Workflow YAML | **Workflows** → a workflow | **Edit YAML** |
| A new module or domain | **Skills** | **+ Module** / **+ Domain** — scaffolds the same skeleton as `sidebutton init` |

**Editing** an existing file and **creating** a new one (a missing role playbook, a scaffolded module or domain) both go through the same save path. Your file is saved exactly as you submit it. Frontmatter that carries discovery contracts — `confidence`, `repos`, `workspaces` — is checked on save: dropping one of these fields does not block the commit, but the response carries a non-fatal warning that the grooming metadata was lost.

> **Default-pack workflows.** Editing a workflow that ships in the shared default pack does not touch the catalog. The save **copies the workflow into your account pack**, and your account's copy takes over from then on — there is no separate "fork" step.

### Who can write, and consent for your own repo

Writing requires an **admin** portal user, and the usual trial limits apply.

A **portal-provided** pack repo (the default the portal provisions for you) is always writable — it is portal infrastructure, so there is nothing to opt into.

If you pointed your account at your **own** GitHub or Bitbucket repo, portal writes are **opt-in**. Pick a write mode in **Settings → Skill Pack Repository**:

| Mode | A save… |
|------|---------|
| **Read-only** (`off`, default) | is disabled — the editor links out to your host's own web editor. This is the previous "the portal never pushes" behavior, now an explicit choice. |
| **Commit** (`commit`) | commits directly to your default branch — the same access your agents already have. |
| **Pull request** (`pr`) | pushes an edit branch and opens a pull request. *Rolling out — not yet selectable in Settings.* |

Turning on **Commit** runs a one-time capability probe against your stored git credential and refuses, with a reason, if it is read-only (GitHub needs `repo` scope; Bitbucket needs *Repositories: Write*).

### Saving: conflicts and validation

Every save is all-or-nothing — the working copy is never left half-written:

1. **Validate** — frontmatter, workflow YAML, and the manifest schema must parse. A bad edit is rejected up front with a `422` and per-field reasons, before anything is pulled or written.
2. **Refresh** — the portal pulls the latest from the remote.
3. **Conflict check** — if the file changed upstream since you opened it (discovery agents write these repos too), the save is rejected with a `409` and the editor shows a *changed upstream* prompt carrying the latest version to merge. Last-write-wins is never silent.
4. **Commit, push, re-sync** — the commit is authored as you, then readiness, pipelines, and roles recompute immediately.

A successful save returns the new commit and any non-fatal notes:

```json
{
  "commit_sha": "9f2c41d",
  "warnings": ["_skill.md dropped SD-contract frontmatter field(s): confidence"],
  "pull_request_url": "https://github.com/your-org/your-pack/pull/42"
}
```

`pull_request_url` is present only in **Pull request** mode.

### How fast changes propagate

| Consumer | Sees the change |
|----------|-----------------|
| The Fleet Control portal | Immediately — the save re-syncs before it returns. |
| Agents (Claude Code / MCP) | On the next registry sync — **within ~5 minutes**. |

Account packs need no manifest version bump to propagate: agents force-reinstall on every pull, and the portal sync is gated on the repository's `HEAD` commit. On an agent, MCP `resources/read` serves the new content live; the pack summary from `initialize` refreshes on reconnect.

### Not yet available

Portal editing is **create and edit** only. **Deleting or renaming** a pack file is not available in the portal yet — treat a scaffolded file as a one-way door for now. The registry `index.json` is always regenerated, never hand-edited.

## Learning Loop

Knowledge packs aren't static — they improve every time your agent uses them.

Your AI agent (Claude Code, Cursor, or any MCP-connected tool) already has access to
SideButton's browser tools. When you point it at an application, it can explore pages,
document what it finds, and build a knowledge pack. On the next session, it loads that
knowledge and operates from a higher baseline. Each cycle compounds:

### The Cycle

1. **Explore** — Agent navigates your app, uses `snapshot` to map pages, documents
   selectors, states, and data model into `_skill.md`
2. **Use** — Agent loads the knowledge pack for real work (testing, development, automation).
   Skill context is injected automatically when the domain matches.
3. **Improve** — Agent encounters a broken selector, undocumented feature, or new page.
   It updates `_skill.md` directly, runs `sidebutton validate`, and publishes the update.

4. **Repeat** — Next session starts from a higher baseline. Knowledge compounds.

### Example Conversation

```
You: "Explore my-app.example.com and document what you find"
  → Agent uses SideButton snapshot → creates _skill.md for each module
  → Agent runs: sidebutton init → sidebutton publish --registry ./my-registry

You: "Test the tasks module"
  → Agent loads knowledge pack → knows all selectors and page states
  → Finds: status dropdown selector changed after app update
  → Agent updates _skill.md with correct selector → republishes

You: "Add a workflow for creating tasks"
  → Agent already knows the form fields from _skill.md
  → Creates tasks/create.yaml → publishes to registry

Next session: agent loads updated pack — correct selectors, new workflow ready
```

### What Gets Better

| Cycle | What Improves |
|-------|--------------|
| First exploration | Page structure, navigation, key selectors documented |
| First use | Gotchas discovered (portal rendering, timing issues, scroll prerequisites) |
| QA testing | Broken selectors fixed, missing states added, edge cases documented |
| Development | New endpoints added, API contracts documented, code ownership mapped |
| Ongoing | Workflows accumulate, coverage grows, confidence increases |

### Coverage Model

Each module in a knowledge pack tracks its documentation maturity:

```
Route discovered → 1% (name + URL + brief description)
    → Fill _skill.md sections progressively per session
_skill.md >= 75% → generate _roles/qa.md (starts at 45%)
    → Fill role files with test sequences per session
80% of all docs done → polish phase (edge cases, selector verification)
```

The root `_skill.md` maintains a Module Inventory table tracking coverage
across all modules.

## Writing Effective Knowledge Pack Documentation

Knowledge packs work because agents read `_skill.md` and role files (like `qa.md`) to understand a domain without human explanation. The difference between a knowledge pack that enables autonomy and one that leaves an agent guessing comes down to five qualities:

| Quality | What to Document | Why It Matters |
|---------|-----------------|----------------|
| **Component-level selectors** | Data attributes, ARIA roles, and scoping selectors for interactive elements inside each page section — not just top-level navigation | Agents need to target specific inputs, buttons, and displays within complex pages. Page-level nav alone isn't enough when a single view has multiple forms, tabs, or collapsible sections. |
| **State machines** | Every state an entity can be in, what triggers transitions, and how the UI represents each state (badge colors, conditional fields, disabled controls) | Agents must verify that actions produce the correct state change. Without a state map, agents can't distinguish "working correctly" from "silently broken." |
| **Interaction gotchas** | Field ordering dependencies, scroll prerequisites, elements that only appear after other actions, product-dependent field changes | Real applications have implicit interaction sequences that aren't visible in the DOM. Documenting these prevents agents from getting stuck on forms that silently reject input. |
| **Cache and timing behavior** | Stale times for different data types, when refreshes are needed, which operations trigger automatic reloads vs. require manual navigation | Agents that verify results immediately after mutations may see stale data and incorrectly report failures. Documenting cache behavior prevents false negatives. |
| **Business rule definitions** | Formulas, aggregation logic, calculation rules, and how derived values relate to source data | Agents testing KPIs, reports, or dashboards need to know what correct output looks like. Without business rules, agents can only check that values exist — not that they're right. |

Write `_skill.md` as if you're onboarding a new team member who has never seen the application. Include the specific details that would take someone hours of exploration to discover on their own.

### Agent-Assisted Knowledge Pack Creation

Knowledge packs don't have to be written by hand. An AI agent with SideButton browser access can explore an application and produce `_skill.md` files, role playbooks, and workflows by navigating pages, inspecting elements, and documenting what it discovers. A production knowledge pack (29 modules, 157 files, 23,000+ lines) was entirely agent-authored in 6 working days.

The typical agent-assisted workflow:

1. Deploy an agent with SideButton on the target application
2. Agent navigates each module, uses `snapshot` and `capture_page` to map selectors and page structure
3. Agent documents findings into `_skill.md` (selectors, states, business rules, gotchas)
4. Agent creates YAML workflows for common CRUD operations
5. Human reviews the generated pack. From this point, each session with the agent improves the knowledge pack — see [Learning Loop](#learning-loop) above.

This approach is fastest for large applications with many modules. The agent handles the exploration and documentation; the human ensures accuracy and adds business context the agent can't infer from the UI alone.

## Next Steps

- **[CLI Reference](/knowledge-packs/cli)** — Full command reference including `init`, `validate`, `publish`, install, and registry management
- **[Publishing](/knowledge-packs/cli#creator-commands)** — Detailed publishing options (copy mode, in-place mode, `--dry-run`)
- **[Workflows DSL](/workflows/dsl)** — YAML syntax for workflow steps
- **[Step Types](/workflows/steps)** — All available step types
