---
name: Autonomous Agents
domain: agents
path: /
tags: ["@engineering", "@dev", "@discovery", "@qa", "@documentation", "@browser-testing", "@planning", "@ops"]
learned: "2026-02-20"
confidence: 0.95
workspaces: ["Main"]
repos:
  - name: agent-runners
    remote: https://github.com/sidebutton/agent-runners.git
    path: /
    role: "Agent-VM provisioning — base/ step scripts (01–20), variants/ overlays, fleet-job-client; single source of truth for portal variant/profile/plugin display metadata (variants.json, profiles.json, plugins.json)."
  - name: the-assistant
    remote: https://github.com/maxsv0/the-assistant.git
    path: website
    role: "Fleet Control portal UI + backend — src/pages/portal/{agents,jobs,queue,automations,workflows}, src/pages/api/{agents,cloud,automations}."
---

# Autonomous Agents

Universal methodology for autonomous agents — four role playbooks (SE, QA, SD, PM) plus operational workflows for running agent fleets. App-agnostic: works with any web application or codebase.

| Role | Focus | Purpose |
|------|-------|---------|
| **SE** | Software Engineer | Pick issues, write code, create PRs, iterate on review feedback |
| **QA** | Quality Assurance | Test web applications, collect evidence, document bugs |
| **SD** | Skill Discovery | Explore product surfaces (web, API, mobile), document modules, generate knowledge packs |
| **PM** | Product Management | Epic analysis, breakdown into issues, research |

Each role file (`_roles/se.md`, `_roles/qa.md`, `_roles/sd.md`, `_roles/pm.md`) contains the complete methodology for that role type. Domain-specific knowledge packs extend these universal roles with app-specific context.

The `ops/` module contains the shared workflow catalog for dispatching and operating agent fleets at scale.

## Module Inventory

Backed by **agent-runners** (provisioning) + this pack's `ops/` workflows + the-assistant Fleet Control portal. See `COVERAGE-MAP.md` at the registry root.

| Module | Backed by | `_skill.md` | Brief Description |
|--------|-----------|:-----------:|-------------------|
| ops | `agents/ops/*.yaml` (this pack) | 90% | Fleet-dispatch workflow catalog (SE/QA/SD/PM/CSM + ops workflows) |
| runners | `agent-runners` repo | 55% 🆕 | Agent-VM provisioning: variants, Create-Agent profiles, `base/` pipeline, portal metadata source-of-truth, fleet-job-client |
| plugins | `agent-runners` `plugins.json` | 50% 🆕 | Installable MCP-tool plugin catalog (screen-record, writing-quality); loaded from `~/.sidebutton/plugins/` |
| dev-session | `agents/ops/app_edit_session.yaml` + the-assistant portal | 55% | Live editing sessions: dev server on the VM behind the preview passthrough, HMR-behind-two-proxies config, per-turn autosave + staged publish, TTL/reconnect behavior |

🆕 = added code-first 2026-06-03 from the agent-runners repo.

---

## SD Methodology — Skill Discovery & Product Documentation

A universal methodology that teaches autonomous agents how to explore, document, and test any product surface — web apps through browser automation, API services and mobile apps through the harnesses defined in the sd role playbook's *Target Resolution*. It produces **knowledge packs** — structured domain knowledge that SE and QA agents depend on.

### What SD Does

The SD role is a **meta capability**: it doesn't automate a specific app — it teaches the fleet HOW to discover and document any product. Point an SD session at a target repo or URL, and it produces a complete knowledge pack for that application.

### Three Capabilities

| Capability | Role | Output |
|------------|------|--------|
| **Skill Discovery** | SD | `_skill.md` files documenting every module: selectors, data model, states, tasks |
| **QA Testing** | QA | Test playbooks per module, evidence collection, bug documentation |
| **Role Generation** | SD | `_roles/qa.md` and `_roles/se.md` files derived from skill documentation |

### How It Works

```
1. Point SD at any web app URL
2. SD explores navigation, discovers modules, estimates features
3. SD progressively documents each module (selectors, data model, states, tasks)
4. At 75% coverage → SD generates QA and SE role files
5. QA uses generated playbooks to test the app
6. SD polishes docs based on QA findings
```

