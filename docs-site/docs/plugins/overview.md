# Plugins Overview

Plugins extend SideButton's MCP server with custom tools — without modifying core code. Each plugin is a standalone directory containing a `plugin.json` manifest and one or more handler scripts in any language.

## Plugins vs Knowledge Packs

| | Plugins | Knowledge Packs |
|---|---------|-----------------|
| **What they add** | Custom MCP tools (code) | Domain knowledge + workflows (config) |
| **Language** | Any (bash, Node.js, Python, etc.) | Markdown + YAML |
| **Requires code** | Yes — handler scripts | No — declarative only |
| **Installed to** | `~/.sidebutton/plugins/` | `~/.sidebutton/skills/` |
| **Use case** | New capabilities (screen recording, quality checks, API integrations) | Teaching agents about a specific web app |

Plugins and knowledge packs are complementary. A knowledge pack teaches an agent *what* to do on a domain; a plugin gives the agent *new abilities* it didn't have before.

## How Plugins Work

```
┌──────────────────────┐     MCP Protocol    ┌───────────────────┐
│    AI Assistant       │◄──────────────────►│    SideButton      │
│  (Claude/Cursor)      │   tools/call        │   (port 9876)      │
└──────────────────────┘                     └─────────┬──────────┘
                                                       │
                                             ┌─────────▼──────────┐
                                             │   Plugin Loader     │
                                             │  ~/.sidebutton/     │
                                             │    plugins/         │
                                             └─────────┬──────────┘
                                                       │ spawn
                                             ┌─────────▼──────────┐
                                             │   Handler Process   │
                                             │  stdin → JSON in    │
                                             │  stdout → JSON out  │
                                             └────────────────────┘
```

1. AI calls a tool (e.g., `check_writing_quality`)
2. SideButton finds the matching plugin via `plugin.json`
3. Spawns the handler as a child process
4. Passes tool arguments as JSON on **stdin**
5. Reads the MCP result from **stdout**
6. Returns the result to the AI

## Plugin Manifest

Every plugin needs a `plugin.json` at its root:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "tools": [
    {
      "name": "my_tool",
      "description": "Shown in MCP tools/list",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "Search query" }
        },
        "required": ["query"]
      },
      "handler": "node handler.js"
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Plugin identifier |
| `version` | string | Yes | Semver version |
| `description` | string | Yes | Human-readable description |
| `tools` | array | Yes | One or more tool definitions |
| `tools[].name` | string | Yes | Tool name (must not collide with core MCP tools) |
| `tools[].description` | string | Yes | Shown in `tools/list` with `[plugin: name]` prefix |
| `tools[].inputSchema` | object | Yes | JSON Schema with required `type` field |
| `tools[].handler` | string | Yes | Command to spawn (e.g., `node handler.js`, `bash run.sh`, `python script.py`) |

## Handler Protocol

Handlers are spawned as child processes. They receive input on stdin and write output to stdout.

**Input:** JSON object matching `inputSchema`

**Output:** Standard MCP tool result:

```json
{
  "content": [{ "type": "text", "text": "result string" }]
}
```

**Error handling:**

| Condition | Result |
|-----------|--------|
| Non-zero exit code | MCP error with stderr content |
| Invalid JSON on stdout | MCP error with diagnostic |
| Handler hangs >30s | Killed with SIGKILL, timeout error |
| Command not found | Spawn failure error |

**Environment:** Handlers inherit the server's environment (`PATH`, `HOME`, etc.) and run with `cwd` set to the plugin directory.

## Lifecycle

Plugins are loaded during `McpHandler.reload()`, which runs:

- On server startup
- Before each `run_workflow` call
- On client-triggered reload

You can add or remove plugins while the server is running — changes take effect on the next reload cycle.

## Validation

- Manifests missing required fields are skipped (warning logged)
- Tools with invalid `inputSchema` (missing `type` field) are skipped
- **Tool name collisions with core MCP tools reject the entire plugin**
- Hidden directories (starting with `.`) are ignored

## Next Steps

- **[Creating Plugins](/plugins/creating)** — Build your own plugin step by step
- **[CLI Reference](/plugins/cli)** — Install, remove, and list plugins
- **[Available Plugins](/plugins/available)** — Official plugins ready to install
