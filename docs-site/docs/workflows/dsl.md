# DSL Reference

Complete reference for the workflow YAML syntax.

## Workflow Structure

```yaml
# Required fields
id: workflow_id                    # Unique identifier (snake_case)
title: "Human-Readable Title"      # Display name

# Optional fields
description: "What this workflow does"

category:                          # Auto-detected if omitted
  level: primitive | task | process | workflow | pipeline
  domain: engineering | sales | support | marketing | personal
  reusable: true | false

params:                            # Input parameters
  param_name: string | number | boolean

policies:
  allowed_domains:                 # Domain restrictions
    - github.com
    - "*.atlassian.net"

embed:                             # Embed button configuration
  selector: ".target-element"
  # ... see Embed Buttons section

steps:                             # Execution steps (required)
  - type: step_type
    # step-specific parameters
```

## Parameters

Define inputs that users must provide:

```yaml
params:
  repo_name: string
  max_items: number
  dry_run: boolean
```

Use parameters with interpolation:

```yaml
steps:
  - type: browser.navigate
    url: "https://github.com/{{repo_name}}"
```

## Policies

### Domain Restrictions

Limit which domains the workflow can access:

```yaml
policies:
  allowed_domains:
    - github.com           # Exact match
    - "*.atlassian.net"    # Wildcard subdomain
    - "*.google.com"
```

If `allowed_domains` is set, browser steps will fail on other domains.

## Category Levels

Categories help organize workflows. They're auto-detected if omitted:

| Level | Auto-Detection Rule | Example |
|-------|---------------------|---------|
| `pipeline` | 2+ workflow.call steps | Complex orchestration |
| `workflow` | 1+ workflow.call steps | Composed automation |
| `process` | Has LLM, extract, or retry | AI-powered tasks |
| `task` | Has params OR 3+ steps | Parameterized work |
| `primitive` | 1-2 steps, no special features | Simple actions |

## Embed Configuration

Inject buttons into web pages:

```yaml
embed:
  selector: ".target-element"      # Where to inject button
  position: prepend | append | after | before
  when: ".page-indicator"          # Only inject when this exists
  label: "Button Text"

  # Optional: Filter by parent element
  parent_filter:
    selector: ".parent-container"
    match:
      attribute: "textContent"
      contains: "Status Text"

  # Extract values from page on click
  extract:
    my_value:
      selector: ".child-element"   # Or "self" for target
      attribute: "textContent"     # Or "href", "data-id", etc.
      pattern: "regex(capture)"    # Optional regex

  # Map to workflow params
  param_map:
    my_value: "param_name"         # Extracted → param
    _domain: "domain_param"        # Magic key → param
    _path.0: "org"                 # Path segment → param
```

### Magic Context Keys

Available in `param_map`:

| Key | Value | Example |
|-----|-------|---------|
| `_url` | Full page URL | `https://github.com/org/repo/pulls` |
| `_domain` | Hostname | `github.com` |
| `_pathname` | URL path | `/org/repo/pulls` |
| `_title` | Page title | `Pull requests · org/repo` |
| `_path` | Path segments array | `["org", "repo", "pulls"]` |
| `_path.N` | Nth path segment | `_path.0` = `"org"` |

[Learn more about embed buttons →](/features/embed)

## Variable Interpolation

Use <code v-pre>{{variable}}</code> syntax anywhere:

```yaml
steps:
  - type: browser.extract
    selector: ".username"
    as: user_name

  - type: browser.type
    selector: "#greeting"
    text: "Hello, {{user_name}}!"

  - type: shell.run
    cmd: "echo 'User: {{user_name}}'"
```

### Variable Sources

| Source | Syntax | Example |
|--------|--------|---------|
| Extract steps | <code v-pre>{{var_name}}</code> | <code v-pre>{{title}}</code> |
| Workflow params | <code v-pre>{{param_name}}</code> | <code v-pre>{{repo}}</code> |
| Shell output | <code v-pre>{{as_name}}</code> | <code v-pre>{{shell_output}}</code> |
| Env contexts | <code v-pre>{{env.name}}</code> | <code v-pre>{{env.github_path}}</code> |
| Nested workflows | <code v-pre>{{namespace.var}}</code> | <code v-pre>{{data.result}}</code> |

### Env Contexts

Define reusable environment variables in Settings:

```yaml
# In workflow
steps:
  - type: shell.run
    cmd: "cd {{env.github_base_path}}/{{repo}}"
```

Env contexts are automatically passed to nested workflows.

## Nested Workflows

Call other workflows with `workflow.call`:

```yaml
steps:
  - type: workflow.call
    workflow: extract_page_data
    params:
      url: "{{target_url}}"
    as: extracted  # Namespace for variables

  # Access child variables
  - type: shell.run
    cmd: "echo '{{extracted.title}}'"
```

### Variable Scoping

- Child workflows receive parent's variables + their own params
- Variables from child flow back to parent
- Use `as` to namespace and avoid conflicts
- Circular calls are prevented

## File Organization

### Standalone Files

```
workflows/my_workflow.yaml
```

### Directory Format

```
workflows/my_workflow/
├── workflow.yaml
└── assets/
```

### User Workflows

Save personal workflows in `actions/` directory:

```
actions/
├── my_custom_workflow.yaml
└── team_automation.yaml
```

## Complete Example

```yaml
id: github_pr_summary
title: "GitHub: Summarize PR"
description: "Extract PR details and generate a summary"

params:
  org: string
  repo: string
  pr_number: number

policies:
  allowed_domains:
    - github.com

embed:
  selector: ".gh-header-actions"
  position: prepend
  when: "[data-hpc]"
  label: "Summarize"
  extract:
    pr_num:
      selector: ".gh-header-number"
      attribute: "textContent"
      pattern: "#(\\d+)"
  param_map:
    _path.0: "org"
    _path.1: "repo"
    pr_num: "pr_number"

steps:
  - type: browser.navigate
    url: "https://github.com/{{org}}/{{repo}}/pull/{{pr_number}}"

  - type: browser.wait
    selector: ".js-discussion"
    timeout: 10000

  - type: browser.extract
    selector: ".markdown-body"
    as: pr_description

  - type: browser.extractAll
    selector: ".commit-message"
    as: commits

  - type: llm.generate
    prompt: |
      Summarize this pull request:

      Description:
      {{pr_description}}

      Commits:
      {{commits}}
    as: summary

  - type: control.stop
    message: "{{summary}}"
```
