# Chrome Extension

Browser automation extension for SideButton. Connects to the server via WebSocket and executes browser commands using Chrome DevTools Protocol (CDP).

## Architecture

```
extension/
├── manifest.json    # MV3 configuration
├── background.js    # Service worker: WebSocket, CDP
├── content.js       # DOM operations, recording, embed buttons
├── popup.html/js    # Connection status UI
└── icons/           # Extension icons
```

## Communication Flow

```
┌──────────────┐     WebSocket      ┌──────────────┐
│   Server     │◄──────────────────►│  background  │
│  (port 9876) │                    │    .js       │
└──────────────┘                    └──────┬───────┘
                                          │ Chrome API
                                          │ + CDP
                                          ▼
                                   ┌──────────────┐
                                   │  content.js  │
                                   │  (DOM ops)   │
                                   └──────────────┘
```

## WebSocket Protocol

Commands sent from Desktop to extension:

| Command | Parameters | Description |
|---------|------------|-------------|
| `navigate` | `url` | Open URL in connected tab |
| `click` | `selector`, `new_tab?` | Click element |
| `type` | `selector`, `text` | Type text into element |
| `scroll` | `direction`, `amount?` | Scroll page or at hover position |
| `hover` | `selector` | Position cursor (for scroll targeting) |
| `extract` | `selector` | Get text content |
| `extractAll` | `selector`, `separator?` | Get all matching texts |
| `exists` | `selector`, `timeout?` | Check element existence |
| `key` | `key`, `selector?` | Send keyboard event |
| `startRecording` | - | Begin action capture |
| `stopRecording` | - | End and return events |
| `capturePage` | - | Get page selectors |
| `injectButtons` | `workflows` | Inject embed buttons |

## CDP Operations

The extension uses Chrome DevTools Protocol for:
- `Input.dispatchKeyEvent` - Keyboard input
- `Input.dispatchMouseEvent` - Mouse clicks and hover
- `debugger.sendCommand` - CDP command execution

## Recording Format

Captured events structure:

```json
{
  "event_type": "click",
  "selectors": [
    "role=button[name='Submit']",
    "text=Submit",
    "css=button.primary-btn"
  ],
  "context": {
    "tag": "button",
    "text": "Submit"
  },
  "timestamp_ms": 1703123456789
}
```

## Selector Strategies

Recording captures multiple selector candidates (in priority order):

| Strategy | Example | Use Case |
|----------|---------|----------|
| `role=...` | `role=button[name='Publish']` | Accessible elements |
| `text=...` | `text=Publish release` | Visible text content |
| `data-testid=...` | `[data-testid="submit-btn"]` | Test IDs |
| `css=...` | `css=button.btn-primary` | CSS selectors |

## Embed Button Injection

Workflows with `embed` config inject buttons into target pages:

1. Extension receives `injectButtons` with workflow definitions
2. For each workflow with matching `when` selector on current page:
   - Find target elements via `selector`
   - Apply `parent_filter` if specified
   - Insert button at `position` (before/after/prepend/append)
3. On button click:
   - Extract context via `extract` config
   - Map values via `param_map`
   - Send `run_workflow` to desktop

## Installation (Development)

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` directory
5. Click the extension icon to connect to SideButton
