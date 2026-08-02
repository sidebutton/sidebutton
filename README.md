# SideButton

**Open-source AI agent platform for agentic coding — MCP server, knowledge packs, and AI workflow automation.**

[![npm](https://img.shields.io/npm/v/sidebutton)](https://www.npmjs.com/package/sidebutton)
[![License](https://img.shields.io/badge/license-Apache--2.0%20%2B%20FSL--1.1-blue.svg)](LICENSING.md)

> **[Website](https://sidebutton.com)** · **[Documentation](https://docs.sidebutton.com)**

<p align="center">
  <a href="https://sidebutton.com">
    <img src="https://sidebutton.com/media/sidebutton-oss-stack.png" alt="SideButton open-source AI agent platform: MCP server, workflow engine, knowledge packs" width="700" />
  </a>
  <br />
  <sub>Release announcement: <a href="https://sidebutton.com/media/sidebutton-open-source-platform-release">SideButton: Open Source AI Agent Platform</a></sub>
</p>

AI agent platform with 28 AI agent tools and 41 workflow step types. Run AI coding agents with agentic workflows, knowledge packs, and real browser control. Connect Claude Code, Codex, Cursor, ChatGPT, or any MCP client.

```bash
npx sidebutton@latest
# Dashboard at http://localhost:9876
```

## What you get

| | |
|---|---|
| **MCP Server** | 28 AI agent tools for browser control, workflow execution, knowledge pack access. Stdio and SSE transports. |
| **REST API** | 60+ endpoints. Trigger workflows remotely from webhooks, cron jobs, mobile apps, or other agents. |
| **Workflow Engine** | AI workflow automation with 41 step types — browser, git, issue tracking, LLM, shell, control flow. Define agentic workflows in YAML. |
| **Knowledge Packs** | Installable domain knowledge — CSS selectors, data models, state machines. Role playbooks turn coding agents into an AI software engineer, QA, or PM. |
| **Chrome Extension** | 40+ browser commands. Real DOM access via WebSocket, not screenshots. Recording mode. |
| **Dashboard** | Svelte UI — workflow browser, run logs, skill pack manager, system status. |

## Quick Start

```bash
# Install and start
npx sidebutton@latest

# Or from source
pnpm install && pnpm build && pnpm start

# Open http://localhost:9876
```

### CLI

```bash
pnpm cli serve          # Start server with dashboard
pnpm cli serve --stdio  # Start with stdio transport (for Claude Desktop)
pnpm cli list           # List available workflows
pnpm cli status         # Check server status

# Skill pack management
pnpm cli registry add <path|url>   # Install skill packs from a registry
pnpm cli registry update [name]    # Update installed packs
pnpm cli registry remove <name>    # Uninstall packs and remove registry
pnpm cli search [query]            # Search available skill packs

# Creating skill packs
pnpm cli init [domain]             # Scaffold a new skill pack
pnpm cli validate [path]           # Validate pack structure
pnpm cli publish [source]          # Publish to a registry
```

## MCP Server

SideButton is an open-source [MCP server for AI coding agents](https://sidebutton.com/mcp). Agents connect to it directly for browser control, workflow automation, and domain knowledge.

Works with **Claude Code**, **Codex**, **Cursor**, **Claude Desktop**, **VS Code**, **Windsurf**, **ChatGPT** — any MCP client.

### Claude Code

```bash
claude mcp add sidebutton --transport http http://localhost:9876/mcp
```

Persists to `~/.claude.json`; add `--scope project` to write `./.mcp.json` instead. Full guide: [Claude Code MCP setup](https://sidebutton.com/mcp/claude-code).

### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.sidebutton]
command = "sidebutton"
args = ["serve", "--stdio"]
```

Full guide: [OpenAI Codex MCP setup](https://sidebutton.com/mcp/codex).

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sidebutton": {
      "command": "npx",
      "args": ["sidebutton", "--stdio"]
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "sidebutton": {
      "url": "http://localhost:9876/mcp"
    }
  }
}
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `run_workflow` | Execute a workflow by ID |
| `get_run_log` | Get execution log for a run |
| `list_workflows` | List all available workflows |
| `get_workflow` | Get workflow YAML definition |
| `list_run_logs` | List recent workflow executions |
| `publish_artifact` | Publish evidence (screenshots, reports) from a session |
| `get_browser_status` | Check browser extension connection |
| `capture_page` | Capture selectors from current page |
| `navigate` | Navigate browser to URL |
| `snapshot` | Get page accessibility snapshot |
| `click` | Click an element |
| `type` | Type text into an element |
| `press_key` | Send keyboard keys |
| `scroll` | Scroll the page |
| `extract` | Extract text from element |
| `screenshot` | Capture page screenshot |
| `select_option` | Select dropdown option |
| `fill` | Fill input value (React-compatible) |
| `wait` | Wait for element or delay |
| `exists` | Check if element exists |
| `extract_all` | Extract all matching elements |
| `extract_map` | Extract structured data from repeated elements |
| `scroll_into_view` | Scroll element into viewport |
| `hover` | Hover over element |
| `evaluate` | Execute JavaScript in browser |
| `browser_batch` | Run a sequence of browser actions in one call |
| `set_basic_auth` | Set HTTP Basic Auth credentials for the connected tab |
| `clear_basic_auth` | Clear stored HTTP Basic Auth credentials |

## REST API

60+ JSON endpoints for external integrations. Same workflows available via MCP locally and via REST remotely.

```bash
# Run a workflow
curl -X POST http://localhost:9876/api/workflows/check_ticket/run \
  -H "Content-Type: application/json" \
  -d '{"params": {"ticket_id": "PROJ-123"}}'

# List workflows
curl http://localhost:9876/api/workflows

# Get run log
curl http://localhost:9876/api/runs/latest
```

Trigger workflows from webhooks, cron jobs, mobile apps, or other agents on different machines.

## Workflow Engine

YAML-first orchestration for agentic workflows. 41 step types across 8 families:

### Step Types

| Family | Steps |
|------|-------|
| `browser.*` (17) | navigate, click, type, fill, extract, extractAll, extractMap, snapshot, wait, exists, hover, key, scroll, scrollIntoView, select_option, injectCSS, injectJS |
| `git.*` (5) | createPR, getPR, listPRs, getIssue, listIssues |
| `issues.*` (6) | create, get, search, comment, attach, transition |
| `llm.*` (3) | classify, decide, generate |
| `control.*` (4) | if, foreach, retry, stop |
| `shell` / `terminal` (3) | shell.run, terminal.open, terminal.run |
| `data.*` (2) | first, get |
| `workflow.call` (1) | Call another workflow with parameters |

LLM steps work with Ollama (local), OpenAI, and Anthropic.

### Example

```yaml
id: check_ticket_status
title: "Check Jira ticket and classify"
steps:
  - type: browser.navigate
    url: "https://your-org.atlassian.net/browse/{{ticket_id}}"
  - type: browser.extract
    selector: "[data-testid='status-field']"
    as: current_status
  - type: control.if
    condition: "{{current_status}} != 'Done'"
    then:
      - type: llm.classify
        prompt: "Should this ticket be closed? Context: {{current_status}}"
        classes: [close, keep_open]
        as: decision
```

### Variable Interpolation

Use `{{variable}}` syntax to reference extracted values or parameters:

```yaml
steps:
  - type: browser.extract
    selector: ".username"
    as: user
  - type: shell.run
    cmd: "echo 'Hello, {{user}}!'"
```

## Knowledge Packs

Installable domain knowledge (skill packs) per web app or domain. Knowledge packs power AI code review, automated testing, and enterprise AI agent deployments.

Also referred to as skill packs in code and CLI commands.

- **Selectors** — CSS selectors for UI elements
- **Data models** — entity types, fields, relationships, valid states
- **State machines** — valid transitions per state
- **Role playbooks** — role-specific procedures (QA, SE, PM, SD)
- **Common tasks** — step-by-step procedures, gotchas, edge cases

```bash
sidebutton install github.com
sidebutton install atlassian.net
```

11 domains, 28+ modules published. Open registry — build and share packs for any web app.

## Chrome Extension

Install the **[SideButton Chrome Extension](https://chromewebstore.google.com/detail/sidebutton/odaefhmdmgijnhdbkfagnlnmobphgkij)** from the Chrome Web Store.

- 40+ browser commands — navigate, click, type, extract, scroll, wait, snapshot
- Real DOM access via CSS selectors — not pixel coordinates, not screenshots
- Recording mode — capture manual actions as workflows
- Embed buttons — inject action buttons into any web page
- WebSocket connection — stable reconnection, works with local or remote server

After installing:
1. Navigate to any website
2. Click the SideButton extension icon
3. Click **"Connect This Tab"**

## Dashboard & Observability

Svelte UI at `http://localhost:9876`:

- Workflow browser — list, search, run
- Run logs — step-by-step execution traces with timing, variables, errors
- Skill pack manager — install, browse, inspect
- System status — extension connection, LLM config, server health

SideButton handles multi-agent orchestration — from workflow execution to knowledge injection.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          @sidebutton/server                               │
│                                                                          │
│  ┌─────────────────────┐   ┌──────────────────────────────────────────┐  │
│  │  stdio Transport    │   │    Fastify HTTP + WebSocket (port 9876)  │  │
│  │  ─────────────────  │   │    ────────────────────────────────────  │  │
│  │  stdin → JSON-RPC   │   │  GET  /        → Dashboard (Svelte)      │  │
│  │  stdout ← JSON-RPC  │   │  GET  /ws      → Chrome Extension WS     │  │
│  │  (Claude Desktop)   │   │  POST /mcp     → MCP JSON-RPC (SSE)      │  │
│  └──────────┬──────────┘   │  GET  /api/*   → REST API                │  │
│             │              └──────────────────────┬───────────────────┘  │
│             │                                     │                      │
│             └──────────────────┬──────────────────┘                      │
│                                ▼                                         │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                       @sidebutton/core                              │  │
│  │                                                                     │  │
│  │  - Workflow types & parser (YAML)                                  │  │
│  │  - Step executors (41 step types)                                  │  │
│  │  - Variable interpolation                                          │  │
│  │  - Execution context & events                                      │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
      ▲                ▲                      ▲                      ▲
      │ stdio          │ WebSocket            │ HTTP POST            │ REST
      ▼                ▼                      ▼                      ▼
┌──────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌───────────────────┐
│Claude Desktop│ │ Chrome Extension│ │   Claude Code   │ │   Mobile App      │
│ (MCP stdio)  │ │ (Browser Auto)  │ │   (MCP SSE)     │ │   (REST Client)   │
└──────────────┘ └─────────────────┘ └─────────────────┘ └───────────────────┘
```

### Project Structure

```
sidebutton/
├── packages/
│   ├── core/              # @sidebutton/core — workflow engine
│   │   └── src/
│   │       ├── types.ts       # Workflow types
│   │       ├── parser.ts      # YAML loader
│   │       ├── executor.ts    # Workflow runner
│   │       └── steps/         # Step implementations
│   ├── server/            # @sidebutton/server — MCP + HTTP + CLI
│   │   ├── bin/               # CLI entry point
│   │   └── src/
│   │       ├── server.ts      # Fastify HTTP server
│   │       ├── stdio-mode.ts  # stdio transport entry point
│   │       ├── extension.ts   # WebSocket client
│   │       ├── mcp/           # MCP handlers
│   │       │   ├── handler.ts    # MCP JSON-RPC logic
│   │       │   ├── stdio.ts      # stdio transport adapter
│   │       │   └── tools.ts      # Tool definitions
│   │       └── cli.ts         # Commander CLI
│   └── dashboard/         # Svelte web UI
│       └── src/
│           ├── App.svelte
│           └── lib/
├── extension/             # Chrome extension
├── workflows/             # Public workflow library
├── actions/               # User-created workflows
├── skills/                # Installed skill packs
└── run_logs/              # Execution history
```

## Environment Variables

| Variable | Required For | Description |
|----------|--------------|-------------|
| `OPENAI_API_KEY` | `llm.*` steps | OpenAI API key for LLM workflows |
| `ANTHROPIC_API_KEY` | `llm.*` steps | Anthropic API key (alternative) |

## Development

```bash
pnpm install       # Install dependencies
pnpm build         # Build all packages
pnpm start         # Start server
pnpm cli list      # List workflows
pnpm cli status    # Check status
```

### Watch Mode

```bash
pnpm dev              # Full dev mode (all packages)
pnpm dev:server       # Server with auto-restart on :9876
pnpm dev:dashboard    # Dashboard watch build
pnpm dev:core         # Core library watch build
```

## Platform Automation Disclaimer

SideButton is a general-purpose browser automation framework. When automating third-party platforms:

- **Review Terms of Service:** Many platforms prohibit or restrict automation. You are responsible for complying with the terms of any platform you automate.
- **Account Risk:** Automation may result in account restrictions or suspension on some platforms.
- **Use Responsibly:** Only automate actions you would perform manually. Respect rate limits and platform guidelines.

**The authors do not endorse or encourage violations of third-party terms of service.**

## License

This project uses mixed licensing — see [LICENSING.md](LICENSING.md):

- **Engine, server, CLI, dashboard** — Apache-2.0
- **Browser extension** — FSL-1.1-Apache-2.0 (converts to Apache-2.0 on 2029-03-15)
