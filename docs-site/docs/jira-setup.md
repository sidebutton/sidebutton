# Jira Integration Setup

This guide explains how to set up SideButton's Jira integration for creating tickets from any webpage.

## Overview

SideButton can create Jira tickets directly from browser content using:
- **Chat Panel** - Select text, right-click, and create a ticket
- **MCP Integration** - Use with Claude Code or other MCP clients

## Prerequisites

- Atlassian Cloud account (Jira Cloud)
- Project with issue creation permissions
- API token for authentication

---

## Step 1: Create Atlassian API Token

1. Go to [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **Create API token**
3. Enter a label (e.g., "SideButton")
4. Click **Create**
5. **Copy the token immediately** - you won't see it again

> ⚠️ Keep your API token secure. Never commit it to version control.

---

## Step 2: Find Your Jira Details

### Cloud ID / Site URL
Your Atlassian site URL format: `https://yourcompany.atlassian.net`

### Project Key
1. Open your Jira project
2. Look at the URL: `https://yourcompany.atlassian.net/jira/software/projects/PROJ/...`
3. The project key is `PROJ` (the short code)

### Issue Type
Common issue types:
- `Task`
- `Bug`
- `Story`
- `Epic`

Check your project settings for available issue types.

---

## Step 3: Configure SideButton

### Option A: Environment Variables in Settings

Add these environment variables in SideButton dashboard (Settings → User Contexts):

| Variable | Description | Example |
|----------|-------------|---------|
| `JIRA_URL` | Your Jira project URL | `https://company.atlassian.net/jira/software/projects/PROJ` |
| `JIRA_USER_EMAIL` | Your Atlassian account email | `you@company.com` |
| `JIRA_API_TOKEN` | API token from Step 1 | `ATATT3xFfGF0...` |

### Option B: Settings JSON

Edit `~/.sidebutton/actions/settings.json`:

```json
{
  "user_contexts": [
    {
      "type": "env",
      "id": "jira-url",
      "name": "JIRA_URL",
      "value": "https://yourcompany.atlassian.net/jira/software/projects/PROJ"
    },
    {
      "type": "env",
      "id": "jira-email",
      "name": "JIRA_USER_EMAIL",
      "value": "you@company.com"
    },
    {
      "type": "env",
      "id": "jira-token",
      "name": "JIRA_API_TOKEN",
      "value": "your-api-token-here"
    }
  ]
}
```

---

## Step 4: Configure MCP Integration (Optional)

For Claude Code or other MCP clients, add the Atlassian MCP configuration:

```json
{
  "external_mcps": [
    {
      "id": "atlassian",
      "name": "atlassian",
      "displayName": "Atlassian (Jira/Confluence)",
      "enabled": true,
      "transport": {
        "type": "claude-code"
      },
      "tools": {
        "createIssue": {
          "cloudId": "yourcompany.atlassian.net",
          "defaultProject": "PROJ",
          "defaultIssueType": "Task"
        }
      }
    }
  ]
}
```

---

## Step 5: Test the Integration

### Using the Browser Extension

1. Navigate to any webpage
2. Select text you want to create a ticket from
3. Right-click and select "Create Jira Ticket"
4. Review the generated summary and description
5. Click "Create"

### Using the Workflow

Run the `jira_prepare_issue_fields` workflow:

```bash
npx sidebutton run jira_prepare_issue_fields \
  --param element_text="Bug: Login button not working" \
  --param page_url="https://example.com/page" \
  --param page_title="Example Page"
```

---

## Troubleshooting

### "401 Unauthorized" Error
- Verify your API token is correct
- Check that the email matches your Atlassian account
- Ensure the token hasn't expired

### "403 Forbidden" Error
- Verify you have permission to create issues in the project
- Check project permissions in Jira settings

### "Project not found" Error
- Verify the project key is correct (case-sensitive)
- Ensure the project exists and is accessible

### Token Not Working
1. Create a new API token
2. Delete the old one
3. Update your settings with the new token

---

## Security Best Practices

1. **Never share your API token**
2. **Use environment variables** instead of hardcoding tokens
3. **Rotate tokens periodically** (every 90 days recommended)
4. **Revoke unused tokens** at [API Token Management](https://id.atlassian.com/manage-profile/security/api-tokens)

---

## Related Documentation

- [Atlassian API Token Documentation](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/)
- [Jira REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/)
- [SideButton MCP Setup](./mcp-setup.md)