### Skill Pack Output Structure

SD produces a complete skill pack for the target app:

```
{target-domain}/
+-- skill-pack.json              # Pack manifest
+-- _skill.md                    # Root: app overview + Module Inventory table
+-- _roles/
|   +-- qa.md                    # Root QA methodology
|   +-- se.md                    # Root SE architecture
|   +-- sd.md                    # App-specific discovery notes
+-- {module}/
|   +-- _skill.md                # Module docs (9 standard sections)
|   +-- _roles/
|   |   +-- qa.md                # Per-module test playbook
|   |   +-- se.md                # Per-module code ownership
|   +-- *.yaml                   # Browser automation workflows
```

### `_skill.md` Standard Sections

Every module `_skill.md` must contain these 9 sections:

| # | Section | Content |
|---|---------|---------|
| 1 | **What This Is** | One-paragraph description of the module's purpose |
| 2 | **URL Patterns** | All URL patterns for list/detail/sub-views |
| 3 | **Page Structure** | Layout description: columns, regions, component hierarchy |
| 4 | **Key Elements** | Table: Element / Selector / Notes — every interactive element |
| 5 | **Data Model** | Table: Field / Type / Values / Default — entity schema from the UI |
| 6 | **States** | Named page states: Default, Filtered, Empty, Editing, Modal Open, Error |
| 7 | **Common Tasks** | Numbered step-by-step for each user operation |
| 8 | **Tips** | Non-obvious behaviors, shortcuts, defaults |
| 9 | **Gotchas** | Automation pitfalls: timing, portals, selector instability |

YAML frontmatter required: `name`, `domain`, `path`, `parent`, `tags`, `learned`, `last_verified`, `confidence`.

### Module Inventory Table

The root `_skill.md` tracks all modules and their documentation coverage:

```markdown
| Module | Features | `_skill.md` | `qa.md` | `se.md` | Brief Description |
|--------|:--------:|:-----------:|:-------:|:-------:|-------------------|
| login  | ~3       | 90%         | 85%     | —       | Authentication flow |
| home   | ~8       | 50%         | —       | —       | Main dashboard |
| users  | ~15      | 1%          | —       | —       | Discovered, not yet documented |
```

### Progressive Coverage Model

Coverage percentages track documentation completeness:

#### `_skill.md` Coverage

| % Range | What's Done |
|---------|-------------|
| 1% | Module discovered: name, URL, one-line description |
| 10-25% | What This Is + URL Patterns + Page Structure (skeleton) |
| 25-50% | + Key Elements table (major interactive elements) |
| 50-75% | + Data Model + States + Common Tasks |
| 75-90% | + Tips + Gotchas + all element selectors verified |
| 90-100% | All 9 sections complete, selectors verified against live app |

#### Role File Coverage

Role files are generated when `_skill.md` reaches 75%, starting at 45%:

| % Range | What's Done |
|---------|-------------|
| 45% | Generated from template: structure + test phases matching Common Tasks |
| 45-70% | + Detailed test criteria, + specific pass/fail conditions |
| 70-90% | + Automation Tips with module-specific patterns |
| 90-100% | + Edge case tests, cross-module integration tests |

### Browser Tools Reference

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `navigate(url)` | Go to page | Every module visit |
| `snapshot(includeContent=true)` | Capture DOM tree + content | Primary discovery tool |
| `screenshot()` | Visual capture | Evidence, layout verification |
| `click(ref=N)` | Click element by ref | Interaction testing |
| `type(ref=N, text)` | Type into input | Form testing |
| `scroll(direction, amount)` | Scroll page | Below-fold content |
| `get_browser_status()` | Check connection | When tools start failing |

### Getting Started

1. Install this knowledge pack: `npx sidebutton install agents`
2. Start SideButton: `npx sidebutton`
3. Connect browser (Chrome extension)
4. Navigate to target app
5. Run SD with target URL — it handles everything from there

### Requirements

- SideButton server running (`npx sidebutton`)
- Chrome with SideButton extension connected
- Target web application accessible in browser
- Claude Code or compatible LLM orchestrator
