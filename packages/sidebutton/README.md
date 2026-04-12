# SideButton

Open source platform for AI agents — browser MCP server with knowledge packs, workflow automation, and real browser control.

[![npm version](https://img.shields.io/npm/v/sidebutton.svg)](https://www.npmjs.com/package/sidebutton)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/sidebutton/sidebutton/blob/main/LICENSE)

## Quick Start

```bash
npx sidebutton
```

This starts the SideButton server on `http://localhost:9876` with:
- MCP server for AI agents (Claude Code, Cursor, ChatGPT, Claude Desktop)
- Web dashboard for workflow management
- WebSocket bridge for the Chrome extension

## Install the Chrome Extension

Install [SideButton](https://chromewebstore.google.com/detail/sidebutton/jgjpbbfgnkeanpjfobmijahbbagbecep) from the Chrome Web Store to connect your browser.

## Connect Your AI Agent

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

## CLI Commands

```bash
sidebutton                           # Start server (default port 9876)
sidebutton --stdio                   # Start with stdio transport (Claude Desktop)
sidebutton -p 8080                   # Custom port

sidebutton list                      # List available workflows
sidebutton run <id>                  # Run a workflow
sidebutton status                    # Check server status

# Knowledge packs
sidebutton registry add <path|url>   # Install knowledge packs from registry
sidebutton registry update [name]    # Update installed packs
sidebutton registry remove <name>    # Remove registry and packs
sidebutton registry list             # Show registries
sidebutton search [query]            # Search packs across registries
sidebutton install <path|url|name>   # Install a single knowledge pack
sidebutton uninstall <domain>        # Remove a knowledge pack

# Knowledge pack development
sidebutton init [domain]             # Scaffold a new knowledge pack
sidebutton validate [path]           # Lint and validate a knowledge pack
sidebutton publish                   # Publish to registry
```

## Knowledge Packs

Knowledge packs teach AI agents how specific web apps work — selectors, data models, states, and workflows. Browse available packs at [sidebutton.com/skills](https://sidebutton.com/skills).

## Documentation

- [Documentation](https://docs.sidebutton.com)
- [GitHub](https://github.com/sidebutton/sidebutton)
- [Website](https://sidebutton.com)
- [Knowledge Packs](https://sidebutton.com/skills)

## Related Packages

- [`@sidebutton/core`](https://www.npmjs.com/package/@sidebutton/core) - Core workflow engine
- [`@sidebutton/server`](https://www.npmjs.com/package/@sidebutton/server) - MCP server with REST API and dashboard

## License

Apache-2.0
