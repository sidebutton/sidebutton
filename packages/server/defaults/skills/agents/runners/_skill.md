---
name: Agent VM Provisioning
domain: agents
path: /runners
parent: agents
tags: ["@provisioning", "@fleet", "@infrastructure", "@runners", "@variants"]
learned: "2026-06-03"
last_verified: "2026-06-03"
confidence: 0.55
source: "code-first from github.com/sidebutton/agent-runners — not live-verified"
repos:
  - name: agent-runners
    remote: https://github.com/sidebutton/agent-runners.git
    path: /
---

# Agent VM Provisioning

How a SideButton agent VM is built. The **agent-runners** repo is a thin bootstrapper + a shared `base/` set of ordered step scripts + per-variant overlays. It is also the **single source of truth** for what the Fleet Control portal *displays* for each variant + profile + plugin (the portal vendors these manifests rather than hardcoding).

## Bootstrap flow

Production agents are provisioned by piping `https://sidebutton.com/install.sh` to bash. That thin bootstrapper resolves `AGENT_RUNNER` (variant) + `RUNNERS_REF` (git ref), downloads this repo at the requested ref, and hands off to **`base/run.sh`**, which sources the `base/NN-*.sh` steps in order. `install.sh` at the repo root is the direct entry point that dispatches to `base/run.sh`.

## Variants (`variants.json`, schema v2)

A variant = a VM image recipe. `kind` drives portal status dots; `display` is the fleet-list fallback when a row has no profile.

| Variant | `kind` | Display | Installs |
|---------|--------|---------|----------|
| `sidebutton-mcp-claude-code-extension` (**default**) | `ext` | SWE Full-Stack | MCP server `:9876`, Claude Code, Chrome + SideButton extension (managed policy), `browser_connected` handshake wait |
| `sidebutton-mcp-claude-code` | `noext` | SWE Native | Same base, **no** extension force-install, **no** handshake wait (Chrome still boots) |
| `ubuntu-claude-code` | `bare` | SWE Bare | Ubuntu desktop + Chrome + Claude Code only; **drops** the SB MCP server, extension, and knowledge-pack registry. A thin **fleet-job-client** takes `:9876` and implements the minimal heartbeat/job/status contract the portal expects |

New variant = drop a folder under `variants/<name>/` (≥ a `manifest.json`, optional `pre-services` / `post-services` / `early-setup` hooks) + an entry in `variants.json`.

## Profiles (`profiles.json`, schema v1)

The product-level catalogue the **Create-Agent wizard** offers. Each profile picks a `runner` variant + `default_roles` + `default_plugins`. `aliases` maps renamed slugs so already-provisioned agents keep resolving (e.g. `claude-code-headless` → `swe-native`).

| Profile (slug) | Runner variant | Default roles | Default plugins |
|----------------|----------------|---------------|-----------------|
| `swe-full-stack` (**default**) | extension | se, qa, sd, pm | screen-record |
| `qa-generalist` | extension | qa | screen-record |
| `swe-native` | no-extension | se, qa | screen-record |
| `swe-bare` | bare | se | — |

## Provisioning pipeline (`base/` steps)

`01-preflight` (env validation, OS detect) → `02-system` → `03-gh-cli` → `04-desktop` (XFCE + xrdp) → `05-node` (Node 22 + pnpm) → `06-chrome` → `07-claude-code` → `08-sidebutton` (MCP server) → `09-agent-user` → `11-polkit` → `12-workspace` (`.agent-env` template) → `13-knowledge-packs` (anonymous `agents` ops pack from the public catalog) → `14-claude-stop-hook` → `15-claude-mcp` → `16-services-prep` / `16b-wallpaper` → `17-services-start` → `18-heartbeat` → `19-secrets` (per-agent secrets land here) → `19b-plugins` (install `SIDEBUTTON_PLUGINS`, restart server) → `19c-health-report` (sb-health timer) → `19d-account-registry` (add `SIDEBUTTON_DEFAULT_REGISTRY` + 5-min update timer) → `20-mark-installed`.

**Knowledge-pack timing (cf. SCRUM-1122/1124):** the universal `agents` pack installs anonymously at step 13 (no creds needed). A private per-account registry is **additive** and deferred to 19d because cloning it needs `SIDEBUTTON_DEFAULT_REGISTRY_TOKEN`, which only lands at step 19. `/opt/sb-registry-sync.sh` re-sources `~/.agent-env` at call time so the recurring `sb-registry-update.timer` (every 5 min) always sees the current token — this is what propagates SD-pushed modules to running agents.

## Portal metadata — single source of truth

`variants.json`, `profiles.json`, and `plugins.json` are **vendored by the portal** (`pnpm --filter website sync:runners`); a CI `git diff --exit-code` fails on drift. To rename a profile, change a dep chip, add a plugin, or add a variant/profile — edit it **here**, not in the portal.

## Key env vars (`~/.agent-env`)

| Var | Purpose |
|-----|---------|
| `AGENT_RUNNER` / `RUNNERS_REF` | variant + git ref the bootstrapper installs |
| `SIDEBUTTON_PLUGINS` | plugins to install (profile `default_plugins` ∪ provision override) — see [[plugins]] |
| `SIDEBUTTON_DEFAULT_REGISTRY` (+ `_TOKEN`) | per-account knowledge-pack git registry added at 19d |
| `AGENT_TOKEN` / `SIDEBUTTON_AGENT_TOKEN` / `PORTAL_URL` | portal heartbeat + job dispatch |

## Gotchas

- Packs are **additive**: the account registry is installed *on top of* the anonymous `agents` pack, never instead of it.
- `SKIP_KNOWLEDGE_PACKS=1` (bare variant) skips both the step-13 pack and the 19d account registry.
- The agent reports loaded plugins on `GET /health` (`plugins[]`) — that is what the portal fleet list renders.
- This module is **code-first** (derived from the repo, not a live VM build); verify step names against `base/run.sh` before automating.

See [[plugins]] for the plugin catalog and the `ops` module for the dispatch workflows these VMs run.
