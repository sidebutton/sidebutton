---
name: Agent Plugin Catalog
domain: agents
path: /plugins
parent: agents
tags: ["@plugins", "@mcp-tools", "@claude-code-plugins", "@fleet", "@extensibility"]
learned: "2026-06-03"
last_verified: "2026-08-20"
confidence: 0.50
source: "code-first from github.com/sidebutton/agent-runners (plugins.json, base/19b, base/19i) — not live-verified"
repos:
  - name: agent-runners
    remote: https://github.com/sidebutton/agent-runners.git
    path: plugins.json
---

# Agent Plugin Catalog

**An agent has TWO plugin systems, and they share nothing but the word.** Crossing the wires fails silently — the wrong catalogue simply has no such entry — so establish which one you are in before touching anything:

| | SideButton MCP plugins | Claude Code plugins |
|---|---|---|
| Cloud-init variable | `SIDEBUTTON_PLUGINS` (comma slugs) | `CLAUDE_PLUGINS` (comma `name@marketplace`) + `CLAUDE_PLUGIN_MARKETPLACES` (`alias=owner/repo`) |
| Catalogue | `agent-runners/plugins.json` (slug → git repo) | a Claude Code *marketplace* — a repo whose manifest names itself and lists its plugins |
| Chosen by | the profile's `default_plugins` ∪ a provision override | the operator, free-typed in the Create-Agent wizard's step 2, gated by the account's marketplace allowlist |
| Install step | `base/19b-plugins.sh` | `base/19i-claude-plugins.sh` |
| Lands in | `~/.sidebutton/plugins/<slug>/` | `~/.claude/plugins/` |
| Consumed by | the SideButton MCP server (as MCP tools) | the Claude Code CLI (as skills/commands/agents) |
| Reported on `/health` | `plugins[]` → `agents.plugins` | `claude_plugins[]` → `agents.claude_plugins_installed` |

The rest of this page is the SideButton MCP catalogue; [Claude Code plugins](#claude-code-plugins-the-second-store) covers the other one.

## How SideButton MCP plugins are installed

- Each `plugins.json` entry maps a `slug` → public git `repo` (+ `ref`, `submodules`, `system_deps`).
- At provision time the portal forwards `SIDEBUTTON_PLUGINS` = a profile's `default_plugins` ∪ any provision-request override (see [[runners]] for profiles).
- `base/19b-plugins.sh` runs **after** `19-secrets.sh`, clones the requested slugs into `~/.sidebutton/plugins/`, then `systemctl restart sidebutton` so the server loads the new plugins together with the now-populated `~/.agent-env`.
- Plugins only apply to variants that ship a server (`ext`, `noext`) — **never** the `bare` variant.
- The agent reports loaded plugins on `GET /health` (`plugins[]`); the portal fleet list + agent detail render those chips.
- Catalogue values reach a root `apt-get` and a `su`, so `19b` pattern-checks `repo`, `ref` and every `system_deps` token and passes each as an argv element. A value that fails the check is skipped, not quoted-and-hoped.

## Known plugins

| Slug | What it adds | Notes |
|------|--------------|-------|
| `screen-record` | Screen-recording MCP tools (`start_recording`, `stop_recording`, `list_recordings`) | Default plugin for the `swe-full-stack`, `qa-generalist`, `swe-native` profiles. Installed at `~/.sidebutton/plugins/screen-record/` with shell handlers under `handlers/` |
| `writing-quality` | `check_writing_quality` MCP tool — scores text against the `writing/writing-quality` pack rules | Reads `ANTHROPIC_API_KEY` from `~/.agent-env` at runtime (the post-secrets restart in 19b is what makes the key available) |

## Plugin layout (`plugin.json` + handlers)

A plugin folder contains a `plugin.json` manifest plus handler scripts the server shells out to (e.g. `screen-record/handlers/{start,stop,list}_recording.sh`). Tools surface in MCP `tools/list` once the server restarts.

## Claude Code plugins (the second store)

- The operator types `name` or `name@marketplace` in the wizard; a bare name defaults to `claude-plugins-official`. The account allowlist (**Settings → Cloud → Claude Code plugin marketplaces**) is the only control on where plugin code may come from — it is not cosmetic, since plugins run on a box where Claude skips dangerous-mode permission prompts and `~/.agent-env` holds `GH_TOKEN`.
- `base/19i-claude-plugins.sh` runs after `19b`, as the agent user, gated on `command -v claude` (**not** on a component flag — the fleet-refresh path has no component gates, so one would skip every existing agent).
- Per ref: `claude plugin marketplace add <owner/repo>`, then `claude plugin install <name>@<marketplace> -s user`. Both are idempotent; the step skips them entirely when every ref is already in `claude plugin list`.
- The alias is resolved **by repo**, not by the operator's label: `marketplace add` registers the manifest's own name, so `known_marketplaces.json` may key the pack under something else entirely.
- Result: a ledger at `~/.sidebutton/claude-plugins.json`, one entry per requested ref — `{name, marketplace, status, version, error}` with `status` ∈ `installed` | `failed` | `rejected`. It rides `/health` as `claude_plugins[]` and renders per chip on agent detail.
- The step is listed in `base/refresh-manifest.txt`, so it also **repairs** the set on the fleet-refresh path — the request is persisted into `~/.agent-env` precisely so the re-run has an input. That path is gated on the base-artifact fingerprint, so a repair lands when the agent-runners base tree/ref moves, not on every `agent_pull_repos` tick.

## Gotchas

- A plugin that needs a secret (e.g. `writing-quality` → `ANTHROPIC_API_KEY`) is useless until `19b` restarts the server **after** secrets land — order matters.
- `system_deps` in a plugin entry are apt packages installed before the clone; a missing dep makes the tool load but fail at call time.
- The `bare` (`ubuntu-claude-code`) variant has no server, so `SIDEBUTTON_PLUGINS` is ignored there.
- A Claude Code plugin only takes effect for a **new** `claude` session; the step deliberately restarts nothing, because agent jobs launch a fresh CLI per job.
- A grey "not reported" chip on agent detail is an agent that predates `19i` (or has not polled yet) — not a failed install. Read the ledger, not the request, for installed state.
- **Code-first** module — verify the live catalogue against `plugins.json` at the pinned `RUNNERS_REF` before relying on a specific slug.

See [[runners]] for how `SIDEBUTTON_PLUGINS` is wired through profiles and the provisioning pipeline.
