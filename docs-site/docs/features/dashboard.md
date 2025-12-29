# Dashboard

SideButton's web dashboard for managing workflows, recordings, and settings.

## Accessing the Dashboard

Open [http://localhost:9876](http://localhost:9876) when the server is running.

## Dashboard Views

### Home (Dashboard)

The main view shows:

- **Shortcuts** — Pinned workflows for quick access
- **Recent runs** — Latest workflow executions
- **Browser status** — Extension connection indicator

### Actions

Your personal workflows saved in `actions/` directory:

- View workflow details
- Run workflows
- Edit workflow settings
- Delete workflows

### Workflows

Public workflow library from `workflows/` directory:

- Browse community workflows
- Run any workflow
- Copy to your actions

### Recordings

Manage action recordings:

- Start new recording
- View past recordings
- Export as YAML workflow
- Delete recordings

### Run Log

Execution history for all workflows:

- See status (completed, failed, running)
- View duration and timestamp
- Inspect step-by-step events
- See extracted variables
- Debug failed runs

### Settings

Configure SideButton:

**Shortcuts**
- Pin workflows to dashboard
- Set custom icons
- Organize favorites

**User Contexts**
- **LLM Contexts** — Instructions prepended to AI prompts
- **Env Contexts** — Environment variables for workflows

**Connection**
- Server status
- Extension status

## Browser Connection

The sidebar shows connection status:

| Status | Meaning |
|--------|---------|
| 🟢 Browser Connected | Extension is connected, ready for automation |
| 🔴 Browser Disconnected | Extension not connected |

### Reconnecting

If disconnected:
1. Navigate to any webpage in Chrome
2. Click the extension icon
3. Click "Connect This Tab"

## Working with Workflows

### Running a Workflow

1. Navigate to **Actions** or **Workflows**
2. Click a workflow card
3. Fill in any required parameters
4. Click **Run**
5. Watch the run log for results

### Creating a Shortcut

1. Find a workflow you use often
2. Click the ⭐ or pin icon
3. It appears on your Dashboard

### Viewing Run Details

1. Go to **Run Log**
2. Click a run entry
3. See:
   - Overall status
   - Duration
   - Parameters used
   - Step-by-step events
   - Extracted variables
   - Error messages (if failed)

## Settings Deep Dive

### LLM Contexts

Customize AI behavior for specific domains:

| Field | Description |
|-------|-------------|
| Industry | Match by workflow category (Sales, Engineering, etc.) |
| Domain | Match by allowed_domains |
| Context | Text prepended to LLM prompts |

Example:
- Industry: Sales
- Domain: linkedin.com
- Context: "You are helping a sales professional. Be concise and professional."

### Env Contexts

Define reusable values:

| Name | Value |
|------|-------|
| `github_base_path` | `/Users/me/GitHub` |
| `default_org` | `mycompany` |

Use in workflows: <code v-pre>{{env.github_base_path}}</code>

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Quick search (coming soon) |
| `Esc` | Close modal |

## Troubleshooting

### Dashboard won't load

1. Is the server running? Check terminal for errors.
2. Try a different browser
3. Clear browser cache

### Workflows don't appear

1. Check `workflows/` and `actions/` directories exist
2. Verify YAML files have correct syntax
3. Check server logs for parsing errors

### Run log is empty

Runs are stored in `run_logs/` directory. Check:
1. Directory is writable
2. Server has permission to write files

## Next Steps

- **[First Workflow](/first-workflow)** — Run your first automation
- **[Recording Mode](/features/recording)** — Create workflows
- **[Troubleshooting](/troubleshooting)** — Common issues
