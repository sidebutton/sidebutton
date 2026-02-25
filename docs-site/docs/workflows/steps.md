# Step Types

Complete reference for all 27 step types available in SideButton.

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

# Named delay constant (resolves to base value ±10% jitter)
- type: browser.wait
  ms: "mid"
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | No | Wait for element to appear |
| `ms` | number \| [DelayConstant](#delay-constants) | No | Fixed delay in milliseconds or named constant |
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

### browser.snapshot

Capture an accessibility snapshot of the page. Returns a structured YAML representation of the page's accessibility tree, useful for LLM-driven analysis.

```yaml
- type: browser.snapshot
  as: page_snapshot
  includeContent: true
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `as` | string | Yes | Variable name to store snapshot |
| `includeContent` | boolean | No | Include visible text content (default: false) |

### browser.injectCSS

Inject CSS styles into the page.

```yaml
- type: browser.injectCSS
  css: |
    .highlight { background: yellow; }
  id: "my-styles"
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `css` | string | Yes | CSS rules to inject |
| `id` | string | No | Style element ID for replacement/idempotency |

::: tip Idempotent injection
When `id` is provided and a style element with that ID already exists, its content is replaced instead of creating a duplicate.
:::

### browser.injectJS

Inject JavaScript into the page.

```yaml
- type: browser.injectJS
  js: |
    document.querySelector('.dropdown').click();
  id: "my-script"
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `js` | string | Yes | JavaScript code to inject |
| `id` | string | No | Script element ID for replacement/idempotency |

::: tip Idempotent injection
When `id` is provided and a script element with that ID already exists, its content is replaced instead of creating a duplicate.
:::

### browser.select_option

Select an option from a `<select>` dropdown. Matches by value or visible label text.

```yaml
- type: browser.select_option
  selector: "select#country"
  label: "United States"
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | CSS selector for `<select>` element |
| `value` | string | No | Option value to select |
| `label` | string | No | Option visible text to select |

### browser.scrollIntoView

Scroll an element into the visible viewport.

```yaml
- type: browser.scrollIntoView
  selector: "#footer-section"
  block: center
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | CSS selector |
| `block` | string | No | Scroll alignment: `start`, `center` (default), `end`, `nearest` |

### browser.fill

Set an input value directly. Works with React controlled inputs by using native value setters and dispatching synthetic events.

```yaml
- type: browser.fill
  selector: "input[name='date']"
  value: "2026-03-01"
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | CSS selector for input |
| `value` | string | Yes | Value to set |

::: tip When to use fill vs type
Use `browser.fill` instead of `browser.type` for date inputs, React-controlled inputs, or when you need to set a value without triggering the native input UI (e.g., date pickers).
:::

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
| `delay_ms` | number \| [DelayConstant](#delay-constants) | No | Delay between retries (default: 1000) |

### control.foreach

Iterate over a list of items.

```yaml
- type: control.foreach
  items: "{{user_list}}"
  as: user
  separator: ","
  delay_ms: "small"
  steps:
    - type: browser.click
      selector: "button[data-user='{{user}}']"
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `items` | string | Yes | Interpolated string to split into items |
| `as` | string | Yes | Variable name for current item |
| `steps` | array | Yes | Steps to execute per item |
| `separator` | string | No | Item separator (default: `,`) |
| `index_as` | string | No | Variable name for current index |
| `max_items` | number | No | Max items to process (default: 1000) |
| `delay_ms` | number \| [DelayConstant](#delay-constants) | No | Delay between iterations (default: 0) |

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

### variable.set

Set a variable value directly.

```yaml
- type: variable.set
  name: base_url
  value: "https://example.com"
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Variable name to set |
| `value` | string | Yes | Value to assign (supports interpolation) |

## Delay Constants

Any `delay_ms` or `ms` parameter that accepts a number also accepts a named delay constant. Named constants resolve to a base millisecond value with ±10% random jitter on each invocation, making automation timing less predictable and more human-like.

| Constant | Base | Range |
|----------|------|-------|
| `"small"` | 500ms | 450–550ms |
| `"mid"` | 1000ms | 900–1100ms |
| `"large"` | 5000ms | 4500–5500ms |

Raw numeric values are used as-is without jitter.

**Applies to:** `browser.wait` → `ms`, `control.retry` → `delay_ms`, `control.foreach` → `delay_ms`
