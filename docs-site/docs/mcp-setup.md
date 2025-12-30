# MCP Setup

Connect AI tools like Claude Code, Cursor, VS Code, and Windsurf to SideButton via the Model Context Protocol (MCP).

## What is MCP?

MCP (Model Context Protocol) is a standard that lets AI assistants connect to external tools. With MCP, you can:

- Tell Claude or Cursor to "run my workflow"
- Let AI control your browser for testing
- Automate tasks through natural language

## Prerequisites

- SideButton server running (`npx @sidebutton/server serve`)
- Your AI tool of choice installed

## Claude Code

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

After adding, restart Claude Code. You should see "sidebutton" in your MCP servers.

### Verify Connection

In Claude Code, try:

```
List available workflows from SideButton
```

Claude should respond with a list of workflows from your library.

## Cursor

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

Restart Cursor after adding the configuration.

## VS Code (GitHub Copilot)

Add to `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "sidebutton": {
      "type": "http",
      "url": "http://localhost:9876/mcp"
    }
  }
}
```

## Windsurf

Open Windsurf Settings → Cascade → MCP Servers → "View raw config", then add:

```json
{
  "mcpServers": {
    "sidebutton": {
      "serverUrl": "http://localhost:9876/mcp"
    }
  }
}
```

## Available MCP Tools

Once connected, AI tools can use these capabilities:

### Workflow Tools

| Tool | Description |
|------|-------------|
| `run_workflow` | Execute a workflow by ID |
| `list_workflows` | List all available workflows |
| `get_workflow` | Get workflow YAML definition |
| `get_run_log` | Get execution log for a run |
| `list_run_logs` | List recent execution logs |

### Browser Control Tools

| Tool | Description |
|------|-------------|
| `get_browser_status` | Check extension connection |
| `navigate` | Open a URL in the browser |
| `snapshot` | Get page structure as YAML |
| `click` | Click an element |
| `type` | Type text into an element |
| `scroll` | Scroll the page |
| `extract` | Extract text from element |
| `screenshot` | Capture page screenshot |
| `hover` | Hover over an element |
| `capture_page` | Get all selectors on page |

## Example Prompts

Once configured, try these prompts in your AI tool:

### List Workflows

```
What workflows are available in SideButton?
```

### Run a Workflow

```
Run the hello_world workflow from SideButton
```

### Browser Automation

```
Navigate to https://wikipedia.org and take a screenshot
```

### Extract Content

```
Go to the Wikipedia article about JavaScript and extract the first paragraph
```

### Create Automation

```
Help me create a workflow that summarizes any webpage I'm on
```

## Troubleshooting

### "Server not found" or "Connection refused"

1. Make sure the server is running:
   ```bash
   curl http://localhost:9876/health
   ```

2. Check the URL in your config matches exactly

### "Browser not connected"

The browser extension needs to be connected for browser automation:

1. Install the [Chrome extension](/extension)
2. Click "Connect This Tab" on any webpage
3. Try again

### Tools not appearing

1. Restart your AI tool after editing config
2. Check the config file syntax (valid JSON)
3. Look for errors in the AI tool's console/logs

### Workflow execution fails

Check the run log for details:

```
Get the run log for run_id: <run_id>
```

Common issues:
- Missing parameters
- Browser not connected
- Selector not found on page

## Advanced: Direct API Access

SideButton uses the MCP Streamable HTTP transport (protocol version 2025-06-18). For programmatic access, POST JSON-RPC requests to `/mcp`:

```bash
# List tools
curl -X POST http://localhost:9876/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Run a workflow
curl -X POST http://localhost:9876/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"tools/call",
    "params":{
      "name":"run_workflow",
      "arguments":{"workflow_id":"hello_world"}
    }
  }'
```

The server also supports the older HTTP+SSE transport (2024-11-05) via `/sse` and `/message` endpoints for backwards compatibility.

## Next Steps

- **[MCP Tools Reference](/mcp/tools)** — Detailed tool documentation
- **[Browser Tools](/mcp/browser)** — Browser automation via MCP
- **[Workflow Examples](/workflows/examples)** — Copy-paste workflows
