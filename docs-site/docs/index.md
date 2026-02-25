---
layout: home

---

## What is SideButton?

SideButton is an **open-source, local-first automation platform** that connects AI tools to your browser. Unlike simple browser control, SideButton lets you:

- **Define reusable workflows** in YAML that run the same way every time
- **Install skill packs** — pre-built automation bundles for specific web apps
- **Record actions** by clicking through a task and exporting as automation
- **Embed buttons** directly into the pages you use (GitHub, Wikipedia, etc.)
- **Use AI steps** for text classification and generation

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
    <a href="/skill-packs/overview" style="padding: 1rem; border: 1px solid var(--vp-c-divider); border-radius: 8px; text-decoration: none;">
      <strong>Skill Packs</strong><br/>
      <span style="color: var(--vp-c-text-2);">Install automation bundles</span>
    </a>
  </div>
</div>
