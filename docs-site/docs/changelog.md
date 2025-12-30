# Changelog

All notable changes to SideButton.

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
