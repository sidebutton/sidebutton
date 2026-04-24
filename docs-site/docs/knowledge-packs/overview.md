# Skills and Knowledge Packs

Knowledge packs are installable bundles of workflows, roles, and targets for a specific domain — like a plugin that teaches SideButton how to automate a web application.

## What is a Knowledge Pack?

A knowledge pack packages everything SideButton needs to work with a particular platform:

| Component | File | Purpose |
|-----------|------|---------|
| **Manifest** | `skill-pack.json` | Pack metadata (name, version, domain) |
| **Target** | `_skill.md` | Domain knowledge — navigation, selectors, auth |
| **Roles** | `_roles/*.md` | Agent behavior rules for this domain |
| **Workflows** | `*.yaml` | Automation recipes |

A single pack can contain multiple modules (subfolders), each with their own targets, roles, and workflows.

## Pack Structure

```
acme.example.com/
├── skill-pack.json          # Manifest
├── _skill.md                # Root domain target
├── _roles/
│   └── qa.md                # Domain-level role
├── tasks/                   # Module
│   ├── _skill.md            # Module target
│   ├── _roles/
│   │   └── qa.md            # Module-specific role
│   ├── create.yaml          # Workflows
│   └── change_status.yaml
└── issues/                  # Another module
    ├── _skill.md
    └── create_issue.yaml
```

## Why Knowledge Packs?

| Without Knowledge Packs | With Knowledge Packs |
|-------------------------|----------------------|
| Copy YAML files manually | `sidebutton install` |
| No domain context for AI | Targets describe the platform |
| No agent guidance | Roles teach when/how to automate |
| Hard to share | Publish a registry, others install |
| No versioning | Semver in manifest |

## How They Load at Runtime

When SideButton starts, it loads content from three sources:

| Source | Path | What Loads |
|--------|------|------------|
| **Defaults** | Built-in `defaults/` | Base roles and targets |
| **User** | `~/.sidebutton/roles/`, `targets/` | Your custom context |
| **Skills** | `~/.sidebutton/skills/<domain>/` | Installed knowledge packs |

Knowledge pack content merges with defaults and user content:
- **Workflows** — loaded recursively from `skills/<domain>/**/*.yaml` (skips `_` and `.` directories)
- **Roles** — loaded from `skills/<domain>/_roles/*.md` and `skills/<domain>/<module>/_roles/*.md`
- **Targets** — loaded from `_skill.md` files; if no match pattern is specified, auto-matches on domain

## Manifest Schema

Every knowledge pack requires a `skill-pack.json` at its root:

```json
{
  "name": "acme/support",
  "version": "1.0.0",
  "title": "Acme Support Automation",
  "description": "Workflows for acme.example.com support portal",
  "domain": "acme.example.com",
  "requires": {
    "browser": true,
    "llm": false
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Package identifier (e.g., `org/pack-name`) |
| `version` | string | Yes | Semver version |
| `title` | string | Yes | Human-readable name |
| `description` | string | Yes | What this pack automates |
| `domain` | string | Yes | Target domain (becomes install directory) |
| `requires.browser` | boolean | No | Needs browser extension |
| `requires.llm` | boolean | No | Needs LLM provider configured |
| `private` | boolean | No | Mark as private/internal |
| `tagline` | string | No | Short one-line summary (used on sidebutton.com) |
| `category` | string | No | Pack category (e.g., `"crm"`, `"support"`) |
| `modules` | string[] | No | List of module names within the pack |
| `roles` | string[] | No | Role identifiers bundled with the pack |

## Registry Schema

A registry is a directory (local or git) containing an `index.json` and one or more knowledge packs:

```json
{
  "version": 1,
  "name": "My Knowledge Packs",
  "packs": [
    {
      "name": "acme/support",
      "domain": "acme.example.com",
      "version": "1.0.0",
      "title": "Acme Support Automation",
      "description": "Workflows for acme.example.com",
      "path": "acme.example.com",
      "requires": { "browser": true },
      "private": false
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `version` | number | Registry format version (currently `1`) |
| `name` | string | Registry name |
| `packs` | array | Available knowledge packs |
| `packs[].path` | string | Relative path from registry root to pack directory |
| `packs[].roles` | string[] | Role identifiers from the pack manifest |

## How Knowledge Packs Improve Over Time

Knowledge packs aren't write-once artifacts. They grow through use:

- **Exploration**: Your agent documents new pages, selectors, and states as it discovers them
- **Testing**: Broken selectors and missing states get fixed when encountered
- **Development**: New API endpoints and changed UI get documented as part of dev work
- **Workflows**: Common operations get encoded as YAML workflows, speeding up future tasks

Each time your agent works with a domain, the knowledge pack for that domain gets more complete.
The `confidence` field in `_skill.md` frontmatter tracks documentation maturity (0.0–1.0).

See [Creating Packs > Learning Loop](/knowledge-packs/creating#learning-loop) for the full cycle.

## Free Publishing

Create, validate, and publish knowledge packs from the CLI. Free for everyone — like npm for domain knowledge.

```bash
sidebutton init example.com     # Scaffold a new knowledge pack
sidebutton validate             # Check structure and required files
sidebutton publish              # Publish to the registry
```

See [Contributing Knowledge Packs](/contributing#contributing-skill-packs) for guidelines and best practices.

## Knowledge Packs vs Plugins

Knowledge packs and [plugins](/plugins/overview) are both ways to extend SideButton, but they serve different purposes:

| | Knowledge Packs | Plugins |
|---|-----------------|---------|
| **Purpose** | Teach agents about a web app | Add new tool capabilities |
| **Contents** | Markdown targets, YAML workflows, role playbooks | Code handlers (bash/Node.js/Python) |
| **Requires code** | No | Yes |
| **Example** | "How to navigate Jira, what selectors to use" | "Record the screen as an MP4 video" |

If you want to teach an agent *what to do* on a domain, create a knowledge pack. If you want to give an agent *a new ability*, create a [plugin](/plugins/creating).

## Next Steps

- **[Creating Knowledge Packs](/knowledge-packs/creating)** — Build and publish your own
- **[CLI Reference](/knowledge-packs/cli)** — Install, manage, and search packs
- **[Plugins](/plugins/overview)** — Extend SideButton with custom MCP tools
