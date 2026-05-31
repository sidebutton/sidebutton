# Hetzner Connection Setup

This guide explains how to connect your Hetzner account to SideButton so you can provision and manage agent VMs directly from the portal.

## Overview

SideButton provisions Hetzner servers on your behalf using a project-scoped API token with Read & Write permissions. Once connected, you can deploy agents with one click and SideButton handles the full VM lifecycle (create, reboot, stop, start, delete).

---

## Prerequisites

- A [Hetzner Cloud](https://console.hetzner.com/) account
- An existing Hetzner project (or permission to create one)

---

## Step 1: Create or select a Hetzner project

1. Go to [https://console.hetzner.com/](https://console.hetzner.com/) → **Projects**
2. Use an existing project or click **New Project** to create one

> **Note:** A Hetzner API token is scoped to a single project. If you want SideButton to manage agents in multiple Hetzner projects, create a separate connection for each project. (Multiple connections per provider are planned as a future enhancement — currently the portal supports one active Hetzner connection.)

---

## Step 2: Generate an API token

1. Inside your project, go to **Security** → **API Tokens** → **Generate API Token**
2. Give it a descriptive name (e.g., `sidebutton-agent-manager`)
3. Set permissions to **Read & Write**

   > ⚠️ Read-only tokens are rejected by the portal with a `token_readonly` error. Make sure you select **Read & Write**.

4. Click **Generate API Token**
5. **Copy the token immediately** — Hetzner displays it only once and it cannot be retrieved later

---

## Step 3: Connect in SideButton

1. Open the SideButton portal → **Settings** → **Infrastructure**
2. Click **Connect Hetzner account** to open the connection form
3. Paste the API token from Step 2
4. Optionally pick a **Default Location** (e.g., `nbg1` for Nuremberg, `fsn1` for Falkenstein, `hel1` for Helsinki, `ash` for Ashburn US)
5. Click **Connect** — SideButton validates the token by calling `GET /v1/locations` against the Hetzner API

Once connected, the button row shows a green **Connected** badge.

---

## Creating an agent on Hetzner

After connecting, any new agent you create can use your Hetzner connection:

1. Go to **Agents** → **New Agent**
2. Under **Infrastructure**, select your Hetzner connection
3. Choose a **Region** and **Size tier** (see table below)
4. Click **Create** — SideButton provisions the server and firewall automatically

### Available regions

| Location code | Data center |
|---------------|-------------|
| `nbg1` | Nuremberg, Germany |
| `fsn1` | Falkenstein, Germany |
| `hel1` | Helsinki, Finland |
| `ash` | Ashburn, VA, USA |
| `hil` | Hillsboro, OR, USA |
| `sin` | Singapore |

### Available sizes and pricing

| Tier | Server type | vCPU | RAM | Monthly price |
|------|-------------|------|-----|---------------|
| S | CX22 | 2 | 4 GB | ~$5 |
| M | CX32 | 4 | 8 GB | ~$9 |
| L | CX42 | 8 | 16 GB | ~$19 |
| LX | CCX23 (dedicated vCPU) | 4 | 8 GB | ~$53 |

> Prices shown in USD equivalent. Hetzner bills in EUR; exact amounts vary with exchange rates. See [Hetzner pricing](https://www.hetzner.com/cloud/) for current rates.

> Hetzner does not offer a spot/preemptible market — all instances are on-demand.

---

## What SideButton creates in your Hetzner project

Each agent provisioned through SideButton creates the following resources in your Hetzner project:

**Firewall** (`sidebutton-agent-<name>`):

| Rule | Protocol | Port | Source |
|------|----------|------|--------|
| SSH | TCP | 22 | Your IP |
| RDP | TCP | 3389 | Your IP |
| SideButton control plane | TCP | 9876 | `46.225.225.112/32` |
| ICMP | ICMP | — | Any |

**Server** (`sidebutton-agent-<name>`):

- OS: Ubuntu 24.04
- Labels: `sidebutton/managed=true`, `sidebutton/agent=<name>`, `sidebutton/tier=<S|M|L|LX>`

You can inspect all created resources directly in the Hetzner Console under your project.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `token_readonly` | API token has Read-only permissions | Regenerate with **Read & Write** in Hetzner → Security → API Tokens |
| `token_invalid` | Token was deleted or is malformed | Generate a new token and reconnect |
| HTTP `429` (rate limit) | Too many API requests | Hetzner allows 3600 req/hr per project (replenishes 1/sec). Check for runaway list/poll loops |
| Server creation fails | Project resource quota exceeded | Request a quota increase in the Hetzner Cloud Console |

---

## Security notes

- SideButton stores your API token encrypted with AES-256-GCM
- Tokens are never logged or exposed in API responses
- You can delete the connection at any time — SideButton will refuse deletion if agents are still attached
- Rotate your API token in Hetzner Console → Security → API Tokens and reconnect in SideButton Settings
