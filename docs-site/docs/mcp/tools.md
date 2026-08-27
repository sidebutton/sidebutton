---
docs_agent:
  sources:
    - pack: sidebutton.local
      module: server-api
      version: 1.4.15
      verified: "2026-08-25"
  updated: "2026-08-27"
---

# MCP Tools Reference

Complete reference for all **29 MCP tools** the SideButton server exposes, generated from the server's own tool registry. Tools marked **read-only** never change page, input, or workflow state.

Connect a client first — see [MCP Setup](/mcp-setup). Browser tools require the Chrome extension to be connected (check with `get_browser_status`); the deep-dive on selectors and snapshots lives in [Browser Tools](/mcp/browser).

## Workflow & Run Tools

Run workflow automations and read their results.

### run_workflow

**Run Workflow**

Execute a workflow automation by ID. Returns a run_id for tracking execution status.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `workflow_id` | string | Yes | Unique identifier of the workflow |
| `params` | object | No | Key-value parameters required by the workflow |

### get_workflow

**Get Workflow** · **read-only**

Get detailed information about a specific workflow.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `workflow_id` | string | Yes | Unique identifier of the workflow |

### list_workflows

**List Workflows** · **read-only**

List all available workflow automations.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `source` | string | No | Filter by source Values: `all`, `actions`, `workflows`. |

### get_run_log

**Get Run Log** · **read-only**

Retrieve the execution log for a completed workflow run.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `run_id` | string | Yes | The run ID returned from run_workflow |

### list_run_logs

**List Run Logs** · **read-only**

List recent workflow execution logs.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `limit` | number | No | Maximum number of logs to return |
| `workflow_id` | string | No | Filter logs by workflow ID |

## Artifact Tools

Publish files from a running job to the portal.

### publish_artifact

**Publish Artifact**

Publish a piece of evidence (a screenshot, a design mockup, an RCA/coverage report) to the portal RIGHT NOW, mid-session, and get back a paste-ready snippet to cite in your ONE resolution comment on the ticket. The file is uploaded, attached to the ticket automatically, and given a tokenized no-login download link — the snippet contains that link plus the Jira inline-attachment reference. Use this the moment you have evidence worth showing, instead of waiting for the end of the session (nothing you save after your comment is written can be cited in it). Only works on a dispatched job (it needs the on-box job context); on a ticketless/chat job it returns a download link only. Files must be ≤ 25 MB and live under your home directory. On any failure the file is left on disk and still uploads at session end, so save deliverables under artifacts/ as a fallback.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Path to the file to publish. A relative path resolves against your workspace (~/workspace); an absolute path is also accepted, as long as it stays within your home directory. |
| `kind` | string | No | Gallery category. Optional — inferred from the file extension when omitted (images → screenshot, .svg/.html → mock, .pdf/.md/.txt/.csv/.json → report). Values: `screenshot`, `mock`, `report`. |
| `caption` | string | No | Optional short label for the snippet. Shown only in the returned snippet as a hint for your comment; it is NOT stored on the artifact. |

## Browser Session Tools

Connection status, whole-page capture, and HTTP auth for the controlled browser.

### get_browser_status

**Get Browser Status** · **read-only**

Check if the browser extension is connected.

_No parameters._

### capture_page

**Capture Page Selectors** · **read-only**

Capture selectors and interactive elements from the current page.

_No parameters._

### set_basic_auth

**Set HTTP Basic Auth**

Provide HTTP Basic Auth credentials so the browser logs in silently instead of showing the native username/password modal, which would otherwise block the page and hang automation. Applies to the connected tab. Omit "origin" to use the credentials for any site that challenges; pass "origin" (e.g. "https://staging.example.com") to scope them to one site. When a challenge has no matching credentials it is dismissed so the page never hangs.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `username` | string | Yes | Basic Auth username. |
| `password` | string | Yes | Basic Auth password. |
| `origin` | string | No | Optional origin to scope the credentials to (e.g. "https://staging.example.com"). Omit to apply to any challenged site. |

### clear_basic_auth

**Clear HTTP Basic Auth**

Remove stored HTTP Basic Auth credentials. Omit "origin" to clear all stored credentials; pass "origin" to clear just that site.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `origin` | string | No | Optional origin to clear (e.g. "https://staging.example.com"). Omit to clear all stored credentials. |

## Navigation & Inspection Tools

Move around and read the page without changing it.

### navigate

**Navigate Browser**

Navigate the connected browser tab to a URL.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | Yes | The URL to navigate to |

### snapshot

