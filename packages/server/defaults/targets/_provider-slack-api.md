---
name: Slack (Bot API)
match: ["*"]
enabled: false
provider: slack
---

# Slack Integration — Bot Token API

Slack is connected via Bot Token API. Use `chat.*` step types for direct channel reads without opening a browser.

## Step Types

| Step | Purpose |
|------|---------|
| `chat.listChannels` | List accessible channels (public, private, DMs) |
| `chat.readChannel` | Read recent messages from a channel (use `max_days` to limit) |
| `chat.readThread` | Read a specific thread by `thread_ts` |

## Common Sequences

**Read a channel:**
1. `chat.listChannels` — discover available channels
2. `chat.readChannel` — read recent messages (use `max_days` to limit history)

**Read a thread:**
1. `chat.readChannel` — find the thread's parent message
2. `chat.readThread` — read the full thread by `thread_ts`

**Monitor for important messages:**
1. `chat.readChannel` with `max_days: 1` — get today's messages
2. `llm.classify` — categorize each message (urgent, FYI, action-needed)

## Available Workflows

| Workflow | Purpose |
|----------|---------|
| `slack-extract-thread` | Extract the full discussion from a Slack thread |

## Authentication

Requires `SLACK_BOT_TOKEN` (starts with `xoxb-`) in Settings > Environment Variables. The bot must be invited to channels it needs to read.
