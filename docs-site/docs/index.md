---
layout: doc
---

# SideButton MCP Server

Open source platform for AI agents with structured roles, skills, and domain knowledge.

<a href="/sidebutton-oss-stack.png" target="_blank">
  <img src="/sidebutton-oss-stack.png" alt="The AI Agent Stack — SideButton" style="max-width: 600px; width: 100%; border-radius: 8px; border: 1px solid var(--vp-c-divider); margin: 1.5rem 0;" />
</a>

## What is SideButton?

SideButton is an **open-source platform that packages domain knowledge for AI agents**. Install knowledge packs for web apps, automate with YAML workflows, and give AI agents real browser control via MCP.

- **Install knowledge packs** — pre-built bundles of domain knowledge, workflows, and role playbooks for specific web apps
- **Define reusable workflows** in YAML with 45 step types (browser, shell, LLM, issues, git, control flow)
- **Orchestrate cloud agents** — [chain workflows into playbooks](/workflows/orchestration) that work tickets end-to-end behind verdict gates
- **Connect AI agents via MCP** — Claude Code, Cursor, or any MCP client gets real browser control
- **Extend with plugins** — add custom MCP tools in any language (bash, Node.js, Python)

## Latest release — Notion Support, Pack-Driven Roles & Guided Workspace Setup

*2026-08-23 · portal & platform release · [all release posts](/releases/)*

### Notion joins the issue trackers

SideButton now speaks **Notion** alongside Jira and Linear. Connect a Notion workspace and a board database becomes a tracker: new pages route into your Tasks pool by type, agents work them, and status flows back using the board's **own status groups** — your columns stay yours. Automations gain a Notion trigger:

![New Automation form with the trigger type set to Notion; a hint explains that a Notion workspace connection is required to enable filters](/releases/01-notion-automation-trigger.png)

The portal is honest about prerequisites — pick the Notion trigger before a workspace is connected and it says exactly what is missing and where to fix it. Workspaces bind a specific Notion **data source**, with a property map that adapts to the fields your board actually has. A step-by-step [setup guide](/notion-setup) covers connecting the workspace, sharing your board, and the capability toggles that matter.

### GitLab joins the code hosts

SideButton agents now work GitLab end to end. Connect **gitlab.com** with a personal access token, attach projects to your workspaces — including ones nested in subgroups — and agents branch, push and open **merge requests** the same way they open pull requests, with the delivery gate verifying the merge request's real state. Agent VMs ship with `glab` preinstalled, and the connection card warns ahead of your token's expiry.

### Workspace setup that tells the truth

The workspace edit page now walks new workspaces through setup — assign agents, connect code, route tracker work — with a state ledger that reflects what is actually configured. The apply flow reports all three of its states honestly: idle shows what would change, in-flight shows progress, done collapses to a result you can check.

![Workspace edit page with the guided setup panel, tab bar, and the workspace state ledger on the right](/releases/02-workspace-setup-apply.png)

### Roles come from your pack

The role registry is now **pack-driven end to end**: besides the built-ins, any role your skill pack ships registers automatically — with friendly labels, and the ability for a pack to mark a role as always eligible for dispatch. Granting a new role to your fleet is a pack change, not a per-agent settings tour.

### Claude Code plugins, picked and verified

Creating a cloud agent now offers a typed **Claude Code plugin picker**, kept separate from SideButton's own plugin catalog. Picked plugins install at first boot, and each agent reports the install result on its health endpoint and detail page — a failed plugin is visible state, not a silent gap.

### Jira app: working from the first handover

Connecting the SideButton app to a Jira site now seeds issue-type routing and binds the first project to a workspace **at handover** — the first assigned ticket can dispatch without manual routing setup. Upgrades from token-based connections verify they are talking to the same site before switching, and installing from the Atlassian Marketplace before you have an account carries the install through signup.

→ [Read the full post](/releases/2026-08-week34) · self-hosted releases: [SideButton 1.5.5](/releases/1-5-5) · [Changelog](/changelog)

## Next Steps

- [Installation](/installation) — Get SideButton running
- [Knowledge Packs](/knowledge-packs/overview) — Domain knowledge for AI agents
- [MCP Setup](/mcp-setup) — Connect Claude Code or Cursor
- [Connect Claude Subscription](/cloud/claude-subscription) — Sign a cloud agent's Claude Code into your Claude account
- [Orchestrating Agents](/workflows/orchestration) — Dispatch workflows and playbooks to a cloud agent fleet
- [Working with Tasks](/workflows/tasks) — Batch a whole epic into the pool and approve it
- [First Workflow](/first-workflow) — Run your first automation
- [Community Roles](/community-roles) — AI agent role templates
