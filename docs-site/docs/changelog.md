# Changelog

All notable changes to SideButton.

## [1.0.11] - 2026-03-14

### Highlights

- **45 step types** — added issues, git, chat, and data step categories (42 implemented, 3 chat pending)
- **Skill pack CLI** — `sidebutton init`, `validate`, and `publish` for creating and sharing skill packs
- **Context system** — persona, roles, and targets injected into every LLM call via both REST and MCP
- **Community roles** — 15 built-in role templates (SE, QA, PM, SD, HR, Sales, and more)
- **Abstract providers** — issues and git steps work across Jira, GitHub, and other platforms via auto-detected providers
- **Delay constants** — named delays (`small`, `mid`, `large`) with jitter for human-like timing

### New Step Types

- `browser.extractMap` — extract structured data with field mapping
- `browser.fill` — set input values directly (React-compatible)
- `browser.select_option` — select dropdown options by value or label
- `browser.scrollIntoView` — scroll elements into viewport
- `browser.injectCSS` / `browser.injectJS` — inject styles and scripts
- `browser.snapshot` — capture accessibility tree for LLM analysis
- `llm.decide` — LLM picks from a list of actions based on context
- `data.get` — get list item by index
- `variable.set` — set variables directly
- `issues.*` — create, get, search, attach, transition, comment (6 types)
- `git.*` — listPRs, getPR, createPR, listIssues, getIssue (5 types)
- `chat.*` — listChannels, readChannel, readThread (3 types, pending provider)

---

## [1.0.0] - 2025-12-27

### Initial Release

The first public release of SideButton.

#### Features

- **Workflow Engine**
  - 20 step types (browser, shell, LLM, control flow)
  - YAML-based workflow definitions
  - Variable interpolation with <code v-pre>{{variable}}</code> syntax
  - Nested workflow support via `workflow.call`

- **Browser Automation**
  - Chrome extension with WebSocket connection
  - Navigate, click, type, scroll, extract
  - Recording mode for capturing actions
  - Embed buttons for in-page automation

- **MCP Server**
  - Tools for workflow and browser control
  - Compatible with Claude Code, Cursor, VS Code, Windsurf
  - SSE transport over HTTP

- **Dashboard**
  - Svelte-based web UI
  - Workflow management
  - Recording management
  - Run log inspection
  - Settings configuration

- **Desktop App**
  - Electron-based native app
  - macOS, Windows, Linux support

- **LLM Integration**
  - OpenAI and Anthropic support
  - `llm.classify` for categorization
  - `llm.generate` for text generation
  - User contexts for customization

#### Workflow Library

Includes example workflows for:
- Wikipedia summarization
- News site aggregation
- GitHub release creation
- General browser automation

---

## Versioning

This project uses [Semantic Versioning](https://semver.org/):

- **MAJOR:** Incompatible API changes
- **MINOR:** New functionality (backward-compatible)
- **PATCH:** Bug fixes (backward-compatible)

## Reporting Issues

Found a bug? [Open an issue](https://github.com/sidebutton/sidebutton/issues/new) on GitHub.
