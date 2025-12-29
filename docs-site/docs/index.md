---
layout: home

hero:
  name: SideButton
  text: Local Workflow Automation
  tagline: Define workflows in YAML. Run them with one click. Keep your data private.
  actions:
    - theme: brand
      text: Get Started
      link: /installation
    - theme: alt
      text: View on GitHub
      link: https://github.com/sidebutton/sidebutton

features:
  - icon: 🔁
    title: Reusable Workflows
    details: Define once in YAML, run forever. No re-prompting AI every time.
  - icon: 🎬
    title: Recording Mode
    details: Click through any task once, export as reusable automation.
  - icon: ⚡
    title: Embed Buttons
    details: Inject one-click automation buttons directly into any web page.
  - icon: 🧠
    title: AI-Powered Steps
    details: LLM classification and generation built into workflows.
  - icon: 🔌
    title: MCP Server
    details: Connect Claude Code, Cursor, VS Code to your browser.
  - icon: 🖥️
    title: Full Dashboard
    details: Visual workflow management, run logs, and settings.
---

## What is SideButton?

SideButton is an **open-source, local-first automation platform** that connects AI tools to your browser. Unlike simple browser control, SideButton lets you:

- **Define reusable workflows** in YAML that run the same way every time
- **Record actions** by clicking through a task and exporting as automation
- **Embed buttons** directly into the pages you use (GitHub, Wikipedia, etc.)
- **Use AI steps** for text classification and generation

## Quick Start

```bash
# Run the server
npx @sidebutton/server serve

# Open http://localhost:9876
```

Then [install the Chrome extension](/extension) and run your first workflow.

## How It Works

```
You click a button  →  SideButton runs your workflow  →  Task done
     (browser)              (your computer)              (results)
```

1. **You define a workflow** — A series of steps in YAML (browser actions, shell commands, LLM calls)
2. **You trigger it** — Via embed button, dashboard, or AI agent (Claude Code, Cursor)
3. **It executes locally** — Everything runs on your computer, your data stays private

## Use Cases

| Use Case | What It Does |
|----------|--------------|
| **TL;DR Button** | Add a "Summarize" button to any article |
| **Draft Reply** | AI-powered reply drafts in messaging apps |
| **Code Review** | Let Claude review your PRs via MCP |
| **Form Filling** | Auto-fill repetitive forms |
| **Data Extraction** | Pull data from web pages into structured format |

## Next Steps

<div class="vp-doc">
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">
    <a href="/installation" style="padding: 1rem; border: 1px solid var(--vp-c-divider); border-radius: 8px; text-decoration: none;">
      <strong>Installation</strong><br/>
      <span style="color: var(--vp-c-text-2);">Set up the server</span>
    </a>
    <a href="/extension" style="padding: 1rem; border: 1px solid var(--vp-c-divider); border-radius: 8px; text-decoration: none;">
      <strong>Extension Setup</strong><br/>
      <span style="color: var(--vp-c-text-2);">Connect your browser</span>
    </a>
    <a href="/first-workflow" style="padding: 1rem; border: 1px solid var(--vp-c-divider); border-radius: 8px; text-decoration: none;">
      <strong>First Workflow</strong><br/>
      <span style="color: var(--vp-c-text-2);">Run Hello World</span>
    </a>
    <a href="/mcp-setup" style="padding: 1rem; border: 1px solid var(--vp-c-divider); border-radius: 8px; text-decoration: none;">
      <strong>MCP Setup</strong><br/>
      <span style="color: var(--vp-c-text-2);">Connect Claude/Cursor</span>
    </a>
  </div>
</div>
