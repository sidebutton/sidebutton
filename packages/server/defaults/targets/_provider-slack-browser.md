---
name: Slack (Browser)
match: ["*"]
enabled: false
provider: slack
---

# Slack Integration — Browser

Slack is connected via browser automation. Use SideButton browser tools to read and interact with messages.

**Important:** This connector assumes you are already logged in to Slack in the browser. If you encounter a login page or authentication challenge, **stop and notify the user** — do not attempt to authenticate.

## Browser Tools

Use the standard `browser.*` tools to interact with Slack:

| Tool | Usage |
|------|-------|
| `navigate` | Go to Slack workspace or channel URL |
| `snapshot` | Capture current view for reading messages |
| `click` | Click channels, threads, buttons |
| `type` | Type messages, search queries |

## Default Workflows

Use `run_workflow` for common operations:

| Workflow | Purpose |
|----------|---------|
| `slack_browser_read_channel` | Navigate to channel, snapshot recent messages |
| `slack_browser_post_message` | Navigate to channel, type message, send |
| `slack-extract-thread` | Extract full discussion from visible thread |

## Common Patterns

**Read a channel:**
1. Navigate to `{SLACK_BROWSER_URL}/channel-name`
2. Use `snapshot` with `includeContent: true` to read messages

**Send a message:**
1. Use `run_workflow` with `slack_browser_post_message`
2. Or navigate to channel, click message input, `type` message, press Enter

**Search messages:**
1. Use Cmd+K or click search bar
2. Type search query with `type` tool
3. `snapshot` the results

## Authentication

Requires `SLACK_BROWSER_URL` in Settings > Environment Variables (e.g. `https://yourworkspace.slack.com`). You must be logged in to Slack in the connected browser.
