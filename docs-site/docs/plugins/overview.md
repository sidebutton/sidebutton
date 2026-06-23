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
| `runtime` | string | No | Execution tier: `process` (default) or `service`. See [Plugin Runtimes](#plugin-runtimes). |
| `tools` | array | Yes¹ | One or more tool definitions (¹required for `process`; omitted for `service` — discovered live) |
| `tools[].name` | string | Yes | Tool name (must not collide with core MCP tools) |
| `tools[].description` | string | Yes | Shown in `tools/list` with `[plugin: name]` prefix |
| `tools[].inputSchema` | object | Yes | JSON Schema with required `type` field |
| `tools[].handler` | string | Yes | Command to spawn (e.g., `node handler.js`, `bash run.sh`, `python script.py`) |

## Plugin Runtimes

A plugin's `runtime` selects how the server hosts it:

| | `process` (default) | `service` |
|---|---|---|
| **Execution** | Fresh handler process **per call** (stdin → JSON → stdout) | One **persistent child** the server keeps alive and aggregates |
| **State** | None — each call is isolated | Held in-memory **across calls** (e.g. a session, an open connection, a held key) |
| **Tools** | Declared in `tools[]`, each with a `handler` | **Discovered live** from the child's `tools/list` — no `tools[]` needed |
| **Naming** | Must not collide with core tools (whole plugin rejected if it does) | Auto-namespaced `<namespace>_<tool>`; only a still-colliding tool is dropped |
| **Timeout** | Fixed 30s SIGKILL | Per-service / per-tool override |
| **Use case** | Quick, isolated capabilities (quality checks, API calls) | Stateful, long-running subsystems (e.g. computer-use desktop automation) |

A `service` plugin runs as a **child stdio MCP server**. The SideButton server spawns it once during `reload()`, forwards `tools/call` to it, restarts it on crash, serializes its calls, and stops it on shutdown — the same persistent, single-owner pattern the core browser tools use. Tools are exposed under `mcp__sidebutton__` like any other; their IDs are slug-namespaced, never a separate MCP prefix.

### Service manifest

```json
{
  "name": "computer-use",
  "version": "1.0.0",
  "description": "Persistent computer-use tool surface",
  "runtime": "service",
  "service": {
    "command": "node server.js",
    "timeoutMs": 120000,
    "toolNamespace": "computer",
    "tools": {
      "hold_key": { "timeoutMs": 120000 },
      "screenshot": { "timeoutMs": 5000 }
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `service.command` | string | Yes | Command spawned once to run the child stdio MCP server |
| `service.timeoutMs` | number | No | Default per-call timeout for this service's tools (ms) |
| `service.toolNamespace` | string | No | Prefix for aggregated tool names (defaults to the plugin `name`) |
| `service.tools` | object | No | Per-tool overrides keyed by the child's tool name (e.g. `timeoutMs`) |

> `exec` is accepted as a back-compat alias of the default `process` tier.

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

`service` plugins are reconciled on each reload **without thrashing**: an unchanged service keeps its running child, a removed service is stopped, and a changed spawn spec restarts it. Because the child is started in the background, a newly added service's tools may take a moment to appear in `tools/list` after boot.

## Validation

- Manifests missing required fields are skipped (warning logged)
- Tools with invalid `inputSchema` (missing `type` field) are skipped
- **Process plugins: a tool-name collision with core MCP tools rejects the entire plugin**
- **Service plugins** require `service.command`; their tools are auto-namespaced, and only a tool whose namespaced name *still* collides is dropped — never the whole plugin
- Hidden directories (starting with `.`) are ignored

## Next Steps

- **[Creating Plugins](/plugins/creating)** — Build your own plugin step by step
- **[CLI Reference](/plugins/cli)** — Install, remove, and list plugins
- **[Available Plugins](/plugins/available)** — Official plugins ready to install
