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
npx sidebutton

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
sidebutton                    # Start server on port 9876 (default)
sidebutton --stdio            # Start with stdio transport (for Claude Desktop)
sidebutton -p 8080            # Start on custom port
sidebutton list               # List available workflows
sidebutton run <id>           # Run a workflow by ID
sidebutton status             # Check server status

# Knowledge pack registries
sidebutton registry add <path|url>   # Register + install all knowledge packs
sidebutton registry update [name]    # Update installed packs from registry
sidebutton registry remove <name>    # Uninstall packs and remove registry
sidebutton registry list             # Show registries and pack counts
sidebutton search [query]            # Search packs across registries
sidebutton install <path|url|name>   # One-off knowledge pack install
sidebutton uninstall <domain>        # Remove an installed knowledge pack
```

## MCP Integration

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

**Note:** The `--stdio` flag uses stdin/stdout for MCP communication, which is required for Claude Desktop's JSON config. The HTTP server still runs in the background for browser extension connectivity.

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

28 tools, plus every installed knowledge pack as a `skill://` MCP resource.

Seven need no browser:

| Tool | Description |
|------|-------------|
| `run_workflow` | Execute a workflow by ID (needs the browser only for `browser.*` steps) |
| `list_workflows` | List available workflows |
| `get_workflow` | Get workflow YAML definition |
| `get_run_log` | Get execution log |
| `list_run_logs` | List recent executions |
| `publish_artifact` | Publish a file and return a shareable download link |
| `get_browser_status` | Check extension connection |

The other 21 drive your real Chrome through the SideButton extension:

| Tool | Description |
|------|-------------|
| `capture_page` | Capture page selectors |
| `navigate` | Navigate browser to URL |
| `snapshot` | Get accessibility tree |
| `click` | Click element |
| `type` | Type text |
| `press_key` | Send keyboard keys |
| `scroll` | Scroll page |
| `scroll_into_view` | Scroll element into viewport |
| `extract` | Extract text |
| `extract_all` | Extract all matching elements |
| `extract_map` | Extract structured data from repeated elements |
| `select_option` | Select dropdown option |
| `fill` | Fill input value (React-compatible) |
| `exists` | Check if element exists |
| `wait` | Wait for element or delay |
| `hover` | Hover over element |
| `screenshot` | Capture screenshot |
| `evaluate` | Execute JavaScript in browser |
| `browser_batch` | Run several browser steps in one round trip |
| `set_basic_auth` | Set HTTP basic-auth credentials for an origin |
| `clear_basic_auth` | Clear stored basic-auth credentials |

## Run with Docker

Two profiles, selected with `--target`. Both build from the repository **root** —
`@sidebutton/server` depends on `@sidebutton/core` via `workspace:*`, so the
workspace has to stay intact.

| Profile | Target | Size | Tools | Needs |
| --- | --- | --- | --- | --- |
| **browser** (default) | `browser` | ~1.5 GB | all 28 | egress to the Chrome Web Store |
| **server-only** | `runner` | ~580 MB | 7 of 28 | nothing |

```bash
# browser — bundles Chromium, installs the extension itself, all 28 tools
docker build -f packages/server/Dockerfile -t sidebutton .
docker run -i --rm sidebutton

# server-only — no browser, smaller image
docker build -f packages/server/Dockerfile --target runner -t sidebutton:slim .
docker run -i --rm sidebutton:slim

# Keep workflows, run logs and installed packs across restarts
docker run -i --rm -v sidebutton-data:/home/node/.sidebutton sidebutton
```

MCP client configuration:

```json
{
  "mcpServers": {
    "sidebutton": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "sidebutton"]
    }
  }
}
```

**How the browser profile gets the extension.** It does not ship it. A Chrome
managed policy in the image force-installs the published extension from the
Chrome Web Store at first launch — the same mechanism the agent fleet uses. The
image contains no extension source and redistributes nothing, and the extension
auto-updates. See [`chrome-policy/README.md`](chrome-policy/README.md).

Consequences worth knowing:

- **First launch needs network** to `clients2.google.com` and
  `clients2.googleusercontent.com`. Without it the browser starts but no
  extension installs, and every browser tool reports "browser not connected".
- **Startup is not instant.** The extension is fetched, then attaches to a tab —
  typically a few seconds. The entrypoint restarts Chromium if that fails, up to
  `SIDEBUTTON_ATTACH_RETRIES` times.
