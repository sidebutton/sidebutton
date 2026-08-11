# Side Projects

A **side project** is an app you build by talking to an agent: you open it at
[app.sidebutton.com](https://app.sidebutton.com), describe a change, and the agent edits the repo,
runs the dev server and shows you the result. This page is the setup runbook — from an empty account
to a project row you can open.

> **Why a runbook and not a "New project" button?** Today a project *is* a workspace with a reserved
> name, provisioned from the portal by an account admin. The app surface is deliberately read-only:
> it lists and opens projects, it never creates them. In-app creation is a later phase.

## Overview

Setting up a project is four things in the portal, in this order:

1. A **workspace** named `sideproject_<name>` — the name after the prefix is what the app shows
2. A **repo** attached to that workspace — what the agent edits
3. An **agent** assigned to the workspace — who does the editing
4. A **session workflow** available to your account — how an open becomes a running agent

Once all four exist, `<name>` appears at [app.sidebutton.com](https://app.sidebutton.com) and opening
it connects you to the agent. Nothing here is app-specific plumbing you have to maintain: a project is
an ordinary workspace, and everything you already know about workspaces still applies to it.

---

## Prerequisites

- **An account admin.** Creating a workspace and provisioning agents are admin actions.
- **An agent, or the means to create one** — a [hosted agent](/cloud/hosted-agents) (nothing to
  connect) or a [self-hosted](/cloud/create-agent) one in your own cloud.
- **A Git repo** on GitHub or Bitbucket. These are the two hosts supported end to end.

---

## Step 1: Create the project workspace

Open **Portal → Workspaces**, click **Create workspace**, and fill in:

| Field | Value |
| --- | --- |
| **Label** | Anything human — `Northlight`. Only you see it. |
| **Slug** | `sideproject_<name>` — **type this by hand.** |
| **Path on VM** | Leave it; it follows the slug (`~/sideproject_northlight`). |

The Slug field is the one that matters: `sideproject_` is a reserved prefix, and `<name>` is the
project name the app renders. The slug is *not* derived from the Label here — auto-derivation turns
every underscore into a dash, so a label of "sideproject_northlight" would give you
`sideproject-northlight`, an ordinary workspace that never appears in the app. Type the slug.

See [Naming rules](#naming-rules) for what `<name>` may contain and what happens when it collides.

## Step 2: Attach the repo

Open the new workspace, go to the **Code & files** tab, and under **Git projects** click
**Add project**. Give it the repo URL (`https://github.com/<owner>/<repo>`) and a **subpath** — the
folder under the workspace path the repo clones into.

Then, under **Save & apply to agents**, click **Save & apply**. This tab is staged, not live:
nothing reaches the agent VMs until you apply.

If a workspace carries several Git projects, the app opens the **first** one. A workspace with no
repo still works — the session opens, it just has no repo to offer.

## Step 3: Assign an agent

The agent needs the **SideButton App Agent** profile (`app-builder`), which carries what an editing
session needs: Claude Code, a browser, the SideButton server and knowledge packs.

- **Provisioning a new agent:** follow [Self-Host in Your Cloud](/cloud/create-agent), pick
  **SideButton App Agent** as the profile in Step 1, and tick this workspace in Step 3 (Workspaces).
  Because you created the workspace first, it is already in that list.
- **Using an agent you already have:** open the workspace's **Agents** tab and assign it there.
  Assignment takes effect immediately. Give it the **SE** role if it doesn't have one — an editing
  session is dispatched as SE work, and an agent without that role never claims the open. Agents
  provisioned from the **SideButton App Agent** profile carry it already.
- **Hosted agents:** mention the repo and stack in your [hosted agent](/cloud/hosted-agents) request
  and the SideButton team sets the profile up for you.

Beyond the assignment and that role, there is nothing else to configure — an agent learns which
workspaces it may open from its assignments.

> **Not seeing the profile?** The profile dropdown is filtered by the profiles your account enables.
> If **SideButton App Agent** is missing, ask your account admin to enable it.

## Step 4: Check the session workflow

Opening a project runs the `app_edit_session` workflow. It reaches your account through a skill pack
rather than being built into the product — it ships in the **SideButton default pack**, which every
account resolves against, so you do not need a pack of your own to get it. Confirm it is listed under
**Portal → Workflows**.

If it is missing, an admin can refresh the default pack: **Portal → Settings → Skill Pack
Repository → Pull Updates**. That button is the one that pulls the default pack; **Sync Now**, shown
instead once your account attaches its *own* repository, re-syncs that pack only and will not add
this workflow. Without it, every open fails with `workflow_not_seeded`.

## Step 5: Size the warm pool (optional)

`pool_size` is per workspace and gates **playbook task starts only** — it does not cap app sessions,
and opening a project is never blocked by it. It defaults to the number of agents on the account at
the moment the workspace is created, so a workspace created before its agent existed has a pool of 1.

If this workspace also runs playbooks, set it under **Portal → Playbooks → Run configuration** (it
edits the workspace currently selected in the sidebar switcher).

## Step 6: Verify

Open [app.sidebutton.com](https://app.sidebutton.com). `<name>` is in the list. Click it: the window
opens and connects on its own — no start button, no session to manage. First connect on a cold agent
takes a moment; the pill tells you where it is.

---

## Naming rules

`<name>` — everything after `sideproject_` — must be:

| Rule | Why |
| --- | --- |
| 2–40 characters | The published site's hostname is `lp-<name>.sidebutton.com`, and it needs at least two |
| Lowercase letters, digits and dashes | The name doubles as that hostname; hostnames have no case and no underscores |
| Not starting or ending with a dash | Same reason |

Anything else is refused when you create the workspace, rather than becoming a project that cannot
ship. The reserved prefix is exact: `sideproject-x` (a dash) is an ordinary workspace, `sideproject_`
alone names no project, and `side_project_x` is refused outright — the underscore is legal only in
the prefix itself. The rest of the portal is unaffected: `sideproject_` is the only workspace slug
allowed an underscore at all.

**Two kinds of collision:**

- **Within your account**, a project name is taken by at most one workspace. Creating a duplicate is
  refused with a suggestion (`sideproject_northlight-2`); take it or pick another name.
- **Across all accounts**, the *published* hostname is first-come — one `lp-northlight.sidebutton.com`
  exists globally. Another account already using that name doesn't block you from creating or editing
  your project; it surfaces later, when the project tries to publish. There is no rename, so if that
  matters to you, create the project under a free name.

Because names are case-sensitive here and hostnames are not, `<name>` is lowercase-only — which
keeps "the project" and "the site it publishes to" the same thing forever.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Workspace create rejects the slug | `<name>` breaks a [naming rule](#naming-rules), or the prefix is misspelled | Fix the name; the error states the rule |
| Project isn't listed at app.sidebutton.com | The slug is not `sideproject_<name>`, or the workspace is deactivated | Check the slug in **Portal → Workspaces**; re-activate it |
| `not_a_project` when opening | You reached a session URL for a workspace that isn't a project | Only `sideproject_*` workspaces open as projects |
| `workflow_not_seeded` when opening | The account has no `app_edit_session` workflow | [Step 4](#step-4-check-the-session-workflow) |
| Stuck on **Connecting** with a queue position | No assigned agent is online and free yet | Wait for it, or assign another agent — the open is queued, not lost |
| No **Staged**/**Live** chip on the row | Nothing published yet, the site was archived, or the name is claimed globally | Publish from inside the project; see collisions above |

---

## What this is not

Projects are workspaces, but the app never says so: there are no workspaces, agents, fleets or queues
in the project window — only your project and whether it is connected. That vocabulary lives here, in
the portal, with the admin who provisions. If you are handing a project to someone to build in, they
need the URL and nothing on this page.
