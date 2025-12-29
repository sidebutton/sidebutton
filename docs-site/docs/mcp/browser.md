# Browser Tools

Direct browser control via MCP for AI-assisted automation.

## Overview

Browser tools let AI assistants control your browser directly:

- Navigate to pages
- Click buttons and links
- Fill forms
- Extract content
- Take screenshots

## When to Use Browser Tools

| Use Case | Approach |
|----------|----------|
| Exploring a new site | Use `snapshot` + direct tools |
| Repeated automation | Create a workflow |
| Testing/debugging | Direct tools |
| AI research tasks | Browser tools + extraction |

## Core Workflow

### 1. Navigate

```
Navigate to https://github.com/trending
```

Tool: `navigate`

### 2. Understand the Page

```
Take a snapshot of the current page
```

Tool: `snapshot`

Returns YAML with element refs:

```yaml
- main [ref=1]
  - article "Repository" [ref=2]
    - heading "repo-name" [ref=3]
    - link "Star" [ref=4]
```

### 3. Interact

```
Click the element with ref 4
```

Tool: `click` with `ref: 4`

### 4. Extract Data

```
Extract the text from the page title
```

Tool: `extract` with selector

## Snapshot-Based Interaction

The `snapshot` tool returns element refs that provide reliable targeting:

### Getting a Snapshot

```json
// Tool call
{ "name": "snapshot" }

// Response
- Page URL: https://example.com
- heading "Welcome" [ref=1]
- button "Get Started" [ref=2]
- textbox "Email" [ref=3]
```

### Using Refs

Refs are more reliable than selectors for dynamic pages:

```json
// Click by ref
{
  "name": "click",
  "arguments": {
    "ref": 2,
    "element": "Get Started button"
  }
}

// Type by ref
{
  "name": "type",
  "arguments": {
    "ref": 3,
    "text": "user@example.com",
    "submit": true
  }
}
```

## Selector-Based Interaction

For workflows or when you know the selector:

### CSS Selectors

```json
{
  "name": "click",
  "arguments": {
    "selector": "button.btn-primary"
  }
}
```

### Text Selectors

```json
{
  "name": "click",
  "arguments": {
    "selector": "button:has-text('Submit')"
  }
}
```

### Attribute Selectors

```json
{
  "name": "click",
  "arguments": {
    "selector": "[data-testid='submit-btn']"
  }
}
```

## Scrolling in Containers

For nested scrollable areas (like chat lists):

### 1. Hover to Position

```json
{
  "name": "hover",
  "arguments": {
    "selector": ".message-list"
  }
}
```

### 2. Scroll from Position

```json
{
  "name": "scroll",
  "arguments": {
    "direction": "down",
    "amount": 500
  }
}
```

The scroll uses the hover position, not viewport center.

## Finding Selectors

### Using capture_page

Get all interactive elements:

```json
{ "name": "capture_page" }
```

Returns:

```markdown
# Page Capture: GitHub

**URL:** https://github.com/trending

## data-testid Selectors
| Selector | Count |
|----------|-------|
| `[data-testid="repo-card"]` | 25 |

## Interactive Elements
| Type | Text | Selector |
|------|------|----------|
| button | Star | `button.star-button` |
| link | Sign in | `a[href="/login"]` |
```

### Using Browser DevTools

1. Right-click element → Inspect
2. Find unique attributes
3. Test selector in console: `document.querySelector('...')`

## Screenshots

Capture the current page:

```json
{ "name": "screenshot" }
```

Returns base64-encoded PNG that AI can analyze.

## Example: Research Task

**User:** Find the top 3 trending Python repositories on GitHub

**AI Actions:**

1. Navigate to GitHub trending
```json
{ "name": "navigate", "arguments": { "url": "https://github.com/trending/python" }}
```

2. Snapshot the page
```json
{ "name": "snapshot" }
```

3. Extract repository names
```json
{ "name": "extract", "arguments": { "selector": ".repo-name" }}
```

4. Report findings

## Example: Form Filling

**User:** Fill out the contact form on example.com

**AI Actions:**

1. Navigate
```json
{ "name": "navigate", "arguments": { "url": "https://example.com/contact" }}
```

2. Snapshot to find form fields
```json
{ "name": "snapshot" }
```

3. Type into fields
```json
{ "name": "type", "arguments": { "ref": 5, "text": "John Doe" }}
{ "name": "type", "arguments": { "ref": 6, "text": "john@example.com" }}
{ "name": "type", "arguments": { "ref": 7, "text": "Hello, I have a question..." }}
```

4. Submit
```json
{ "name": "click", "arguments": { "ref": 8, "element": "Submit button" }}
```

## Limitations

### What Browser Tools Can't Do

- Actions requiring native popups (file upload dialogs)
- Cross-origin iframe content (some cases)
- Browser-level actions (downloads, extensions)
- Sites with strong anti-automation

### Workarounds

| Limitation | Workaround |
|------------|------------|
| File uploads | Use native automation or manual step |
| Anti-bot | Use real browser with human verification |
| iframes | Navigate to iframe src directly if possible |

## Best Practices

### 1. Always Snapshot First

Before interacting with a new page:
```
Take a snapshot so I can see what elements are available
```

### 2. Use Refs Over Selectors

Refs from snapshot are more reliable for dynamic pages.

### 3. Wait for Dynamic Content

If page loads dynamically:
1. Navigate
2. Wait a moment
3. Snapshot

### 4. Verify Actions

After clicking/typing:
1. Snapshot again
2. Verify page changed as expected

### 5. Handle Errors Gracefully

If element not found:
1. Re-snapshot
2. Try alternative selector
3. Check if page state changed

## Troubleshooting

### "Element not found"

1. Snapshot the page to see current structure
2. Verify selector matches
3. Check if element is in iframe
4. Element may be dynamically loaded

### "Browser not connected"

1. Check extension is installed
2. Navigate to a webpage
3. Click extension icon → Connect

### Clicks not working

1. Element may be covered by overlay
2. Try scrolling element into view
3. Check for hover states that must trigger first
4. Use `hover` before `click`
