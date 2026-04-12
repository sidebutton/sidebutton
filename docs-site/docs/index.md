---
layout: doc
---

# SideButton

Open source platform for AI agents with structured roles, skills, and domain knowledge.

<a href="/sidebutton-agent-stack.png" target="_blank">
  <img src="/sidebutton-agent-stack.png" alt="The AI Agent Stack — SideButton" style="max-width: 600px; width: 100%; border-radius: 8px; border: 1px solid var(--vp-c-divider); margin: 1.5rem 0;" />
</a>

## What is SideButton?

SideButton is an **open-source platform that packages domain knowledge for AI agents**. Install knowledge packs for web apps, automate with YAML workflows, and give AI agents real browser control via MCP.

- **Install knowledge packs** — pre-built bundles of domain knowledge, workflows, and role playbooks for specific web apps
- **Define reusable workflows** in YAML with 45 step types (browser, shell, LLM, issues, git, control flow)
- **Connect AI agents via MCP** — Claude Code, Cursor, or any MCP client gets real browser control
- **Extend with plugins** — add custom MCP tools in any language (bash, Node.js, Python)

## How It Works

```
Install a knowledge pack  →  AI agent gets domain knowledge  →  Agent works autonomously
   (CLI or registry)        (selectors, roles, workflows)      (browser + workflows)
```

1. **Install a knowledge pack** — `sidebutton install acme.example.com` adds domain knowledge for that app
2. **Connect your AI agent** — Via MCP, your agent sees available workflows and context
3. **Agent works autonomously** — Everything runs locally, your data stays private

## Use Cases

| Use Case | What It Does |
|----------|--------------|
| **Install a knowledge pack** | Add domain knowledge for any web app with one command |
| **Agent explores an app** | AI agent navigates, documents, and builds knowledge packs automatically |
| **Publish a knowledge pack** | Share your domain knowledge — free publishing, like npm for AI |
| **Code Review** | Let Claude review your PRs via MCP |
| **Data Extraction** | Pull data from web pages into structured format |

## Next Steps

- [Installation](/installation) — Get SideButton running
- [Knowledge Packs](/knowledge-packs/overview) — Domain knowledge for AI agents
- [MCP Setup](/mcp-setup) — Connect Claude Code or Cursor
- [First Workflow](/first-workflow) — Run your first automation
- [Community Roles](/community-roles) — AI agent role templates