**Accessibility Snapshot** · **read-only**

Capture accessibility snapshot of the current page. Returns YAML with element refs for use with click/type. Use includeContent=true to also include visible text content as markdown. Note: taking a snapshot may dismiss inline modals or popups — use screenshot instead if you need to verify modal content.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `includeContent` | boolean | No | Include visible text content in the snapshot as markdown (default: false). Useful for reading articles, documentation, or any page content. |

### exists

**Check Element Exists** · **read-only**

Check if an element exists on the page. Returns true/false without throwing. Useful for conditional logic.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | Yes | CSS selector to check. |
| `timeout` | number | No | How long to wait before returning false, in milliseconds (default: 2000). |

### wait

**Wait for Element** · **read-only**

Wait for an element to appear on the page. Blocks until the element matching the selector exists in the DOM, or throws after timeout.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | Yes | CSS selector to wait for. |
| `timeout` | number | No | Maximum wait time in milliseconds (default: 5000). |

### extract

**Extract Element Text** · **read-only**

Extract text content from an element.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | Yes | CSS selector for the element. |

### extract_all

**Extract All Matching** · **read-only**

Extract text from all elements matching a selector, joined by a separator. Useful for getting lists of items, table columns, or repeated elements.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | Yes | CSS selector matching multiple elements. |
| `separator` | string | No | String to join results with (default: "\n"). |
| `attribute` | string | No | Optional attribute to extract instead of text content (e.g., "href", "src"). |

### extract_map

**Extract Structured Data** · **read-only**

Extract structured data from repeated elements. For each element matching the outer selector, extracts named fields using sub-selectors. Returns JSON array of objects.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | Yes | CSS selector for the repeating container elements (e.g., "table tbody tr", ".card"). |
| `fields` | object | Yes | Map of field names to extraction rules. Each rule has a "selector" (relative CSS selector) and optional "attribute". |

### screenshot

**Take Screenshot**

Capture a screenshot of the current page. Prefer cropping to a specific area instead of capturing the full viewport — use ref (from snapshot), selector (CSS), or region (manual rect) to save context tokens. Full viewport is fine for first visit to a new page; after that, crop to the relevant section. Pass path to write the PNG to a file instead of returning image bytes — that is what you want for docs screenshots and QA evidence, since the file can then be published with publish_artifact and never enters your context.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `ref` | number | No | Element reference from snapshot (the number after ref=). Crops screenshot to that element with padding. |
| `selector` | string | No | CSS selector for the element. Crops screenshot to that element with padding. |
| `region` | object | No | Manual crop region in CSS pixels (viewport coordinates). |
| `path` | string | No | Write the PNG here instead of returning image bytes; returns the path and byte count as text. Accepts ~/... or an absolute path; a relative path resolves against ~/workspace. Must stay inside the home directory. Parent directories are created, and an existing file is overwritten. |

## Interaction Tools

Act on the page: click, type, select, scroll, and scripted batches.

### click

**Click Element**

Click an element on the page.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | No | CSS selector for the element. Supports :has-text("text") pseudo-selector. |
| `ref` | number | No | Element reference from snapshot (the number after ref=). |
| `element` | string | No | Human-readable element description (for logging). |

### type

**Type Text**

Type text into an input element.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | No | CSS selector for the input element. |
| `ref` | number | No | Element reference from snapshot. |
| `element` | string | No | Human-readable element description. |
| `text` | string | Yes | Text to type. |
| `submit` | boolean | No | Press Enter after typing (default: false). |

### fill

**Fill Form Field**

Fill a form field by setting its value programmatically. Unlike "type" (which simulates keystrokes), "fill" sets the value directly and triggers React/Vue/Angular change events. Use this for framework-controlled inputs where "type" doesn't work.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | Yes | CSS selector for the input element. |
| `value` | string | Yes | Value to set on the input. |

### press_key

**Press Key**

Press a key on the keyboard. Use this for keyboard shortcuts, Tab navigation, Enter, Escape, arrow keys, etc. Supports key combinations like "Ctrl+A" or "Shift+Tab".

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | Key to press. Examples: "Tab", "Enter", "Escape", "ArrowDown", "Backspace", "Shift+Tab", "Ctrl+A". For single characters, use the character directly (e.g., "a"). |
| `selector` | string | No | Optional CSS selector to focus before pressing the key. |
| `ref` | number | No | Optional element reference from snapshot to focus before pressing the key. |

### select_option

**Select Dropdown Option**

