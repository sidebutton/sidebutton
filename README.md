# SideButton

**Open-source orchestration and domain knowledge for AI agents.**

[![License](https://img.shields.io/badge/license-Apache--2.0%20%2B%20FSL--1.1-blue.svg)](LICENSING.md)
[![Website](https://img.shields.io/badge/website-sidebutton.com-purple)](https://sidebutton.com)
[![Docs](https://img.shields.io/badge/docs-docs.sidebutton.com-green)](https://docs.sidebutton.com)

> **[Website](https://sidebutton.com)** · **[Documentation](https://docs.sidebutton.com)** · **[GitHub](https://github.com/sidebutton/sidebutton)**

<p align="center">
  <a href="https://sidebutton.com/media/sidebutton-open-source-platform-release">
    <img src="https://sidebutton.com/media/sidebutton-agent-stack.png" alt="The AI Agent Stack — SideButton" width="700" />
  </a>
</p>

MCP server + Chrome extension + YAML workflow engine + skill packs. Connect to Claude Code, Cursor, ChatGPT, or any MCP client. Run locally or deploy on any server.

```bash
npx sidebutton@latest
# Dashboard at http://localhost:9876
```

## What you get

| | |
|---|---|
| **MCP Server** | 40+ tools for browser control, workflow execution, skill pack access. Stdio and SSE transports. |
| **REST API** | 60+ endpoints. Trigger workflows remotely from webhooks, cron jobs, mobile apps, or other agents. |
| **Workflow Engine** | YAML DSL with 34+ step types — browser, shell, LLM, control flow. Deterministic execution. |
| **Skill Packs** | Installable domain knowledge — CSS selectors, data models, state machines, role playbooks per web app. |
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

SideButton is an MCP server. AI tools connect to it directly.

Works with **Claude Code**, **Cursor**, **Claude Desktop**, **VS Code**, **Windsurf**, **ChatGPT** — any MCP client.

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "sidebutton": {
      "type": "sse",
      "url": "http://localhost:9876/mcp"
    }
  }
}
```

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
| `list_workflows` | List all available workflows |
| `get_workflow` | Get workflow YAML definition |
| `get_run_log` | Get execution log for a run |
| `list_run_logs` | List recent workflow executions |
| `get_browser_status` | Check browser extension connection |
| `capture_page` | Capture selectors from current page |
| `navigate` | Navigate browser to URL |
| `snapshot` | Get page accessibility snapshot |
| `click` | Click an element |
| `type` | Type text into an element |
| `scroll` | Scroll the page |
| `screenshot` | Capture page screenshot |
| `hover` | Hover over element |
| `extract` | Extract text from element |
| `extract_all` | Extract all matching elements |
| `extract_map` | Extract structured data from repeated elements |
| `select_option` | Select dropdown option |
| `fill` | Fill input value (React-compatible) |
| `press_key` | Send keyboard keys |
| `scroll_into_view` | Scroll element into viewport |
| `evaluate` | Execute JavaScript in browser |
| `exists` | Check if element exists |
| `wait` | Wait for element or delay |
| `check_writing_quality` | Evaluate text quality |

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

YAML-first orchestration. 34+ step types:

### Step Types

| Type | Description |
|------|-------------|
| **Browser** | |
| `browser.navigate` | Open a URL |
| `browser.click` | Click an element by selector |
| `browser.type` | Type text into an element |
| `browser.fill` | Fill input value (React-compatible) |
| `browser.scroll` | Scroll the page |
| `browser.extract` | Extract text from element into variable |
| `browser.extractAll` | Extract all matching elements |
| `browser.extractMap` | Extract structured data from repeated elements |
| `browser.wait` | Wait for element or fixed delay |
| `browser.exists` | Check if element exists |
| `browser.hover` | Position cursor on element |
| `browser.key` | Send keyboard keys |
| `browser.snapshot` | Capture accessibility snapshot |
| `browser.injectCSS` | Inject CSS styles into page |
| `browser.injectJS` | Execute JavaScript in page |
| `browser.select_option` | Select dropdown option |
| `browser.scrollIntoView` | Scroll element into view |
| **Shell** | |
| `shell.run` | Execute a bash command |
| `terminal.open` | Open a visible terminal window (macOS) |
| `terminal.run` | Run command in terminal window |
| **LLM** | |
| `llm.classify` | Structured classification with categories |
| `llm.generate` | Free-form text generation |
| **Control Flow** | |
| `control.if` | Conditional branching |
| `control.retry` | Retry with backoff |
| `control.stop` | End workflow with message |
| `workflow.call` | Call another workflow with parameters |
| **Data** | |
| `data.first` | Extract first item from list |

LLM steps work with Ollama (local), OpenAI, Anthropic, and Google.

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

## Skill Packs

Installable domain knowledge per web app or domain:

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

Install from the **[Chrome Web Store](https://chromewebstore.google.com/detail/sidebutton/odaefhmdmgijnhdbkfagnlnmobphgkij)**.

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
│  │  - Step executors (37 step types)                                  │  │
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

## Legal

- [Terms of Service](https://sidebutton.com/terms)
- [Privacy Policy](https://sidebutton.com/privacy)

## License

This project uses mixed licensing. See [LICENSING.md](LICENSING.md) for details.

- **Engine, server, CLI, dashboard** — [Apache-2.0](LICENSE)
- **Browser extension** — [FSL-1.1-Apache-2.0](https://fsl.software) (converts to Apache-2.0 on 2029-03-15)
