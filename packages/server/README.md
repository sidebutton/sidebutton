# @sidebutton/server

[SideButton](https://sidebutton.com) server with MCP integration, REST API, and web dashboard for workflow automation.

[![npm version](https://img.shields.io/npm/v/@sidebutton/server.svg)](https://www.npmjs.com/package/@sidebutton/server)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/sidebutton/sidebutton/blob/main/LICENSE)

## Installation

```bash
npm install @sidebutton/server
```

## Quick Start

```bash
# Start the server
npx sidebutton serve

# Open http://localhost:9876
```

## Features

- **Web Dashboard** - Visual workflow management UI
- **MCP Server** - Model Context Protocol for AI agents (Claude Code, Cursor)
- **REST API** - JSON endpoints for mobile and external integrations
- **Chrome Extension** - Browser automation via WebSocket
- **CLI** - Command-line interface for workflow management

## CLI Commands

```bash
sidebutton serve          # Start server on port 9876
sidebutton list           # List available workflows
sidebutton run <id>       # Run a workflow by ID
sidebutton status         # Check server status
```

## MCP Integration

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

## MCP Tools

| Tool | Description |
|------|-------------|
| `run_workflow` | Execute a workflow by ID |
| `list_workflows` | List available workflows |
| `get_workflow` | Get workflow YAML definition |
| `get_run_log` | Get execution log |
| `list_run_logs` | List recent executions |
| `get_browser_status` | Check extension connection |
| `capture_page` | Capture page selectors |
| `navigate` | Navigate browser to URL |
| `snapshot` | Get accessibility tree |
| `click` | Click element |
| `type` | Type text |
| `scroll` | Scroll page |
| `extract` | Extract text |
| `screenshot` | Capture screenshot |
| `hover` | Hover over element |

## Documentation

- [Full Documentation](https://docs.sidebutton.com)
- [GitHub Repository](https://github.com/sidebutton/sidebutton)
- [Website](https://sidebutton.com)

## Related Packages

- [`@sidebutton/core`](https://www.npmjs.com/package/@sidebutton/core) - Core workflow engine

## License

Apache-2.0
