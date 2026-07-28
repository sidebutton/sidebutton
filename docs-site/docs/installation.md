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

The MCP server ships a Dockerfile with two profiles. Build from the repository
**root** — the server depends on `@sidebutton/core` through the pnpm workspace,
so the build context cannot be narrowed to `packages/server`:

| Profile | Target | Size | Tools |
| --- | --- | --- | --- |
| **browser** (default) | `browser` | ~1.5 GB | all 28 |
| **server-only** | `runner` | ~580 MB | 7 of 28 |

```bash
# browser — bundles Chromium and installs the extension itself
docker build -f packages/server/Dockerfile -t sidebutton .
docker run -i --rm sidebutton

# server-only — no browser, smaller image
docker build -f packages/server/Dockerfile --target runner -t sidebutton:slim .
docker run -i --rm sidebutton:slim

# Keep workflows, run logs and installed packs across restarts
docker run -i --rm -v sidebutton-data:/home/node/.sidebutton sidebutton
```

Point an MCP client at it with:

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

::: tip The browser profile needs no host setup
It bundles Chromium and installs the [SideButton extension](/extension) itself,
via a Chrome managed policy that force-installs the published extension from the
Chrome Web Store on first launch. No extension source ships in the image, and it
auto-updates.

First launch therefore needs network access to `clients2.google.com` and
`clients2.googleusercontent.com`, and takes a few seconds to fetch and attach.
No `--shm-size` flag is needed: Chromium runs with `--disable-dev-shm-usage`, so
Docker's 64 MB `/dev/shm` is bypassed from inside the image.
:::

::: warning The server-only profile has no browser
It runs the workflow engine, the seven browserless MCP tools and all `skill://`
knowledge packs. The 21 browser tools do not work, and an extension on the *host*
cannot reach it either: it connects to `127.0.0.1:9876`, and in stdio mode the
container binds that listener to container-local loopback by design, so
publishing the port does not bridge it. Use the `browser` profile, or
`npx sidebutton` on the host to drive the Chrome you are already signed into.
:::

First run seeds the universal `agents` knowledge pack, so a fresh container
already exposes its `skill://agents/...` resources; `sidebutton install agents`
upgrades it to the current catalog version.

Both images run as an unprivileged user, contain no credentials, and disable
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