- **No `--shm-size` needed.** Chromium launches with `--disable-dev-shm-usage`,
  which routes shared memory to `/tmp` instead of Docker's 64 MB `/dev/shm`. The
  image has to work under a runner whose flags we do not control — the Docker
  MCP Toolkit gateway, for one — so this is handled in the image rather than
  asked of the caller.
- **`SIDEBUTTON_START_URL`** (default `https://sidebutton.com`) must stay a
  regular `http(s)` URL. The extension refuses to attach to `about:blank` and
  other restricted schemes, which surfaces as a connected socket with no tab.
- **Do not override `--port`.** The extension dials a hardcoded
  `ws://localhost:9876`, so browser tools only work on the default port. The
  entrypoint detects an override, says so, and skips Chromium rather than
  spending minutes on attach attempts that cannot succeed; the browserless tools
  keep working.

**Server-only scope.** The seven browserless tools, the workflow engine and all
`skill://` knowledge packs work. The 21 browser tools do not, and a browser on
the *host* cannot rescue them: the extension connects to `127.0.0.1:9876`, and in
stdio mode the container binds that listener to container-local loopback by
design (SCRUM-1490), so publishing the port does not bridge it. Use the `browser`
profile, or install from npm (`npx sidebutton`) to drive your own Chrome.

**Included by default.** First run seeds the universal `agents` knowledge pack
— the same one fleet provisioning installs — so a fresh container answers
`resources/list` with its `skill://agents/...` set: methodology playbooks for
the Ops/SE/QA/SD/PM roles plus the fleet ops workflows. `sidebutton install
agents` upgrades it to the current catalog version at any time; at release time
`scripts/refresh-default-skills.mjs` keeps the vendored copy in sync.

The image runs as the unprivileged `node` user, contains no credentials, and
sets `SIDEBUTTON_CONTAINER=1` so crash reporting stays off.

Conformance check against any build:

```bash
node packages/server/scripts/mcp-stdio-probe.mjs -- docker run -i --rm mcp/sidebutton
```

## Environment Variables

None are required. The server starts and enumerates all 28 tools with no
configuration.

| Variable | Required For | Description |
|----------|--------------|-------------|
| `OPENAI_API_KEY` | `llm.*` steps | OpenAI API key for LLM workflows |
| `ANTHROPIC_API_KEY` | `llm.*` steps | Anthropic API key (alternative) |
| `SIDEBUTTON_HOST` | Wide binds | Bind address. Defaults to `127.0.0.1`; any other value also requires `SIDEBUTTON_AGENT_TOKEN` or the server refuses to start |
| `SIDEBUTTON_AGENT_TOKEN` | Wide binds | Bearer token for `/api/*` when not bound to loopback |
| `SIDEBUTTON_PREVIEW_PORTS` | `/api/preview/*` | Comma-separated allowlist of dev-server ports the preview passthrough may reach. Unset means any port 1024–65535 except the server's own and the remote-control ports |
| `SIDEBUTTON_AGENT_NAME` | Fleet agents | Agent name reported to the portal |
| `SIDEBUTTON_API_BASE` | Portal features | Portal API base URL |
| `PORTAL_URL` | Portal features | Portal web URL used in generated links |
| `DISPLAY` | Screenshots on Linux | X display used for desktop capture |
| `SIDEBUTTON_TELEMETRY` | Telemetry | `0`/`off` disables crash reporting; `1` re-enables it where it defaults to off |
| `DO_NOT_TRACK` | Telemetry | Honoured — any truthy value disables crash reporting |
| `SENTRY_DSN` | Telemetry | Send crash reports to your own Sentry project instead |
| `SENTRY_SEND_PII` | Telemetry | Attach IPs/headers to reports. Off unless you set your own `SENTRY_DSN` |
| `SENTRY_RELEASE` | Telemetry | Release tag attached to reports |
| `HOME` | Always | Config root (`$HOME/.sidebutton`); falls back to the working directory |

Crash reporting goes to a built-in Sentry project, carries no personally
identifying data unless you configure your own `SENTRY_DSN`, and turns itself
off in containers, in CI, and wherever `DO_NOT_TRACK` is set.

## Documentation

- [Full Documentation](https://docs.sidebutton.com)
- [GitHub Repository](https://github.com/sidebutton/sidebutton)
- [Website](https://sidebutton.com)

## Related Packages

- [`@sidebutton/core`](https://www.npmjs.com/package/@sidebutton/core) - Core workflow engine

## License

Apache-2.0
