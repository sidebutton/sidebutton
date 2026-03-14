# Step Types

Complete reference for all 45 step types available in SideButton (42 implemented, 3 chat types pending).

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

# Named delay constant (resolves to base value +/-10% jitter)
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

### browser.extractMap

Extract structured data from repeated elements, mapping child selectors to named fields.

```yaml
- type: browser.extractMap
  selector: ".user-row"
  fields:
    name:
      selector: ".user-name"
    email:
      selector: ".user-email"
    role:
      selector: ".user-role"
      attribute: "data-role"
  as: user_data
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | CSS selector for container elements |
| `fields` | object | Yes | Map of field names to `{ selector, attribute? }` |
| `as` | string | Yes | Variable name to store result |
| `separator` | string | No | Row separator (default: newline) |

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

### llm.decide

Present a situation and a list of possible actions to the LLM, and let it pick the best one based on its role context.

```yaml
- type: llm.decide
  input: "{{situation}}"
  actions:
    - id: escalate
      description: "Escalate to a human"
    - id: respond
      description: "Send an automated response"
    - id: ignore
      description: "No action needed"
  as: chosen_action
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | string | Yes | Situation description |
| `actions` | array | Yes | List of `{ id, description }` actions |
| `as` | string | Yes | Variable for chosen action ID |

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
| `timeout` | number | No | Max execution time in ms |

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

### data.get

Get an item from a list by index.

```yaml
- type: data.get
  input: "{{items}}"
  index: "2"
  as: third_item
  separator: ", "
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | string | Yes | Delimited list |
| `index` | string | Yes | Zero-based index (supports interpolation) |
| `as` | string | Yes | Variable for result |
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

## Issues Steps

Abstract issue tracker steps. Provider is auto-detected from environment variables (Jira, GitHub Issues, etc.).

::: warning Requires Provider
Configure an issues provider (e.g., set `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN` for Jira).
:::

### issues.create

Create a new issue.

```yaml
- type: issues.create
  project: "PROJ"
  summary: "Bug: login fails on mobile"
  description: "Steps to reproduce..."
  issue_type: "Bug"
  labels:
    - mobile
    - critical
  as: issue_key
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project` | string | Yes | Project key |
| `summary` | string | Yes | Issue title |
| `description` | string | No | Issue body |
| `issue_type` | string | No | Issue type (e.g., Bug, Story) |
| `labels` | array | No | Labels to apply |
| `provider` | string | No | Force specific provider |
| `site` | string | No | Provider site/host |
| `as` | string | No | Variable for issue key |

### issues.get

Get issue details.

```yaml
- type: issues.get
  issue_key: "PROJ-123"
  fields: "summary,status,assignee"
  as: issue
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issue_key` | string | Yes | Issue identifier |
| `fields` | string | No | Comma-separated fields to return |
| `provider` | string | No | Force specific provider |
| `site` | string | No | Provider site/host |
| `as` | string | No | Variable for result |

### issues.search

Search for issues.

```yaml
- type: issues.search
  query: "project = PROJ AND status = 'To Do'"
  max_results: 10
  as: results
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query (JQL for Jira) |
| `max_results` | number | No | Max results to return |
| `fields` | string | No | Comma-separated fields to return |
| `provider` | string | No | Force specific provider |
| `site` | string | No | Provider site/host |
| `as` | string | No | Variable for results |

### issues.attach

Attach files to an issue.

```yaml
- type: issues.attach
  issue_key: "PROJ-123"
  files:
    - filename: "screenshot.png"
      data: "{{screenshot_base64}}"
      content_type: "image/png"
  as: result
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issue_key` | string | Yes | Issue identifier |
| `files` | array | Yes | Files to attach: `{ filename, data, content_type? }` |
| `provider` | string | No | Force specific provider |
| `site` | string | No | Provider site/host |
| `as` | string | No | Variable for result |

### issues.transition

Transition an issue to a new status.

```yaml
- type: issues.transition
  issue_key: "PROJ-123"
  status: "In Progress"
  as: result
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issue_key` | string | Yes | Issue identifier |
| `status` | string | Yes | Target status name |
| `provider` | string | No | Force specific provider |
| `site` | string | No | Provider site/host |
| `as` | string | No | Variable for result |

### issues.comment

Add a comment to an issue.

