# Variables

Variables allow data to flow between workflow steps. Extract values from pages, use them in commands, and pass them between workflows.

## Basic Usage

### Extract and Use

```yaml
steps:
  # Step 1: Extract data into a variable
  - type: browser.extract
    selector: ".product-price"
    as: price

  # Step 2: Use the variable
  - type: shell.run
    cmd: "echo 'Price is: {{price}}'"
```

### Multiple Variables

```yaml
steps:
  - type: browser.extract
    selector: "h1"
    as: title

  - type: browser.extract
    selector: ".author"
    as: author

  - type: llm.generate
    prompt: "Write a review of '{{title}}' by {{author}}"
    as: review
```

## Variable Sources

### From browser.extract

Single element text:

```yaml
- type: browser.extract
  selector: "#username"
  as: user_name
```

### From browser.extractAll

Multiple elements joined:

```yaml
- type: browser.extractAll
  selector: ".tag"
  as: tags
  separator: ", "  # Default: ", "
```

Result: `"javascript, react, typescript"`

### From browser.exists

Boolean check:

```yaml
- type: browser.exists
  selector: ".error-banner"
  as: has_error
```

Result: `"true"` or `"false"` (string)

### From shell.run

Command output:

```yaml
- type: shell.run
  cmd: "git rev-parse HEAD"
  as: commit_hash
```

### From llm.generate

AI-generated text:

```yaml
- type: llm.generate
  prompt: "Summarize: {{content}}"
  as: summary
```

### From llm.classify

Category result:

```yaml
- type: llm.classify
  input: "{{message}}"
  categories: [urgent, normal, low]
  as: priority
```

### From Workflow Parameters

```yaml
params:
  repo_name: string

steps:
  - type: browser.navigate
    url: "https://github.com/{{repo_name}}"
```

## Interpolation Syntax

### Basic

```yaml
text: "Hello, {{name}}!"
```

### In URLs

```yaml
url: "https://github.com/{{org}}/{{repo}}/issues/{{issue_number}}"
```

### In Commands

```yaml
cmd: "curl -X POST '{{api_url}}' -d '{\"title\": \"{{title}}\"}'"
```

### In LLM Prompts

```yaml
prompt: |
  Analyze this code:

  ```
  {{code_content}}
  ```

  Focus on: {{focus_areas}}
```

## Environment Variables

### Defining Env Contexts

In the dashboard Settings, create env contexts:

| Name | Value |
|------|-------|
| `github_base_path` | `/Users/me/GitHub` |
| `api_key` | `sk-xxx` |

### Using Env Variables

```yaml
steps:
  - type: shell.run
    cmd: "cd {{env.github_base_path}}/{{repo}}"

  - type: terminal.open
    cwd: "{{env.github_base_path}}/{{repo}}"
```

### Env in Nested Workflows

Env contexts automatically flow to child workflows.

## Nested Workflow Variables

### Without Namespace

Variables flow directly to parent:

```yaml
- type: workflow.call
  workflow: extract_data

# Child's variables available directly
- type: shell.run
  cmd: "echo '{{title}}'"  # From child
```

### With Namespace

Use `as` to namespace child variables:

```yaml
- type: workflow.call
  workflow: extract_data
  as: data

# Access with namespace
- type: shell.run
  cmd: "echo '{{data.title}}'"
```

### Passing Parameters

```yaml
- type: workflow.call
  workflow: process_page
  params:
    url: "{{target_url}}"
    max_items: 10
```

## Magic Context Keys (Embed)

When using embed buttons, these are automatically available:

| Key | Description | Example |
|-----|-------------|---------|
| `_url` | Full page URL | `https://github.com/org/repo` |
| `_domain` | Hostname | `github.com` |
| `_pathname` | URL path | `/org/repo` |
| `_title` | Page title | `My Repo` |
| `_path` | Path segments | `["org", "repo"]` |
| `_path.0` | First segment | `org` |
| `_path.1` | Second segment | `repo` |

Use in `param_map`:

```yaml
embed:
  param_map:
    _path.0: "organization"
    _path.1: "repository"
    _domain: "site"
```

## Conditional Logic

Use variables in conditions:

```yaml
- type: control.if
  condition: "{{status}} == 'ready'"
  then:
    - type: browser.click
      selector: ".start"
  else_steps:
    - type: control.stop
      message: "Status is {{status}}, not ready"
```

### Operators

| Operator | Example |
|----------|---------|
| `==` | `"{{status}} == 'active'"` |
| `!=` | `"{{count}} != '0'"` |

::: warning String Comparison
All comparisons are string-based. `"10"` does not equal `10`.
:::

## Data Transformation

### First Item

Get first from a list:

```yaml
- type: browser.extractAll
  selector: ".item"
  as: items

- type: data.first
  input: "{{items}}"
  as: first_item
```

### In Shell

Use shell for complex transformations:

```yaml
- type: shell.run
  cmd: "echo '{{items}}' | cut -d',' -f1"
  as: first_item
```

## Best Practices

### 1. Use Descriptive Names

```yaml
# Good
as: product_title
as: user_email
as: total_price

# Bad
as: x
as: data
as: temp
```

### 2. Namespace Child Workflows

```yaml
# Good - clear where variables come from
- type: workflow.call
  workflow: get_user
  as: user

- type: shell.run
  cmd: "echo '{{user.name}}'"

# Risky - might conflict
- type: workflow.call
  workflow: get_user
  # name could overwrite parent variable
```

### 3. Handle Missing Variables

Variables that don't exist become empty strings:

```yaml
# If {{optional}} doesn't exist, this becomes "Value: "
cmd: "echo 'Value: {{optional}}'"
```

### 4. Quote in Shell Commands

```yaml
# Good - handles spaces
cmd: "echo '{{title}}'"

# Bad - breaks if title has spaces
cmd: "echo {{title}}"
```
