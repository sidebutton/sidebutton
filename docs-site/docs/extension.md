# Extension Setup

The Chrome extension enables browser automation — clicking, typing, scrolling, and extracting data from web pages.

## Installation

::: warning Manual Install Required
The extension is not yet on the Chrome Web Store. Follow these steps to install manually.
:::

### Step 1: Download the Extension

**Option A: From GitHub Release**
1. Go to [GitHub Releases](https://github.com/sidebutton/sidebutton/releases)
2. Download `extension.zip` from the latest release
3. Extract the zip file

**Option B: From Source**
```bash
git clone https://github.com/sidebutton/sidebutton.git
cd sidebutton/extension
```

### Step 2: Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` folder

You should see "SideButton" appear in your extensions list.

### Step 3: Pin the Extension

1. Click the puzzle piece icon in Chrome's toolbar
2. Find "SideButton" and click the pin icon
3. The extension icon should now be visible in your toolbar

### Step 4: Connect a Tab

1. Navigate to any website (e.g., [wikipedia.org](https://wikipedia.org))
2. Click the extension icon in your toolbar
3. Click **"Connect This Tab"**

The popup should show "Connected" status.

## Verify Connection

Check the connection status in the dashboard:

1. Open [http://localhost:9876](http://localhost:9876)
2. Look for the green "Browser Connected" indicator in the sidebar

Or use the health endpoint:

```bash
curl http://localhost:9876/health
```

Expected response with extension connected:
```json
{
  "status": "ok",
  "browser_connected": true,
  "tab_id": 123456
}
```

## How It Works

```
┌──────────────┐     WebSocket      ┌──────────────┐
│   Server     │◄──────────────────►│  Extension   │
│  (port 9876) │                    │  (Chrome)    │
└──────────────┘                    └──────────────┘
```

The extension:
- **Connects via WebSocket** to the local server
- **Executes browser commands** (click, type, scroll, extract)
- **Captures recordings** when you record actions
- **Injects embed buttons** into pages based on workflow config

## Extension Permissions

The extension requests these permissions:

| Permission | Why It's Needed |
|------------|-----------------|
| `activeTab` | Access current tab for automation |
| `scripting` | Inject content scripts for DOM operations |
| `tabs` | Navigate and manage tabs |
| `debugger` | Use Chrome DevTools Protocol for reliable automation |
| `storage` | Save connection state |
| `<all_urls>` | Work on any website |

::: info Privacy Note
All automation runs locally on your computer. The extension only communicates with your local server (localhost:9876), never with external servers.
:::

## Troubleshooting

### Extension not connecting

1. **Is the server running?** Check [http://localhost:9876](http://localhost:9876)
2. **Refresh the page** and click "Connect This Tab" again
3. **Check the console** — Right-click extension icon → "Inspect popup" → Console

### "Connect This Tab" button doesn't appear

Make sure:
- You're on a regular webpage (not `chrome://` pages)
- The extension is enabled in `chrome://extensions/`
- Developer mode is on

### Automation not working on specific site

Some sites block automation. Check:
- The site's Content Security Policy
- If you're logged in (some actions require auth)
- The selector is correct (use [capture_page](/mcp/browser) to find selectors)

## Next Steps

1. **[Run Your First Workflow](/first-workflow)** — See browser automation in action
2. **[Recording Mode](/features/recording)** — Create workflows by clicking
3. **[Embed Buttons](/features/embed)** — Add automation buttons to pages