```yaml
- type: issues.comment
  issue_key: "PROJ-123"
  body: "Automated test passed. Ready for review."
  as: comment_id
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issue_key` | string | Yes | Issue identifier |
| `body` | string | Yes | Comment text |
| `provider` | string | No | Force specific provider |
| `site` | string | No | Provider site/host |
| `as` | string | No | Variable for comment ID |

## Git Steps

Abstract git platform steps. Provider is auto-detected from environment (GitHub, etc.).

::: warning Requires Provider
Configure a git provider (e.g., set `GITHUB_TOKEN` for GitHub).
:::

### git.listPRs

List pull requests.

```yaml
- type: git.listPRs
  repo: "org/repo"
  state: "open"
  limit: 10
  as: pull_requests
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repo` | string | No | Repository (default: detected from env) |
| `state` | string | No | Filter by state: `open`, `closed`, `all` |
| `limit` | number | No | Max results |
| `provider` | string | No | Force specific provider |
| `as` | string | No | Variable for results |

### git.getPR

Get pull request details.

```yaml
- type: git.getPR
  repo: "org/repo"
  number: 42
  as: pr
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repo` | string | No | Repository |
| `number` | number | Yes | PR number |
| `provider` | string | No | Force specific provider |
| `as` | string | No | Variable for result |

### git.createPR

Create a pull request.

```yaml
- type: git.createPR
  repo: "org/repo"
  title: "feat: add login flow"
  body: "Implements the new login flow"
  head: "feat/login"
  base: "main"
  as: pr_url
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repo` | string | No | Repository |
| `title` | string | Yes | PR title |
| `body` | string | No | PR description |
| `head` | string | Yes | Source branch |
| `base` | string | No | Target branch (default: main) |
| `provider` | string | No | Force specific provider |
| `as` | string | No | Variable for PR URL |

### git.listIssues

List repository issues.

```yaml
- type: git.listIssues
  repo: "org/repo"
  state: "open"
  labels: "bug,critical"
  limit: 20
  as: issues
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repo` | string | No | Repository |
| `state` | string | No | Filter by state: `open`, `closed`, `all` |
| `labels` | string | No | Comma-separated label filter |
| `limit` | number | No | Max results |
| `provider` | string | No | Force specific provider |
| `as` | string | No | Variable for results |

### git.getIssue

Get issue details.

```yaml
- type: git.getIssue
  repo: "org/repo"
  number: 15
  as: issue
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repo` | string | No | Repository |
| `number` | number | Yes | Issue number |
| `provider` | string | No | Force specific provider |
| `as` | string | No | Variable for result |

## Chat Steps

::: warning Not Yet Implemented
Chat steps are registered but not yet functional. They will be available when a chat provider (e.g., Slack) is integrated.
:::

### chat.listChannels

List available channels.

```yaml
- type: chat.listChannels
  limit: 50
  as: channels
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `types` | string | No | Channel type filter |
| `limit` | number | No | Max results |
| `provider` | string | No | Force specific provider |
| `as` | string | No | Variable for results |

### chat.readChannel

Read messages from a channel.

```yaml
- type: chat.readChannel
  channel: "#general"
  limit: 20
  as: messages
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel` | string | Yes | Channel name or ID |
| `limit` | number | No | Max messages |
| `max_days` | number | No | Limit to recent days |
| `provider` | string | No | Force specific provider |
| `as` | string | No | Variable for messages |

### chat.readThread

Read a message thread.

```yaml
- type: chat.readThread
  channel: "#general"
  thread_ts: "1234567890.123456"
  as: thread
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel` | string | Yes | Channel name or ID |
| `thread_ts` | string | Yes | Thread timestamp ID |
| `max_days` | number | No | Limit to recent days |
| `provider` | string | No | Force specific provider |
| `as` | string | No | Variable for messages |

## Delay Constants

Any `delay_ms` or `ms` parameter that accepts a number also accepts a named delay constant. Named constants resolve to a base millisecond value with +/-10% random jitter on each invocation, making automation timing less predictable and more human-like.

| Constant | Base | Range |
|----------|------|-------|
| `"small"` | 500ms | 450-550ms |
| `"mid"` | 1000ms | 900-1100ms |
| `"large"` | 5000ms | 4500-5500ms |

Raw numeric values are used as-is without jitter.

**Applies to:** `browser.wait` → `ms`, `control.retry` → `delay_ms`, `control.foreach` → `delay_ms`
