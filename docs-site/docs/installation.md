# Installation

Get SideButton running on your computer in under 2 minutes.

## Quick Start (Recommended)

The fastest way to get started:

```bash
# Run directly with npx (no install needed)
npx @sidebutton/server serve
```

Open [http://localhost:9876](http://localhost:9876) in your browser to see the dashboard.

## Alternative: Global Install

If you prefer a global installation:

```bash
# Install globally
npm install -g @sidebutton/server

# Run the server
sidebutton serve
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
  "version": "1.0.0",
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
sudo npm install -g @sidebutton/server

# Better: fix npm permissions
# https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally
```

### pnpm not found

```bash
# Install pnpm
npm install -g pnpm
```

See [Troubleshooting](/troubleshooting) for more common issues.
