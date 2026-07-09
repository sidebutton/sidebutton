# Create an Agent

This guide walks through the Create-Agent wizard — from a connected cloud account to an agent card reporting **Online** on the Agent Fleet page.

## Overview

Agents run on VMs in your own cloud account. The wizard picks a machine, roles and workspaces; **Launch** does the rest: SideButton creates the server, SSH key and firewall in your cloud project, installs the agent runtime, and the new card reports **Online** in about ten minutes. Nothing to install on your side.

---

## Prerequisites

- A connected cloud account — see [AWS Setup](/cloud/aws-setup) or [Hetzner Setup](/cloud/hetzner-setup)
- A portal account with an active trial or subscription (the create action is disabled otherwise)

---

## Step 1: Machine

Open **Portal → Agents** and click **+ Create Agent**.

1. Pick the **cloud connection** the agent should be provisioned into
2. Choose a **region** and **server size** — machines start from ~$5/mo on Hetzner
3. Pick the agent **profile** (which runtime components the machine gets) and the **agent app** it runs — the built-in default is **Claude Code (subscription)**

> **Note:** available regions, sizes and profiles can be narrowed by your account's provisioning policy. If an option you expect is missing, ask your account admin.

## Step 2: Roles & capabilities

Check the roles the agent should carry (SE, QA, SD, …). Roles determine which jobs the agent can pick up; they can be changed later from the agent's detail page.

## Step 3: Workspaces

Assign the agent to one or more workspaces. A workspace-scoped Agents page only shows agents assigned to it, and dispatched jobs resolve their repository and configuration from the workspace.

## Step 4: Agents

Name the agent (or the batch — the wizard can create several identical machines at once). The shared RDP password for the live desktop is auto-generated; use the regenerate button if you want a fresh one.

Click **Launch**.

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