Select an option from a native `<select>` dropdown element. Use this instead of click for `<select>` elements, as native dropdowns cannot be controlled via click events.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | No | CSS selector for the `<select>` element. |
| `ref` | number | No | Element reference from snapshot (the number after ref=). |
| `element` | string | No | Human-readable element description (for logging). |
| `value` | string | No | The option value to select (matches `<option value="...">`). |
| `label` | string | No | The visible text of the option to select (matches `<option>` text content). |

### hover

**Hover Element**

Hover over an element (positions cursor for scroll targeting).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | Yes | CSS selector for the element. |

### scroll

**Scroll Page**

Scroll the page.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `direction` | string | Yes | Scroll direction. Values: `up`, `down`, `left`, `right`. |
| `amount` | number | No | Scroll amount in pixels (default: 300). |

### scroll_into_view

**Scroll Element Into View**

Scroll a specific element into the viewport. More precise than "scroll" — targets an exact element.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | Yes | CSS selector for the element to scroll into view. |
| `block` | string | No | Vertical alignment in viewport (default: "center"). Values: `start`, `center`, `end`, `nearest`. |

### inject_css

**Inject CSS**

Inject a CSS rule into the current page. The main use is pre-capture redaction: blur or hide sensitive elements, then screenshot to a file, so no unredacted image ever exists. Pass an id to make the injection replaceable — injecting the same id again swaps the rule rather than stacking a second one.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `css` | string | Yes | CSS to inject, e.g. ".user-email { filter: blur(6px); }" |
| `id` | string | No | Optional identifier for the injected style element, so it can be replaced or removed later. |

### evaluate

**Evaluate JavaScript**

Execute JavaScript in the browser page context and return the result. Useful for reading page state, checking values, or performing calculations.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `js` | string | Yes | JavaScript code to evaluate in the page context. |

### browser_batch

**Batch Browser Actions**

Run a SEQUENCE of browser actions in ONE call instead of one round trip per action. Each step is the same shape you would pass to the individual tool, plus a "cmd" field naming which tool to run.

A batch is a DETERMINISTIC run: actions you already know the selectors for, executed top to bottom, halting at the first failure (unless on_error:"continue"). By default it ends by returning a fresh accessibility snapshot of the resulting page, so you can decide the next move in the same turn. The moment you need to SEE something before choosing an action, end the batch and read the returned snapshot.

Guidance:
- Prefer CSS selectors over refs inside a batch. Refs come from a prior snapshot and go stale the instant a step re-renders the page; selectors survive.
- After a navigate (or an action that loads new content), add a { "cmd": "wait", "selector": "..." } step before interacting with the new content.
- Add "optional": true to a step whose failure should not halt the batch.
- Add "return": "drop" to a side-effect-only step you do not need echoed back (e.g. a screenshot taken only to trigger lazy-load).

Batchable cmds: navigate, wait, exists, click, type, fill, press_key, select_option, scroll, scroll_into_view, hover, extract, extract_all, extract_map, snapshot, screenshot, inject_css, evaluate.

To capture a redacted screenshot in one call: navigate → inject_css (blur the sensitive selectors) → wait → screenshot with a "path". The shot lands on disk already redacted and no image bytes come back.

Example — log in then land on the dashboard in one call:
{ "steps": [ { "cmd": "navigate", "url": "https://app.example.com/login" }, { "cmd": "wait", "selector": "#user" }, { "cmd": "fill", "selector": "#user", "value": "alice" }, { "cmd": "fill", "selector": "#pw", "value": "secret" }, { "cmd": "click", "selector": "button[type=submit]" }, { "cmd": "wait", "selector": ".dashboard" } ] }

| Parameter | Type | Required | Description |
|---|---|---|---|
| `steps` | array of objects | Yes | Ordered list of actions. Each item is { "cmd": "`<tool name>`", ...that tool's arguments }. Optional per-step keys: "optional" (boolean — failure never halts the batch) and "return": "drop" (omit this step's output from the response). |
| `on_error` | string | No | "stop" (default): halt at the first failed step, marking the rest skipped. "continue": run every step regardless. Values: `stop`, `continue`. |
| `snapshot_tail` | boolean | No | Append a fresh accessibility snapshot of the final page to the response so you can decide the next action (default: true). Skipped automatically when the last step is already a snapshot or screenshot. Set false to opt out. |

## Next Steps

- **[MCP Setup](/mcp-setup)** — Connect Claude Code, Cursor, or any MCP client
- **[Browser Tools](/mcp/browser)** — How snapshots, refs, and selectors work
- **[MCP Overview](/mcp/overview)** — Transports and architecture
