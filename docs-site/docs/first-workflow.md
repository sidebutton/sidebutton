# First Workflow

Run your first automation in under 2 minutes.

## Prerequisites

Before continuing, make sure you have:

- [x] Server running (`npx @sidebutton/server serve`)
- [x] [Chrome extension installed](/extension)
- [x] Extension connected to a browser tab

## Hello World: Wikipedia Summary

Let's run the "Hello World" workflow that navigates to Wikipedia and extracts content.

### Step 1: Open the Dashboard

Go to [http://localhost:9876](http://localhost:9876)

You should see the dashboard with a sidebar showing:
- Dashboard
- Actions
- Workflows
- Recordings
- Run Log
- Settings

### Step 2: Find the Workflow

1. Click **"Workflows"** in the sidebar
2. Find **"Hello World"** (`hello_world`)

::: tip Can't find it?
The workflow library is in the `workflows/` directory. Make sure you're running the server from the project root.
:::

### Step 3: Run the Workflow

1. Click on the **"Hello World"** workflow card
2. Click **"Run"**
3. Watch the magic happen!

The workflow will:
1. Navigate to Wikipedia's Node.js article
2. Wait for the page to load
3. Extract the first paragraph

### Step 4: Check the Results

1. Click **"Run Log"** in the sidebar
2. Find the latest run
3. Click to see execution details

You'll see:
- Status: `completed` or `failed`
- Duration: How long it took
- Variables: Extracted content
- Events: Step-by-step execution log

## What Just Happened?

The workflow executed these steps:

```yaml
id: hello_world
title: "Hello World"
steps:
  - type: browser.navigate
    url: "https://en.wikipedia.org/wiki/Node.js"

  - type: browser.wait
    selector: "#firstHeading"
    timeout: 5000

  - type: browser.extract
    selector: "#mw-content-text p:first-of-type"
    as: first_paragraph
```

Each step type does something specific:

| Step | What It Does |
|------|--------------|
| `browser.navigate` | Opens a URL in the connected tab |
| `browser.wait` | Waits for an element to appear |
| `browser.extract` | Pulls text from the page into a variable |

## Try Another Workflow

Here are some workflows to try next:

### Wikipedia TL;DR

Summarizes any Wikipedia article using AI:

1. Navigate to any Wikipedia article
2. Run `wikipedia_summarize_browser` workflow

::: warning Requires API Key
LLM workflows need an OpenAI API key. Set it in Settings or as environment variable:
```bash
OPENAI_API_KEY=sk-... npx @sidebutton/server serve
```
:::

### BBC/CNN/DW News Summary

Opens a news site and summarizes the headlines:

- `bbc_open` — Opens BBC News
- `cnn_open` — Opens CNN
- `dw_open` — Opens DW News

## Run via MCP (AI Agent)

You can also run workflows through Claude Code or Cursor:

```
Run the hello_world workflow from SideButton
```

Claude will use the MCP server to execute the workflow and show you the results.

[Learn more about MCP integration →](/mcp-setup)

## Create Your Own Workflow

Ready to create your own? You can:

1. **Record actions** — Click through a task and export as YAML
2. **Write YAML** — Define steps manually

Example workflow:

```yaml
id: my_first_workflow
title: "My First Workflow"
steps:
  - type: browser.navigate
    url: "https://example.com"

  - type: browser.extract
    selector: "h1"
    as: page_title

  - type: shell.run
    cmd: "echo 'Page title: {{page_title}}'"
```

Save this as `actions/my_first_workflow.yaml` and it will appear in your Actions list.

## Next Steps

- **[Recording Mode](/features/recording)** — Create workflows by clicking
- **[Workflow DSL](/workflows/dsl)** — Learn the YAML syntax
- **[Step Types](/workflows/steps)** — All 20 available step types
- **[MCP Setup](/mcp-setup)** — Connect AI tools
