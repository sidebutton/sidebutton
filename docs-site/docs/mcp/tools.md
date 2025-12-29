# MCP Tools Reference

Complete reference for all MCP tools available in SideButton.

## Workflow Tools

### run_workflow

Execute a workflow automation.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workflow_id` | string | Yes | Workflow ID to execute |
| `params` | object | No | Parameters for the workflow |

**Example:**

```json
{
  "workflow_id": "github_pr_review",
  "params": {
    "org": "mycompany",
    "repo": "myproject",
    "pr_number": "123"
  }
}
```

**Response:**

```
Workflow 'github_pr_review' completed successfully.

Run ID: github_pr_review_20251225_143022

Use get_run_log tool with this run_id to see detailed execution results.
```

---

### list_workflows

List all available workflows.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source` | string | No | Filter by source: `all`, `actions`, `workflows` |

**Example:**

```json
{
  "source": "actions"
}
```

**Response:** Markdown list of workflows with IDs, titles, and parameters.

---

### get_workflow

Get the full YAML definition of a workflow.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workflow_id` | string | Yes | Workflow ID |

**Response:** Complete YAML workflow definition.

---

### get_run_log

Get detailed execution log for a completed run.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | Yes | Run ID from run_workflow response |

**Response:** Markdown formatted log including:
- Status (completed/failed)
- Duration
- Parameters used
- Step-by-step events
- Extracted variables
- Error messages

---

### list_run_logs

List recent workflow executions.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | number | No | Max results (default: 10) |
| `workflow_id` | string | No | Filter by workflow ID |

**Response:** List of recent runs with status and timestamps.

---

## Browser Control Tools

### get_browser_status

Check if the browser extension is connected.

**Parameters:** None

**Response:**

```markdown
# Browser Status

- **Server Running:** true
- **Browser Connected:** true
- **Tab ID:** 123456
- **Recording:** false
```

---

### navigate

Navigate the browser to a URL.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url` | string | Yes | URL to navigate to |

**Example:**

```json
{
  "url": "https://github.com"
}
```

**Response:** `Navigated to: https://github.com`

---

### snapshot

Capture an accessibility snapshot of the current page as YAML.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `includeContent` | boolean | No | Include visible text content |

**Response:**

```yaml
- Page URL: https://example.com
- Page Title: Example Domain
- Page Snapshot:
- main [ref=1]
  - heading "Example Domain" [ref=2]
  - paragraph [ref=3]
  - link "More information..." [ref=4]
```

Use `ref` numbers with `click` and `type` tools.

---

### click

Click an element on the page.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `ref` | number | No* | Element ref from snapshot |
| `selector` | string | No* | CSS selector |
| `element` | string | No | Description for logging |

*One of `ref` or `selector` required.

**Examples:**

```json
// By ref (from snapshot)
{
  "ref": 4,
  "element": "More information link"
}

// By selector
{
  "selector": "button.submit"
}

// With text selector
{
  "selector": "button:has-text('Submit')"
}
```

---

### type

Type text into an input element.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `text` | string | Yes | Text to type |
| `ref` | number | No* | Element ref from snapshot |
| `selector` | string | No* | CSS selector |
| `submit` | boolean | No | Press Enter after typing |
| `element` | string | No | Description for logging |

**Example:**

```json
{
  "ref": 7,
  "text": "search query",
  "submit": true
}
```

---

### scroll

Scroll the page in a direction.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `direction` | string | Yes | `up`, `down`, `left`, `right` |
| `amount` | number | No | Pixels to scroll (default: 300) |

**Example:**

```json
{
  "direction": "down",
  "amount": 500
}
```

::: tip Scrolling in containers
Use `hover` first to position the cursor inside a scrollable container.
:::

---

### extract

Extract text content from an element.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `selector` | string | Yes | CSS selector |

**Response:** Text content of the matched element.

---

### screenshot

Capture a screenshot of the current page.

**Parameters:** None

**Response:** Base64-encoded PNG image.

---

### hover

Hover over an element (position cursor).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `selector` | string | Yes | CSS selector |

**Use case:** Position cursor before scrolling in nested containers.

---

### capture_page

Capture all selectors and interactive elements from the current page.

**Parameters:** None

**Response:** Markdown formatted report including:
- Page URL and title
- `data-testid` selectors
- `aria-label` selectors
- Semantic class selectors
- Interactive elements (buttons, links, inputs)
- Form fields

**Use case:** Discover selectors when building workflows.

---

## Error Responses

MCP tools return JSON-RPC errors when operations fail:

| Code | Meaning |
|------|---------|
| `-32602` | Invalid parameters |
| `-32603` | Internal error |

**Common errors:**

| Error | Cause | Solution |
|-------|-------|----------|
| `BrowserNotConnected` | Extension not connected | Connect extension |
| `Workflow not found` | Invalid workflow_id | Check list_workflows |
| `Element not found` | Selector doesn't match | Verify selector |
| `Missing required parameter` | Params not provided | Check workflow params |

## Usage Tips

### Workflow vs Direct Control

| Scenario | Best Approach |
|----------|---------------|
| Repeated task | Create workflow, use `run_workflow` |
| Exploration | Use direct browser tools |
| Testing | Direct tools for inspection |
| Production | Workflows for reliability |

### Efficient Page Inspection

1. Use `snapshot` to get page structure
2. Use `ref` numbers for reliable element targeting
3. Use `capture_page` to find selectors for workflows

### Handling Dynamic Pages

1. Use `snapshot` after navigation
2. Wait for content to load
3. Re-snapshot if page updates
