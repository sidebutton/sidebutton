# Workflows Overview

Workflows are the heart of SideButton — reusable automation recipes defined in YAML.

## What is a Workflow?

A workflow is a series of steps that SideButton executes in order. Each step can:

- **Control the browser** — Navigate, click, type, extract content
- **Run shell commands** — Execute scripts, open terminals
- **Use AI** — Classify text, generate content with LLMs
- **Call other workflows** — Compose complex automations

## Why YAML Workflows?

Unlike AI-generated automation that runs differently each time, workflows are:

| Benefit | Description |
|---------|-------------|
| **Reproducible** | Same input → same output, every time |
| **Shareable** | Copy a file, share automation |
| **Version-controlled** | Track changes with git |
| **Inspectable** | See exactly what will happen |
| **Fast** | No AI interpretation delay |

## Basic Structure

Every workflow has:

```yaml
id: unique_identifier        # Required: used to run the workflow
title: "Human-Readable Name" # Required: shown in dashboard
description: "What it does"  # Optional: more details

params:                      # Optional: input parameters
  site_url: string

steps:                       # Required: what to do
  - type: browser.navigate
    url: "{{site_url}}"
```

## Step Types

SideButton supports 20 step types in 5 categories:

| Category | Steps | Use For |
|----------|-------|---------|
| **Browser** | navigate, click, type, scroll, hover, wait, extract, extractAll, exists, key | Web automation |
| **Shell** | shell.run, terminal.open, terminal.run | System commands |
| **LLM** | llm.classify, llm.generate | AI-powered decisions |
| **Control** | control.if, control.retry, control.stop | Logic and flow |
| **Workflow** | workflow.call | Composition |

[See all step types →](/workflows/steps)

## Variables

Extract data from one step and use it in another:

```yaml
steps:
  # Extract text into a variable
  - type: browser.extract
    selector: "h1"
    as: page_title

  # Use the variable
  - type: shell.run
    cmd: "echo 'Title: {{page_title}}'"
```

[Learn more about variables →](/workflows/variables)

## Where Workflows Live

| Directory | Purpose | Editable |
|-----------|---------|----------|
| `workflows/` | Public library (shared) | Read-only |
| `actions/` | Your personal workflows | Yes |

## Running Workflows

### From Dashboard

1. Open [localhost:9876](http://localhost:9876)
2. Click **Workflows** or **Actions**
3. Click a workflow card
4. Click **Run**

### From AI Tools

```
Run the hello_world workflow from SideButton
```

### From CLI (Coming Soon)

```bash
sidebutton run hello_world
```

## Creating Workflows

### Option 1: Recording Mode

1. Click **New Recording** in dashboard
2. Perform actions in your browser
3. Click **Stop Recording**
4. Export as YAML

[Learn about recording →](/features/recording)

### Option 2: Write YAML

Create a file in `actions/` directory:

```yaml
# actions/my_workflow.yaml
id: my_workflow
title: "My First Workflow"
steps:
  - type: browser.navigate
    url: "https://example.com"
  - type: browser.extract
    selector: "h1"
    as: heading
```

### Option 3: Copy and Modify

1. Find a similar workflow in `workflows/`
2. Copy to `actions/`
3. Modify as needed

## Next Steps

- **[DSL Reference](/workflows/dsl)** — Complete YAML syntax
- **[Step Types](/workflows/steps)** — All 20 step types
- **[Variables](/workflows/variables)** — Data flow between steps
- **[Examples](/workflows/examples)** — Copy-paste workflows
