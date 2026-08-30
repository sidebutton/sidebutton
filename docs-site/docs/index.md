---
layout: doc
---

# SideButton MCP Server

Open source platform for AI agents with structured roles, skills, and domain knowledge.

<a href="/sidebutton-oss-stack.png" target="_blank">
  <img src="/sidebutton-oss-stack.png" alt="The AI Agent Stack — SideButton" style="max-width: 600px; width: 100%; border-radius: 8px; border: 1px solid var(--vp-c-divider); margin: 1.5rem 0;" />
</a>

## What is SideButton?

SideButton is an **open-source platform that packages domain knowledge for AI agents**. Install knowledge packs for web apps, automate with YAML workflows, and give AI agents real browser control via MCP.

- **Install knowledge packs** — pre-built bundles of domain knowledge, workflows, and role playbooks for specific web apps
- **Define reusable workflows** in YAML with 46 step types (browser, shell, LLM, issues, git, control flow)
- **Orchestrate cloud agents** — [chain workflows into playbooks](/workflows/orchestration) that work tickets end-to-end behind verdict gates
- **Connect AI agents via MCP** — Claude Code, Cursor, or any MCP client gets real browser control
- **Extend with plugins** — add custom MCP tools in any language (bash, Node.js, Python)

## Latest release — Screenshot Capture Comes to Workflows and MCP

*2026-08-27 · workflow & MCP release · [all release posts](/releases/)*

A workflow or an MCP client can now write a screenshot straight to a file — cropped, redacted, and never seen by the agent's own context.

### Screenshots straight from a workflow or MCP call

The new `browser.screenshot` step captures the page — or a `selector` / `ref` / `region` crop of it — and writes a PNG to a file on the machine running SideButton, returning only the path it wrote. The `screenshot` MCP tool gained the same `path` option: pass it and the tool writes the file instead of returning image bytes; leave it out and nothing changes for existing callers. A bundled `docs_screenshot` workflow wires the whole sequence together as a ready-made recipe. Step types now number 46 (43 implemented).

### Redact before the pixel is captured

The new `inject_css` MCP tool injects a CSS rule into the page — the main use is blurring or hiding sensitive elements right before a screenshot, so no unredacted image ever exists. Both tools are batchable, so a single `browser_batch` call can navigate, blur the sensitive selectors, wait, and screenshot-to-file in one round trip. A `{{param}}` that never got a value now fails the step loudly instead of being treated as a literal string — previously a missing redaction value silently styled nothing, and the run reported success over an unredacted shot.

### Nothing escapes the sandbox

Every path either tool writes is contained to the home directory of the user running SideButton — `..` traversal and symlinks that escape it are rejected, matching the rule `publish_artifact` already enforces. `publish_artifact` now also expands a leading `~/`, so a path a screenshot step just wrote can be published verbatim.

→ [Read the full post](/releases/2026-08-week35) · self-hosted releases: [SideButton 1.5.5](/releases/1-5-5) · [Changelog](/changelog)

## Next Steps

- [Installation](/installation) — Get SideButton running
- [Knowledge Packs](/knowledge-packs/overview) — Domain knowledge for AI agents
- [MCP Setup](/mcp-setup) — Connect Claude Code or Cursor
- [Connect Claude Subscription](/cloud/claude-subscription) — Sign a cloud agent's Claude Code into your Claude account
- [Orchestrating Agents](/workflows/orchestration) — Dispatch workflows and playbooks to a cloud agent fleet
- [Working with Tasks](/workflows/tasks) — Batch a whole epic into the pool and approve it
- [First Workflow](/first-workflow) — Run your first automation
- [Community Roles](/community-roles) — AI agent role templates
