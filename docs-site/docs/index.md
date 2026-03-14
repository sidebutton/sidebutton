---
layout: home

---

## What is SideButton?

SideButton is an **open-source platform that packages domain knowledge for AI agents**. Install skill packs for web apps, automate with YAML workflows, and give AI agents real browser control via MCP.

- **Install skill packs** — pre-built bundles of domain knowledge, workflows, and role playbooks for specific web apps
- **Define reusable workflows** in YAML with 45 step types (browser, shell, LLM, issues, git, control flow)
- **Connect AI agents via MCP** — Claude Code, Cursor, or any MCP client gets real browser control
- **Record actions** by clicking through a task and exporting as automation
- **Embed buttons** directly into the pages you use (GitHub, Wikipedia, etc.)

## How It Works

```
Install a skill pack  →  AI agent gets domain knowledge  →  Agent works autonomously
   (CLI or registry)        (selectors, roles, workflows)      (browser + workflows)
```

1. **Install a skill pack** — `sidebutton install acme.example.com` adds domain knowledge for that app
2. **Connect your AI agent** — Via MCP, your agent sees available workflows and context
3. **Agent works autonomously** — Everything runs locally, your data stays private

## Use Cases

| Use Case | What It Does |
|----------|--------------|
| **Install a skill pack** | Add domain knowledge for any web app with one command |
| **Agent explores an app** | AI agent navigates, documents, and builds skill packs automatically |
| **Publish a skill pack** | Share your domain knowledge — free publishing, like npm for AI |
| **Code Review** | Let Claude review your PRs via MCP |
| **Data Extraction** | Pull data from web pages into structured format |

## Next Steps

<div class="vp-doc">
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">
    <a href="/skill-packs/overview" style="padding: 1rem; border: 1px solid var(--vp-c-divider); border-radius: 8px; text-decoration: none;">
      <strong>Skill Packs</strong><br/>
      <span style="color: var(--vp-c-text-2);">Domain knowledge for AI agents</span>
    </a>
    <a href="/installation" style="padding: 1rem; border: 1px solid var(--vp-c-divider); border-radius: 8px; text-decoration: none;">
      <strong>Installation</strong><br/>
      <span style="color: var(--vp-c-text-2);">Set up the server</span>
    </a>
    <a href="/mcp-setup" style="padding: 1rem; border: 1px solid var(--vp-c-divider); border-radius: 8px; text-decoration: none;">
      <strong>MCP Setup</strong><br/>
      <span style="color: var(--vp-c-text-2);">Connect Claude/Cursor</span>
    </a>
    <a href="/first-workflow" style="padding: 1rem; border: 1px solid var(--vp-c-divider); border-radius: 8px; text-decoration: none;">
      <strong>First Workflow</strong><br/>
      <span style="color: var(--vp-c-text-2);">Run Hello World</span>
    </a>
    <a href="/community-roles" style="padding: 1rem; border: 1px solid var(--vp-c-divider); border-radius: 8px; text-decoration: none;">
      <strong>Community Roles</strong><br/>
      <span style="color: var(--vp-c-text-2);">AI agent role templates</span>
    </a>
  </div>
</div>
