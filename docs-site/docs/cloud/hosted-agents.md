# Hosted Agents

The fastest way to a working agent: **SideButton runs it for you**. A hosted agent lives on
SideButton's cloud, comes with Claude Opus/Sonnet included, and needs nothing connected — no cloud account,
no credentials, no installer.

This is the same split you know from CI platforms: *hosted* runners the platform provides vs
*self-hosted* runners on your own infrastructure. If you'd rather run agents on machines you
control, see [Self-Host in Your Cloud](/cloud/create-agent) or
[Self-Host on Your Machine](/self-hosting).

## What you get

| | |
| --- | --- |
| Machine | Hetzner M · Falkenstein (fsn1), full Linux desktop + live screen |
| LLM | **Claude Opus/Sonnet included** (or bring your own sign-in) |
| Allowance | Up to your account's hosted-agent limit (trial accounts start with 3) — shown on the Agents page as "· N left" |
| Usage | Flat, metered at **$1,500/day per account** (fair use) |
| Ready | Usually **within the hour** |
| Cost | **Free** — hosted agents don't count against your owned-agent limit |

## Create a hosted agent

1. Open **Portal → Agents** and click **+ Request Hosted Agent** (account admins only)
2. Pick **how many** agents (clamped to your remaining allowance) and the **LLM provider**:
   - **Claude Opus/Sonnet** (included, the recommended default) — runs on SideButton-provided
     Claude credentials, flat usage up to $1,500/day
   - **None — bring your own** — the agent ships without an LLM app; sign in to Claude Code once
     on the agent's live desktop (see [Connect Claude Subscription](/cloud/claude-subscription))
3. Optionally add a comment (repos, stack, what you'll run — it helps us set them up) and click
   **Create agents**

The Agents page shows a **Setting up** strip while the SideButton team prepares your agents.
They appear on the fleet page with a `HOSTED · SIDEBUTTON` chip — live desktop, status, queue —
ready to run jobs. You can cancel a request from the same strip any time before it's fulfilled.

## The daily usage cap

Accounts with included Claude usage are metered at **$1,500/day** (account-wide, resets 00:00 UTC).
The Agents page shows a usage meter; at the cap, agents pause until the next day — queued work
holds, live desktops stay reachable, and everything resumes automatically at the reset. A reached
cap is a healthy gate, not an error.

## Hosted vs self-hosted

| | Hosted agent | Self-hosted agent |
| --- | --- | --- |
| Runs on | SideButton's cloud | Your cloud account (AWS / Hetzner / GCP) or any Ubuntu 24.04 host |
| Setup | One click — nothing to connect | Connect a cloud + wizard, or run the installer yourself |
| LLM credentials | Claude Opus/Sonnet included (or your own sign-in) | Your own (subscription sign-in, API key, or gateway) |
| Usage metering | $1,500/day fair-use cap | Uncapped — your credentials, your spend |
| Ownership | SideButton's machine, provided to your account | Your machine, your data locality |
| Best for | Getting started, trials, burst capacity | Steady fleets, compliance, custom sizing |

Both kinds mix freely in one fleet — start hosted, add self-hosted agents as you scale.

To point one at an app you build by chatting with it, see [Side Projects](/cloud/side-projects).
