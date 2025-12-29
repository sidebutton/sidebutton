# REST API

HTTP endpoints for mobile apps and external integrations.

## Overview

SideButton exposes REST endpoints alongside MCP for simpler integrations:

```
Base URL: http://localhost:9876/api
```

## Endpoints

### List Workflows

```http
GET /api/workflows
```

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `source` | string | Filter: `all`, `actions`, `workflows` |

**Response:**

```json
{
  "workflows": [
    {
      "id": "hello_world",
      "title": "Hello World",
      "category": {
        "level": "primitive",
        "domain": "personal"
      },
      "params": {}
    },
    {
      "id": "github_pr_review",
      "title": "GitHub: PR Review",
      "category": {
        "level": "process",
        "domain": "engineering"
      },
      "params": {
        "org": "string",
        "repo": "string",
        "pr_number": "string"
      }
    }
  ]
}
```

---

### Run Workflow

```http
POST /api/workflows/{id}/run
Content-Type: application/json
```

**Path Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `id` | string | Workflow ID |

**Request Body:**

```json
{
  "params": {
    "org": "mycompany",
    "repo": "myproject",
    "pr_number": "123"
  }
}
```

**Response:**

```json
{
  "run_id": "github_pr_review_20251225_143022",
  "status": "started"
}
```

---

### List Run Logs

```http
GET /api/runs
```

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `limit` | number | Max results (default: 10) |
| `workflow_id` | string | Filter by workflow ID |

**Response:**

```json
{
  "runs": [
    {
      "run_id": "hello_world_20251225_143022",
      "workflow_id": "hello_world",
      "status": "completed",
      "started_at": "2025-12-25T14:30:22Z",
      "duration_ms": 1234
    }
  ]
}
```

---

### Get Run Log

```http
GET /api/runs/{run_id}
```

**Path Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `run_id` | string | Run ID |

**Response:**

```json
{
  "run_id": "hello_world_20251225_143022",
  "workflow_id": "hello_world",
  "status": "completed",
  "started_at": "2025-12-25T14:30:22Z",
  "duration_ms": 1234,
  "params": {},
  "variables": {
    "page_title": "Node.js - Wikipedia"
  },
  "events": [
    {
      "type": "step_start",
      "step": "browser.navigate",
      "timestamp": "2025-12-25T14:30:22Z"
    },
    {
      "type": "step_complete",
      "step": "browser.navigate",
      "timestamp": "2025-12-25T14:30:23Z"
    }
  ]
}
```

---

### Get Settings

```http
GET /api/settings
```

**Response:**

```json
{
  "shortcuts": [
    {
      "workflow_id": "hello_world",
      "icon": "🌍",
      "position": 0
    }
  ],
  "contexts": [
    {
      "type": "env",
      "name": "github_base_path",
      "value": "/Users/me/GitHub"
    }
  ]
}
```

---

### Health Check

```http
GET /health
```

**Response:**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "browser_connected": true,
  "server_running": true
}
```

## Error Responses

### 400 Bad Request

```json
{
  "error": "Missing required parameter: org"
}
```

### 404 Not Found

```json
{
  "error": "Workflow not found: invalid_id"
}
```

### 500 Internal Server Error

```json
{
  "error": "Browser not connected"
}
```

## Usage Examples

### cURL

**List workflows:**
```bash
curl http://localhost:9876/api/workflows
```

**Run workflow:**
```bash
curl -X POST http://localhost:9876/api/workflows/hello_world/run \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Run with parameters:**
```bash
curl -X POST http://localhost:9876/api/workflows/github_pr_review/run \
  -H "Content-Type: application/json" \
  -d '{"params": {"org": "myco", "repo": "myrepo", "pr_number": "42"}}'
```

**Get run log:**
```bash
curl http://localhost:9876/api/runs/hello_world_20251225_143022
```

### JavaScript/TypeScript

```typescript
// List workflows
const response = await fetch('http://localhost:9876/api/workflows');
const { workflows } = await response.json();

// Run workflow
const runResponse = await fetch(
  'http://localhost:9876/api/workflows/hello_world/run',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params: {} })
  }
);
const { run_id } = await runResponse.json();

// Poll for completion
const logResponse = await fetch(`http://localhost:9876/api/runs/${run_id}`);
const log = await logResponse.json();
```

### Python

```python
import requests

# List workflows
workflows = requests.get('http://localhost:9876/api/workflows').json()

# Run workflow
response = requests.post(
    'http://localhost:9876/api/workflows/hello_world/run',
    json={'params': {}}
)
run_id = response.json()['run_id']

# Get results
log = requests.get(f'http://localhost:9876/api/runs/{run_id}').json()
```

## Network Access

The server binds to `0.0.0.0:9876` allowing access from:

- **Same machine:** `http://localhost:9876`
- **Local network:** `http://<your-ip>:9876`
- **Docker:** `http://host.docker.internal:9876`

::: warning Security Note
The API has no authentication. Only expose on trusted networks.
:::

## Mobile App Integration

The REST API is designed for the React Native mobile app:

1. **Discovery:** `GET /api/workflows` to show available automations
2. **Execution:** `POST /api/workflows/{id}/run` to trigger
3. **Status:** `GET /api/runs/{id}` to show results

## Comparison: REST vs MCP

| Aspect | REST API | MCP |
|--------|----------|-----|
| Use case | Mobile apps, scripts | AI assistants |
| Protocol | HTTP JSON | JSON-RPC 2.0 |
| Browser tools | Not available | Full access |
| Workflow tools | Full access | Full access |
| Best for | Simple integrations | AI-powered automation |

## Next Steps

- **[MCP Overview](/mcp/overview)** — AI assistant integration
- **[MCP Tools](/mcp/tools)** — Full tool reference
- **[Workflow Examples](/workflows/examples)** — Example workflows
