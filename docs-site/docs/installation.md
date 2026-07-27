# Installation

Get SideButton running on your computer in under 2 minutes.

## Quick Start (Recommended)

The fastest way to get started:

```bash
# Run directly with npx (no install needed)
npx sidebutton
```

Open [http://localhost:9876](http://localhost:9876) in your browser to see the dashboard.

## Alternative: Global Install

If you prefer a global installation:

```bash
# Install globally
npm install -g sidebutton

# Run the server
sidebutton
```

## Alternative: From Source

For development or customization:

```bash
# Clone the repository
git clone https://github.com/sidebutton/sidebutton.git
cd sidebutton

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start the server
pnpm start
```

## Alternative: Docker

The MCP server ships a Dockerfile. Build it from the repository **root** — the
server depends on `@sidebutton/core` through the pnpm workspace, so the build
context cannot be narrowed to `packages/server`:

```bash
docker build -f packages/server/Dockerfile -t mcp/sidebutton .

# Speak MCP over stdio, the way a client starts it
docker run -i --rm mcp/sidebutton

# Keep workflows, run logs and installed packs across restarts
docker run -i --rm -v sidebutton-data:/home/node/.sidebutton mcp/sidebutton
```

Point an MCP client at it with:

```json
{
  "mcpServers": {
    "sidebutton": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "mcp/sidebutton"]
    }
  }
}
```

::: warning Browser tools do not work in a container
The container runs the workflow engine, the seven browserless MCP tools and all
`skill://` knowledge packs. The 21 browser tools drive the real Chrome on your
machine through the [SideButton extension](/docs/extension), which connects to a
server on the host's `127.0.0.1:9876`. In stdio mode the container binds that
listener to container-local loopback by design, so publishing the port does not
bridge it. Use `npx sidebutton` on the host for browser automation.
:::

First run seeds the universal `agents` knowledge pack, so a fresh container
already exposes its `skill://agents/...` resources; `sidebutton install agents`
upgrades it to the current catalog version.

The image runs as an unprivileged user, contains no credentials, and disables
crash reporting (`SIDEBUTTON_CONTAINER=1`).

## Desktop App

SideButton also has a native desktop app for macOS, Windows, and Linux:

```bash
# From source
pnpm desktop

# Or build distributable packages
pnpm desktop:build
```

## Verify Installation

After starting the server, verify it's running:

```bash
curl http://localhost:9876/health
```

Expected response:
```json
{
  "status": "ok",
  "version": "1.0.12",
  "browser_connected": false,
  "server_running": true
}
```

::: tip Browser Connected: false?
This is expected! You need to [install the Chrome extension](/extension) and connect a tab for browser automation to work.
:::

## What's Next?

1. **[Install the Chrome Extension](/extension)** — Required for browser automation
2. **[Run Your First Workflow](/first-workflow)** — See it in action
3. **[Connect AI Tools](/mcp-setup)** — Use with Claude Code or Cursor
4. **[Install Knowledge Packs](/knowledge-packs/overview)** — Add automation for specific web apps
5. **[Extend with Plugins](/plugins/overview)** — Add custom MCP tools

## Troubleshooting

### Port 9876 already in use

```bash
# Find what's using the port
lsof -i :9876

# Kill the process if needed
kill -9 <PID>
```

### Permission errors with global install

```bash
# Use sudo (not recommended for security)
sudo npm install -g sidebutton

# Better: fix npm permissions
# https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally
```

### pnpm not found

```bash
# Install pnpm
npm install -g pnpm
```

See [Troubleshooting](/troubleshooting) for more common issues.
