# Step Types

Complete reference for all 20 step types available in SideButton.

## Browser Steps

### browser.navigate

Navigate to a URL.

```yaml
- type: browser.navigate
  url: "https://example.com"
  new_tab: false  # Optional: open in new tab
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to navigate to |
| `new_tab` | boolean | No | Open in new tab (default: false) |

### browser.click

Click an element.

```yaml
- type: browser.click
  selector: "button.submit"
  new_tab: false  # Optional: Ctrl+click to open in new tab
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | CSS selector or text selector |
| `new_tab` | boolean | No | Ctrl+click for new tab |

**Selector formats:**
- CSS: `button.submit`, `#login-btn`
- Text: `button:has-text('Submit')`
- Aria: `[aria-label="Close"]`

### browser.type

Type text into an input.

```yaml
- type: browser.type
  selector: "input[name='email']"
  text: "user@example.com"
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | CSS selector for input |
| `text` | string | Yes | Text to type |

### browser.scroll

Scroll the page.

```yaml
- type: browser.scroll
  direction: down
  amount: 500  # pixels
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `direction` | string | Yes | `up`, `down`, `left`, `right` |
| `amount` | number | No | Pixels to scroll (default: 300) |

::: tip Scroll in containers
Use `browser.hover` first to position the cursor inside a scrollable container.
:::

### browser.hover

Hover over an element.

```yaml
- type: browser.hover
  selector: ".dropdown-menu"
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | CSS selector |

### browser.wait

Wait for element or delay.

```yaml
# Wait for element
- type: browser.wait
  selector: ".loading-complete"
  timeout: 10000

# Fixed delay
- type: browser.wait
  ms: 2000
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | No | Wait for element to appear |
| `ms` | number | No | Fixed delay in milliseconds |
| `timeout` | number | No | Max wait time (default: 30000) |

### browser.extract

Extract text from an element.

```yaml
- type: browser.extract
  selector: "h1"
  as: page_title
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | CSS selector |
| `as` | string | Yes | Variable name to store result |

### browser.extractAll

Extract text from multiple elements.

```yaml
- type: browser.extractAll
  selector: ".list-item"
  as: items
  separator: ", "  # Optional
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | CSS selector |
| `as` | string | Yes | Variable name |
| `separator` | string | No | Join separator (default: ", ") |

### browser.exists

Check if element exists.

```yaml
- type: browser.exists
  selector: ".error-message"
  as: has_error
  timeout: 1000
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | CSS selector |
| `as` | string | Yes | Variable name (boolean) |
| `timeout` | number | No | Wait timeout (default: 1000) |

### browser.key

Send keyboard key.

```yaml
- type: browser.key
  key: Enter
  selector: "input.search"  # Optional: focus first
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `key` | string | Yes | Key name |
| `selector` | string | No | Element to focus first |

**Supported keys:** `Escape`, `Enter`, `Tab`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Backspace`, `Delete`, `Space`

## Shell Steps

### shell.run

Execute a shell command.

```yaml
- type: shell.run
  cmd: "echo 'Hello World'"
  cwd: "/path/to/dir"  # Optional
  as: output          # Optional
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cmd` | string | Yes | Command to run |
| `cwd` | string | No | Working directory |
| `as` | string | No | Variable for stdout |

### terminal.open

Open a visible terminal window (macOS).

```yaml
- type: terminal.open
  title: "My Terminal"
  cwd: "/path/to/project"
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | No | Terminal window title |
| `cwd` | string | No | Starting directory |

### terminal.run

Run command in open terminal.

```yaml
- type: terminal.run
  cmd: "npm run dev"
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cmd` | string | Yes | Command to run |

## LLM Steps

::: warning Requires API Key
Set `OPENAI_API_KEY` environment variable or configure in Settings.
:::

### llm.classify

Classify text into categories.

```yaml
- type: llm.classify
  input: "{{message}}"
  categories:
    - urgent
    - normal
    - spam
  as: category
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | string | Yes | Text to classify |
| `categories` | array | Yes | List of categories |
| `as` | string | Yes | Variable for result |

### llm.generate

Generate text with AI.

```yaml
- type: llm.generate
  prompt: "Summarize this article:\n{{content}}"
  as: summary
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Prompt for the LLM |
| `as` | string | Yes | Variable for result |

## Control Flow Steps

### control.if

Conditional branching.

```yaml
- type: control.if
  condition: "{{status}} == 'ready'"
  then:
    - type: browser.click
      selector: ".start-btn"
  else_steps:
    - type: control.stop
      message: "Not ready"
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `condition` | string | Yes | Condition to evaluate |
| `then` | array | Yes | Steps if true |
| `else_steps` | array | No | Steps if false |

**Operators:** `==`, `!=`

### control.retry

Retry steps on failure.

```yaml
- type: control.retry
  max_attempts: 3
  delay_ms: 1000
  steps:
    - type: browser.click
      selector: ".flaky-button"
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `steps` | array | Yes | Steps to retry |
| `max_attempts` | number | No | Max retries (default: 3) |
| `delay_ms` | number | No | Delay between retries (default: 1000) |

### control.stop

Stop workflow execution.

```yaml
- type: control.stop
  message: "Completed successfully"
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message` | string | No | Message to log |

## Workflow Steps

### workflow.call

Call another workflow.

```yaml
- type: workflow.call
  workflow: extract_data
  params:
    url: "{{target_url}}"
  as: data  # Namespace for child variables
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workflow` | string | Yes | Workflow ID to call |
| `params` | object | No | Parameters to pass |
| `as` | string | No | Namespace for variables |

## Data Steps

### data.first

Get first item from a list.

```yaml
- type: data.first
  input: "{{items}}"
  as: first_item
  separator: ", "
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | string | Yes | Comma-separated list |
| `as` | string | Yes | Variable for first item |
| `separator` | string | No | List separator (default: ", ") |
