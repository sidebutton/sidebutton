# SideButton

**Local workflow automation for your browser, terminal, and AI.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Website](https://img.shields.io/badge/website-sidebutton.com-purple)](https://sidebutton.com)
[![Docs](https://img.shields.io/badge/docs-docs.sidebutton.com-green)](https://docs.sidebutton.com)

> **[Website](https://sidebutton.com)** · **[Documentation](https://docs.sidebutton.com)** · **[GitHub](https://github.com/sidebutton/sidebutton)**

Define workflows in YAML and execute them through browser automation, shell commands, and LLM integration.

## Who is this for?

- **Power users** who repeat the same browser tasks daily (data entry, form filling, content publishing)
- **Developers** who want to automate workflows without writing code
- **AI agent builders** who need browser automation via MCP
- **Teams** who want shareable, version-controlled automation

## Why SideButton?

| | |
|---|---|
| **Reusable Workflows** | Define once in YAML, run forever. No re-prompting AI every time. |
| **Recording Mode** | Click through any task once, export as reusable automation. |
| **Embed Buttons** | Inject one-click action buttons directly into any web page. |
| **AI-Powered Steps** | LLM classification and generation built into workflows. |
| **MCP Server** | Expose workflows to AI agents like Claude Code, Cursor, VS Code. |
| **REST API** | JSON endpoints for mobile and external integrations. |

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start the server
pnpm start

# Open http://localhost:9876 in your browser
```

Or run directly with the CLI:

```bash
pnpm cli serve      # Start server with dashboard
pnpm cli list       # List available workflows
pnpm cli status     # Check server status
```

## Features

- **Config-first workflows** - Define actions in YAML files
- **Browser automation** - Navigate, click, type, scroll, extract via Chrome extension
- **Shell execution** - Run bash commands with output capture
- **Terminal workflows** - Execute commands in visible terminal windows (macOS)
- **LLM integration** - Text classification and generation via OpenAI/Anthropic
- **Control flow** - Conditionals, retries, and nested workflows
- **Recording mode** - Capture user actions to generate selectors
- **MCP Server** - Expose workflows to AI agents
- **REST API** - JSON endpoints for mobile and external integrations

## Creating Workflows

Workflows are defined as YAML files in the `workflows/` directory.

### Basic Structure

```yaml
id: hello_world
title: "Hello World"
steps:
  - type: shell.run
    cmd: "echo 'Hello from SideButton!'"
```

### Step Types

| Type | Description |
|------|-------------|
| **Browser** | |
| `browser.navigate` | Open a URL |
| `browser.click` | Click an element by selector |
| `browser.type` | Type text into an element |
| `browser.scroll` | Scroll the page |
| `browser.extract` | Extract text from an element into variable |
| `browser.extractAll` | Extract all matching elements |
| `browser.wait` | Wait for element or fixed time delay |
| `browser.exists` | Check if element exists |
| `browser.hover` | Position cursor on element |
| `browser.key` | Send keyboard keys |
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

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     @sidebutton/server                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │          Fastify HTTP + WebSocket Server (port 9876)     │  │
│  │                                                          │  │
│  │  GET  /            → Dashboard (Svelte)                  │  │
│  │  GET  /ws          → Chrome Extension WebSocket          │  │
│  │  POST /mcp         → MCP JSON-RPC (AI Agents)            │  │
│  │  GET  /api/*       → REST API                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                 @sidebutton/core                           │  │
│  │                                                           │  │
│  │  - Workflow types & parser (YAML)                        │  │
│  │  - Step executors (20 step types)                        │  │
│  │  - Variable interpolation                                │  │
│  │  - Execution context & events                            │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         ▲                       ▲                       ▲
         │ WebSocket             │ HTTP POST             │ REST
         ▼                       ▼                       ▼
┌─────────────────┐   ┌─────────────────┐   ┌───────────────────┐
│ Chrome Extension│   │   Claude Code   │   │   Mobile App      │
│ (Browser Auto)  │   │   (MCP Client)  │   │   (REST Client)   │
└─────────────────┘   └─────────────────┘   └───────────────────┘
```

### Project Structure

```
sidebutton/
├── packages/
│   ├── core/              # @sidebutton/core
│   │   └── src/
│   │       ├── types.ts       # Workflow types
│   │       ├── parser.ts      # YAML loader
│   │       ├── executor.ts    # Workflow runner
│   │       └── steps/         # Step implementations
│   ├── server/            # @sidebutton/server
│   │   ├── bin/               # CLI entry point
│   │   └── src/
│   │       ├── server.ts      # Fastify HTTP server
│   │       ├── extension.ts   # WebSocket client
│   │       ├── mcp/           # MCP handler
│   │       └── cli.ts         # Commander CLI
│   └── dashboard/         # Svelte web UI
│       └── src/
│           ├── App.svelte
│           └── lib/
├── extension/             # Chrome extension
├── workflows/             # Public workflow library
├── actions/               # User-created workflows
└── run_logs/              # Execution history
```

## Browser Extension Setup

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Navigate to a website and click the extension icon
6. Click **"Connect This Tab"**

## MCP Server (AI Agent Integration)

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

### Available MCP Tools

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

## Environment Variables

| Variable | Required For | Description |
|----------|--------------|-------------|
| `OPENAI_API_KEY` | `llm.*` steps | OpenAI API key for LLM workflows |
| `ANTHROPIC_API_KEY` | `llm.*` steps | Anthropic API key (alternative) |

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start server locally
pnpm start

# CLI commands
pnpm cli list          # List workflows
pnpm cli status        # Check status
pnpm cli serve         # Start server
```

### Watch Mode

```bash
# Full dev mode (all packages with hot reload)
pnpm dev

# Individual components
pnpm dev:server        # Server with auto-restart on :9876
pnpm dev:dashboard     # Dashboard with HMR on :5173
pnpm dev:core          # Core library watch build
```

In dev mode:
- **Dashboard** runs at `http://localhost:5173` with Vite HMR
- **Server** auto-restarts on code changes via tsx watch
- **API proxy** forwards `/api/*` and `/ws/*` from dashboard to server

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

Apache-2.0
