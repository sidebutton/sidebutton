# Self-Host in Your Cloud

This guide walks through the **Create Agent** wizard — from a connected cloud account to an agent card reporting **Online** on the Agent Fleet page. The wizard header shows a chip naming the cloud connection it will provision into, with your provider's logo beside it.

> **Looking for the zero-setup path?** [Hosted Agents](/cloud/hosted-agents) run on SideButton's cloud with Claude Opus/Sonnet included — one click, nothing to connect. This page is the *self-hosted* lane: agents on infrastructure you own.

## Overview

Self-hosted agents run on VMs in your own cloud account. The wizard picks the software, the machine, the roles and the workspaces; **Launch** does the rest: SideButton creates the server, SSH key and firewall in your cloud project, installs the agent runtime, and the new card reports **Online** in about ten minutes. Nothing to install on your side.

Open **Portal → Agents** and click **Create Agent**. The wizard is a wide panel with three columns:

| Column | What it is |
|---|---|
| Step rail (left) | The four steps, each with a one-line summary of what you have chosen. Click any step to jump straight to it — there is no forward lock. |
| Canvas (centre) | The step you are on. |
| Build sheet (right) | A live summary of the whole build, section by section, ending in the estimated monthly cost. Its sections are clickable too. |

Every step ships with working defaults, so **Skip to launch →** in the footer jumps straight to the last step at any time. The footer also names whatever is blocking Launch and links to the step that fixes it. Below 1180px the build sheet folds away and the cost moves into the footer.

---

## Prerequisites

- A connected cloud account — see [AWS Setup](/cloud/aws-setup) or [Hetzner Setup](/cloud/hetzner-setup)
- A portal account with an active trial or subscription (the create action is disabled otherwise)
- Admin rights, to launch and to save account-wide defaults

---

## Step 1: Software

What gets baked onto the box.

![The Software step: profile and agent-app pickers above the grouped component checklist, with Required, tier-floor and config-file chips](/create-agent/01-software-step.png)

1. Pick the **profile** — a named bundle of components and default roles. Your account's own saved profiles appear under **Your profiles** (see [Team profiles](#team-profiles)).
2. Pick the **agent app** the machine runs — the built-in default is **Claude Code (subscription)**. Tick *Deliver only this app to this agent* to stop other account apps staging their environment on the box.
3. Review the **components**, grouped as Core, Toolchains and Network access. Expand any row to read what it installs.

### Required and locked components

Some rows arrive ticked and greyed out, carrying a **Required** chip. Expanding the row states why — required on every profile, required by the profile you picked, or required by another component you have ticked. These cannot be unticked, and they cannot be removed by an old draft either: the wizard re-applies them every time it opens.

![The Core component group with every row checked, disabled and carrying a Required chip](/create-agent/02-required-components.png)

Other chips on a row are advisories:

| Chip | Meaning |
|---|---|
| **Medium+** / **Large+** | The component needs at least that machine size. Picking it moves the machine size for you on Step 2. |
| **KVM** | The component needs a KVM-capable machine type. |
| **config file** | The component consumes a config file. Drop it on the row now, or add it later in the Files hub. |
| **No config file** | Ticked, but nothing dropped. **This never blocks Launch** — the component installs and stays inactive until a file lands. |

> **Note:** available regions, sizes and profiles can be narrowed by your account's provisioning policy, and profiles still in development are hidden unless **Experimental features** is on. If an option you expect is missing, ask your account admin.

## Step 2: Machine

Where the agent runs.

![The Machine step: connection cards, region, the machine-size grid with a load-more button, spot pricing and the Team defaults panel](/create-agent/03-machine-step.png)

1. Pick the **cloud connection** to provision into
2. Choose a **region**
3. Choose a **machine size** — machines start from ~$5/mo on Hetzner

The four cards are the curated sizes. **Load 8 more sizes…** reveals more, eight per click, drawn from what the provider verifiably stocks in that region right now; it disappears once the list is exhausted and starts over if you change region or connection.

A size the provider is out of is greyed out and captioned **Sold out here**. If a size you had already picked sells out, it stays visibly selected so you can see what is blocking you — and Launch stays blocked until you pick another size or region. A size that is too small for a component you ticked is greyed out too, with a note naming the component and a link back to Step 1.

### Team profiles

Editing the component list marks the profile **Customized**. The **Team defaults** panel on this step is where that edit goes somewhere permanent:

- **Save as account defaults** pre-selects this profile, region and machine size for everyone on the account.
- **Save as team profile** stores the exact component and role mix under a name. It then appears for everyone under **Your profiles** on Step 1, and can be retired later from the same panel.
- **Reset to profile** throws the edit away.

## Step 3: Roles & tools

What the agent is allowed to do, and what it ships with.

![The Roles and tools step: the role grid above the SideButton MCP plugin picker and the Claude Code plugin picker](/create-agent/04-roles-step.png)

Check the roles the agent should carry (SE, QA, SD, …). Roles determine which jobs the agent can pick up; they can be changed later from the agent's detail page. At least one role is required.

Below the roles are two **independent** plugin stores — SideButton MCP plugins, which follow the roles you picked unless you edit them, and Claude Code plugins, which are opt-in per agent and resolved from your account's allowlisted marketplaces. Each states in place why it is unavailable, when it is.

## Step 4: Name & launch

![The Name and launch step: workspace assignment, agent names and the shared RDP password](/create-agent/05-launch-step.png)

1. Assign the agent to one or more **workspaces**. A workspace-scoped Agents page only shows agents assigned to it, and dispatched jobs resolve their repository and configuration from the workspace.
2. **Name** the agent — or the batch: the wizard can create several identical machines at once. Names are lowercase letters, digits and dashes, and must be unique on the account.
3. The shared **RDP password** for the live desktop is auto-generated; use the regenerate button if you want a fresh one.

> **Building an app in a chat window?** Create the workspace first and assign it here — a workspace named `sideproject_<name>` appears at app.sidebutton.com.

Click **Launch**. The build sheet's **Est. total** is what the batch costs per month — provider infrastructure, billed by your provider to your connected account.

![The build sheet: profile, agent app, software, machine, roles, workspaces and agents, ending in the estimated monthly total](/create-agent/06-build-sheet.png)

---

## What gets created

In **your** cloud project:

- A server (the size you picked)
- An SSH key for lifecycle management
- A firewall restricting access to the SideButton relay

On the Agent Fleet page, the new agent first shows a **provisioning** card with live progress, then flips to a normal card with screen preview, status and queue — **Online** in ~10 minutes.

---

## After launch: one-time sign-in

An agent running a **subscription** agent app (the default) must sign in once before its first job — otherwise the job stops at `Not logged in`. Open the agent's **Live desktop** and complete the sign-in; the credential stays on the machine. See [Connect Claude Subscription](/cloud/claude-subscription).

Agents on API-key or gateway agent apps carry their credentials in the environment and skip this step.
