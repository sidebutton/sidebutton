# Self-Hosting an Agent

A **SideButton agent** is a machine running a full Linux desktop, Chrome, the
SideButton MCP server, and an AI coding assistant — connected to your portal
account. The portal dispatches jobs to it and streams back its desktop,
terminal, and results.

The portal can provision agents for you (**Agents → Create Agent**), but you can
also **self-host** an agent on infrastructure you control — a cloud VM, a
dedicated server, or a local box — and attach it to your account with a single
**Agent token**. This page covers that flow.

## How attaching works

```
 Portal (Agents)                         Your host (Ubuntu 24.04)
 ───────────────                         ────────────────────────
 Reveal Agent token  ──(sb_boot_…)──▶    curl … install.sh | sudo … bash
                                         · installs desktop + Chrome
                                         · installs SideButton server + agent
                                         · starts services
        ▲                                         │
        │                                first heartbeat
        └───── agent shows "Online" ◀──  token exchanged for permanent creds
```

The **Agent token** is a single-use bootstrap token (`sb_boot_…`) with a 1-hour
lifetime. On the agent's first heartbeat the portal exchanges it for the agent's
permanent per-agent credentials, so the token never has to be stored on the host.

## Prerequisites

- **Ubuntu 24.04 LTS** — a fresh image is ideal (cloud VM, VPS, or bare metal).
- **root / sudo** — the installer manages system services and a desktop session.
- **Outbound HTTPS** to your portal (`https://sidebutton.com` by default) and to
  GitHub (the installer downloads the agent runtime).
- A **dedicated host** — the installer force-installs a desktop environment,
  Chrome, and background services. Don't run it on a workstation you use for
  other things.

::: tip Recommended size
2 vCPU / 8 GB RAM / 40 GB disk is a comfortable baseline for a single agent —
the same as the portal's "Medium" tier.
:::

## Step 1 — Reveal your Agent token

In the portal, open the agent you want to host and reveal its token:

**Agents → _your agent_ → Agent token → Reveal Agent token**

The dialog shows two things:

- the single-use **Agent token** (`sb_boot_…`), and
- a ready-to-run **install command** with the token already filled in.

Copy either one. The token is **single-use** and **expires in 1 hour** — if it
expires before you run the installer, just reveal a new one.

::: info Re-homing an existing agent
The same reveal also lives under the agent's **Danger zone → Re-install**. Use it
to move an existing agent (for example, a dead VM) onto a fresh host: reveal a
new token, run the installer there, and the agent reconnects under the same name.
:::

## Step 2 — Run the installer

On your host, run the one-liner (this is what the portal copies for you):

```bash
curl -sSf https://sidebutton.com/install.sh | sudo \
  AGENT_TOKEN=sb_boot_xxxxxxxx \
  AGENT_NAME=my-agent-1 \
  AGENT_ROLE=se \
  bash
```

The installer is **idempotent** — re-running on a finished host exits cleanly
once the install marker is present. Progress is logged with timestamps to:

```bash
tail -f /var/log/sidebutton-install.log
```

## Environment variables

The installer is configured entirely through environment variables passed to
`sudo`. Only the first two are required.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `AGENT_TOKEN` | **yes** | — | The single-use Agent token (`sb_boot_…`) from Step 1. |
| `AGENT_NAME` | **yes** | — | A unique fleet name for this agent, e.g. `team-se-1`. |
| `AGENT_ROLE` | no | `se` | Default role for the agent — one of `se`, `qa`, `sd`. |
| `PORTAL_URL` | no | `https://sidebutton.com` | The portal the agent reports to. |
| `AGENT_PASSWORD` | no | _random_ | RDP password for the desktop user. A strong random one is generated if unset. |
| `AGENT_RUNNER` | no | _full desktop + extension_ | Advanced — selects the agent variant. Leave unset for the standard setup. |
| `SIDEBUTTON_DEFAULT_REGISTRY` | no | OSS `agents` pack | Knowledge-pack registry URL to install on first boot. |

::: warning Keep the token off disk
Pass `AGENT_TOKEN` inline on the install command as shown — don't bake it into a
file or image. It's single-use and short-lived, and it's consumed on the first
heartbeat.
:::

## Step 3 — Verify the agent is online

Within a minute or two of the install completing, the agent should appear as
**Online** on the portal **Agents** page, with live CPU / memory / disk metrics
and a desktop preview.

You can also check the local server health endpoint on the host:

```bash
curl http://localhost:9876/health
```

A `status: ok` response means the SideButton server is running. Once the browser
extension connects a tab, `browser_connected` flips to `true`.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `AGENT_TOKEN is required` | No token passed | Reveal a token (Step 1) and pass it inline. |
| Installer exits "already installed" | Host was provisioned before | Remove `/etc/sidebutton/installed` and re-run to force a reinstall. |
| Agent never turns Online | Token expired, or no outbound HTTPS to the portal | Reveal a **fresh** token; confirm the host can reach `PORTAL_URL`. |
| Installer can't download the runtime | No outbound HTTPS to GitHub | Ensure the host has general outbound HTTPS access, then re-run. |
| `unknown AGENT_RUNNER` | Custom `AGENT_RUNNER` set | Leave `AGENT_RUNNER` unset for the standard setup. |

## Next steps

- [Extension Setup](/extension) — connect a browser tab for automation.
- [MCP Setup](/mcp-setup) — point your AI client at the agent's MCP server.
- [Community Roles](/community-roles) — what `se` / `qa` / `sd` roles do.
