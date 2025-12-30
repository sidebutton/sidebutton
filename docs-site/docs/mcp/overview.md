# MCP Overview

The Model Context Protocol (MCP) enables AI assistants to connect to SideButton for browser automation.

## What is MCP?

MCP is an open standard that lets AI tools like Claude, Cursor, and VS Code Copilot interact with external services. With MCP, you can:

- Run workflows from natural language
- Control the browser through AI conversations
- Automate complex tasks with AI assistance

## Architecture

```
┌──────────────────────┐     MCP Protocol    ┌───────────────────┐
│    AI Assistant      │◄──────────────────►│    SideButton     │
│  (Claude/Cursor)     │   HTTP POST /mcp    │   (port 9876)     │
└──────────────────────┘                     └─────────┬─────────┘
                                                       │
                                             ┌─────────▼─────────┐
                                             │  Chrome Extension │
                                             │   (WebSocket)     │
                                             └───────────────────┘
```

SideButton exposes:
- **15 MCP tools** for workflow and browser control
- **Streamable HTTP transport** (protocol version 2025-06-18)
- **JSON-RPC 2.0** protocol

## Supported AI Tools

| Tool | Config Location | Status |
|------|-----------------|--------|
| Claude Code | `~/.claude/settings.json` | ✅ Fully supported |
| Cursor | `~/.cursor/mcp.json` | ✅ Fully supported |
| VS Code (Copilot) | `.vscode/mcp.json` | ✅ Supported |
| Windsurf | Settings UI | ✅ Supported |

[Setup instructions →](/mcp-setup)

## Tool Categories

### Workflow Tools

Execute and manage workflows:

| Tool | Description |
|------|-------------|
| `run_workflow` | Execute a workflow by ID |
| `list_workflows` | List available workflows |
| `get_workflow` | Get workflow YAML definition |
| `get_run_log` | Get execution details |
| `list_run_logs` | List recent runs |

### Browser Control Tools

Direct browser automation:

| Tool | Description |
|------|-------------|
| `get_browser_status` | Check extension connection |
| `navigate` | Open a URL |
| `snapshot` | Get page structure (YAML) |
| `click` | Click an element |
| `type` | Type into an element |
| `scroll` | Scroll the page |
| `extract` | Get text from element |
| `screenshot` | Capture page image |
| `hover` | Position cursor |
| `capture_page` | Get all selectors |

## How It Works

### 1. AI Sends Request

When you say "Run the hello_world workflow", the AI:
1. Calls the `run_workflow` tool
2. Passes `{"workflow_id": "hello_world"}`

### 2. SideButton Executes

The server:
1. Loads the workflow YAML
2. Executes each step
3. Returns results

### 3. AI Shows Results

The AI receives:
- Execution status
- Run ID for details
- Any output messages

## Example Conversation

**You:** Run the Wikipedia summary workflow on the current page

**Claude:** I'll run the Wikipedia summary workflow.

*[Calls run_workflow with workflow_id: "wikipedia_summarize"]*

The workflow completed successfully. Here's the summary:

> Node.js is an open-source, cross-platform JavaScript runtime environment that executes code outside a web browser...

## When to Use MCP vs Embed Buttons

| Use Case | Best Option |
|----------|-------------|
| Quick actions on specific pages | Embed Buttons |
| Complex multi-step tasks | MCP + Workflows |
| Ad-hoc browser control | MCP Browser Tools |
| Repeated tasks | Workflows (either method) |
| AI-assisted exploration | MCP Browser Tools |

## Security

### Local Only

The MCP server only listens on `localhost:9876`. It cannot be accessed from external networks.

### No Credentials Stored

Workflows don't store credentials. They run with your browser's existing session.

### Domain Policies

Workflows can restrict which domains they access:

```yaml
policies:
  allowed_domains:
    - github.com
```

## Troubleshooting

### AI can't connect

1. Is the server running?
   ```bash
   curl http://localhost:9876/health
   ```

2. Check config file syntax

3. Restart the AI tool

### Tools not appearing

1. Verify URL is `http://localhost:9876/mcp`
2. Check server logs for errors
3. Test tools/list endpoint:
   ```bash
   curl -X POST http://localhost:9876/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

### Browser automation fails

1. Check extension is connected
2. Use `get_browser_status` to verify
3. Reconnect extension if needed

## Next Steps

- **[MCP Setup](/mcp-setup)** — Configure your AI tool
- **[MCP Tools Reference](/mcp/tools)** — All tools detailed
- **[Browser Tools](/mcp/browser)** — Browser automation
