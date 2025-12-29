# @sidebutton/desktop

Electron desktop application for SideButton.

## Development

```bash
# Install dependencies
pnpm install

# Start development mode
pnpm start
```

## Building

```bash
# Create distributable packages
pnpm make

# Platform-specific builds
pnpm make --platform darwin  # macOS (.dmg, .zip)
pnpm make --platform win32   # Windows (.exe)
pnpm make --platform linux   # Linux (.deb, .rpm)
```

## App Icons

Place icons in the `assets/` directory:

| File | Platform | Size |
|------|----------|------|
| `icon.icns` | macOS | 16-1024px multi-resolution |
| `icon.ico` | Windows | 16-256px multi-resolution |
| `icon.png` | Linux/Tray | 512x512 |

Generate icons from a 1024x1024 source using `electron-icon-maker`:

```bash
npx electron-icon-maker --input=source.png --output=assets
```

## Code Signing

### macOS (Required for distribution)

Set environment variables:
- `APPLE_ID` - Apple ID email
- `APPLE_PASSWORD` - App-specific password
- `APPLE_TEAM_ID` - Team ID from developer portal

### Windows (Optional)

Configure Squirrel maker with certificate in `forge.config.js`.

## Architecture

The desktop app:
1. Spawns the `@sidebutton/server` Fastify server
2. Waits for the server health check
3. Opens a BrowserWindow to `http://localhost:9876`
4. Provides native features via preload script

```
Electron Main Process
├── @sidebutton/server (Fastify :9876)
│   ├── REST API (/api/*)
│   ├── WebSocket (/ws)
│   └── Static Dashboard
└── BrowserWindow
    └── http://localhost:9876
```
