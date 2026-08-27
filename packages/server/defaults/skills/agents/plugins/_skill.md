---
name: Agent Plugin Catalog
domain: agents
path: /plugins
parent: agents
tags: ["@plugins", "@mcp-tools", "@fleet", "@extensibility"]
learned: "2026-06-03"
last_verified: "2026-06-03"
confidence: 0.50
source: "code-first from github.com/sidebutton/agent-runners (plugins.json) — not live-verified"
repos:
  - name: agent-runners
    remote: https://github.com/sidebutton/agent-runners.git
    path: plugins.json
---

# Agent Plugin Catalog

Plugins are small packages the **SideButton MCP server** loads from `~/.sidebutton/plugins/` and exposes as extra MCP tools. The catalogue lives in **`agent-runners/plugins.json`** (validated against `plugins.schema.json`) and is **vendored by the portal** to label the plugin chips it shows per agent.

## How plugins are installed

- Each `plugins.json` entry maps a `slug` → public git `repo` (+ `ref`, `submodules`, `system_deps`).
- At provision time the portal forwards `SIDEBUTTON_PLUGINS` = a profile's `default_plugins` ∪ any provision-request override (see [[runners]] for profiles).
- `base/19b-plugins.sh` runs **after** `19-secrets.sh`, clones the requested slugs into `~/.sidebutton/plugins/`, then `systemctl restart sidebutton` so the server loads the new plugins together with the now-populated `~/.agent-env`.
- Plugins only apply to variants that ship a server (`ext`, `noext`) — **never** the `bare` variant.
- The agent reports loaded plugins on `GET /health` (`plugins[]`); the portal fleet list + agent detail render those chips.

## Known plugins

| Slug | What it adds | Notes |
|------|--------------|-------|
| `screen-record` | Screen-recording MCP tools (`start_recording`, `stop_recording`, `list_recordings`) | Default plugin for the `swe-full-stack`, `qa-generalist`, `swe-native` profiles. Installed at `~/.sidebutton/plugins/screen-record/` with shell handlers under `handlers/` |
| `writing-quality` | `check_writing_quality` MCP tool — scores text against the `writing/writing-quality` pack rules | Reads `ANTHROPIC_API_KEY` from `~/.agent-env` at runtime (the post-secrets restart in 19b is what makes the key available) |

## Plugin layout (`plugin.json` + handlers)

A plugin folder contains a `plugin.json` manifest plus handler scripts the server shells out to (e.g. `screen-record/handlers/{start,stop,list}_recording.sh`). Tools surface in MCP `tools/list` once the server restarts.

## Gotchas

- A plugin that needs a secret (e.g. `writing-quality` → `ANTHROPIC_API_KEY`) is useless until `19b` restarts the server **after** secrets land — order matters.
- `system_deps` in a plugin entry are apt packages installed before the clone; a missing dep makes the tool load but fail at call time.
- The `bare` (`ubuntu-claude-code`) variant has no server, so `SIDEBUTTON_PLUGINS` is ignored there.
- **Code-first** module — verify the live catalogue against `plugins.json` at the pinned `RUNNERS_REF` before relying on a specific slug.

See [[runners]] for how `SIDEBUTTON_PLUGINS` is wired through profiles and the provisioning pipeline.
