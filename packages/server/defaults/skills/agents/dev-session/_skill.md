---
name: Dev Server Sessions
domain: agents
path: /dev-session
parent: agents
tags: ["@dev-server", "@preview", "@hmr", "@autosave", "@sideproject"]
learned: "2026-08-10"
last_verified: "2026-08-10"
confidence: 0.55
source: "code-first from docs/plans/PLAN-sideproject-core-window.md (the-assistant) + agent-runners base/ — not live-verified"
repos:
  - name: the-assistant
    remote: https://github.com/maxsv0/the-assistant.git
    path: website
    role: "Portal: preview relay, session lifecycle, staged-release publish endpoints"
  - name: agent-runners
    remote: https://github.com/sidebutton/agent-runners.git
    path: base
    role: "Stop hook (per-turn autosave + staged publish), session tidy timer, artifacts lane"
---

# Dev Server Sessions

The contract for an agent that holds a **live editing session** on a workspace project: the project's own dev server runs on the agent VM and the user watches it through the portal while chatting with the agent. This module is what `app_edit_session` (see `ops/`) runs on — read it before booting a session and whenever a session misbehaves.

Two lanes carry the work, and confusing them is the usual source of bugs. The **live lane** is the dev server: sub-second feedback, VM-local, gone when the VM is gone. The **durable lane** is the per-turn commit plus the republished staged snapshot: slower, but it survives spot reclaim and is what the user can share. The *automatic* half of it (autosave commit + debounced republish on every turn end) ships with **SP-D** (SCRUM-1937) — until that is installed on the VM, the agent's own `git commit` **and push** is the entire durable lane. The agent's job is to keep both true at every turn end.

## Preview path (why localhost is not a limitation)

```
browser → portal (auth) → relay → agent daemon :9876 /api/preview/<port>/* → 127.0.0.1:<port>
```

Every hop above the daemon is authenticated, and the daemon hard-pins the upstream to `127.0.0.1`. The `/api/preview/` passthrough itself ships with **SP-B/SP-C** (SCRUM-1935/1936) — until those land the dev server is simply unreachable from outside the VM, which changes nothing about how the agent must start it. So:

- **Bind the dev server to the IPv4 loopback, explicitly.** Verified on an agent VM: `astro dev` with no host flag listens on `[::1]:4321` **only** — `ss -ltn` shows the IPv6 loopback, the startup banner still says "Local http://localhost:4321/", and `curl http://127.0.0.1:4321/` is refused. The passthrough dials `127.0.0.1`, so the preview is dead while every log line says the server is fine. Pass the flag: `--host 127.0.0.1` (Astro, Vite), `-H 127.0.0.1` (Next).
- **Never bind `0.0.0.0`.** The VM opens no new ports for previews; a public bind adds exposure and buys nothing.
- **The port must be reachable and stable** — the passthrough addresses it by number, and an allowlist/range applies. Use the convention below, or the port the dispatch passed explicitly.

## Port conventions

| Stack | Dev port | Dev command (loopback-bound) |
|---|---|---|
| Astro | 4321 | `npm run dev -- --host 127.0.0.1` |
| Vite / SvelteKit | 5173 | `npm run dev -- --host 127.0.0.1` |
| Next.js | 3000 | `npm run dev -- -H 127.0.0.1` |
| Other | read `package.json` scripts, then the framework default | its own host flag |

An explicit `dev_port` param always wins over the convention. Read `package.json` rather than guessing the script name — `dev`, `start` and `preview` mean different things per project, and `preview` serves a stale build.

## Readiness is "answers HTTP", not "200 on `/`"

Poll `curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:<port>/` until it prints a real status; `000` means nothing is listening yet. **Any** status proves the server is serving — a project with no route at `/` (the landing kit is one: its pages are `/example` and `/product-tour-example`) answers `404` while being perfectly healthy, and a boot that demands `200` on `/` would fail forever against it. A PID or a "ready in 250 ms" log line proves nothing: that is exactly what the IPv6-bind failure above also prints.

For the ready-state screenshot, pick the app's real entry route rather than `/`, for the same reason.

## HMR behind two proxies

The browser reaches the page through the portal and the daemon, so Vite-family HMR needs to be told what the *browser* sees, not what the server binds. Without this the page loads and the websocket then fails in a retry loop, which looks like "the preview is frozen".

```js
// vite.config.* (Astro: the `vite` key in astro.config.*)
server: {
  host: '127.0.0.1',
  allowedHosts: ['app.sidebutton.com'],  // the Host header arriving through the relay
  hmr: { clientPort: 443, protocol: 'wss' },  // the browser connects over TLS on the public origin
  fs: { strict: true },                        // dev servers are dev-grade: keep the tree boundary
}
```

- **Keep it out of the user's committed config where the framework allows it.** Every turn publishes the worktree, so a hard-coded `app.sidebutton.com` / `clientPort: 443` in `vite.config.*` follows the project home and breaks the user's own `npm run dev`. Prefer the CLI flags and a local-only override (`vite.config.local.*`, an env-guarded block); commit the values only when there is no other way, and say so in the reply.
- `allowedHosts` — Vite rejects unknown `Host` headers with a 403 blocked-request page; the proxied host must be listed.
- `hmr.clientPort` / `protocol` — the client would otherwise dial the dev port directly on the public origin and never connect.
- Treat the preview route as an **untrusted-input surface**: `fs.strict` on, no dev-only debug endpoints, nothing sensitive readable from the served tree.

## The boot report (what the connect card renders)

The boot turn's reply is not a log line — it is the first thing the user sees, and the portal's connect card renders it verbatim (`PLAN-sideproject-core-window.md` §6.3). Its shape is a contract:

1. **Status line** — project and branch, dev command and port, local URL, screenshot captured or skipped.
2. **Kickoff analysis** — a few sentences: what the project already is, the next steps worth taking ordered by value, one closing question. No headings, no file dumps.
3. **Suggestion chips** — a final `SUGGESTIONS:` line followed by 3–4 `- ` lines, each a short imperative (≤60 chars) the user can send back as-is. The chat panel renders them as one-click chips, so nothing may follow the block except the verdict token.
4. **`SESSION_READY`** alone on the last line (or `BOOT_FAILED` with the log tail above it). Token-only matching: the gate never reads the prose, and display surfaces strip this line.

The route list for the page switcher is **Phase 2**, not part of this report — Phase 1 sessions are single-page.

## Session lifecycle

The session-open job **completes on its boot turn** — that is the design, not a failure. Chat then continues on the same still-alive Claude session, one turn per user message.

| Phase | What the agent does | What the user sees |
|---|---|---|
| Boot | sync → install → start server → verify it answers → ready screenshot → kickoff report | "preparing your workspace" → connected |
| Turn | one user message = one turn; edit, commit, reply, end the turn | live preview updates + the reply |
| Idle | nothing; the dev server keeps serving | live preview stays up |
| End / reclaim | — | durable staged preview + last ready screenshot |

- **Never hold a turn open.** No tailing logs, no waiting on the server, no background work you intend to "come back to". The reply reaches the user when the turn ends.
- **The dev server must survive turn end** and the 60-minute session tidy: start it detached (`setsid nohup … &`), never as a foreground child of the turn.
- **Idle TTL (~15 min) and the per-account session cap** end sessions on purpose — held agents cost money. Ending is normal; the durable lane is what persists.
- **Reconnect is a fresh dispatch onto the same worktree**, not a resurrection. A healthy server is usually still listening: probe the port and reuse it. Booting a second one either dies on `EADDRINUSE` or lands on a port the preview cannot reach.

## Autosave discipline

Every turn end runs an autosave commit plus a debounced republish of the staged snapshot (SP-D; see the honesty note above — commit and push yourself until it lands). Consequences the agent must internalise:

- **Every turn end is a publish.** Leave the tree building and coherent; do not end a turn mid-refactor with the app broken if you can help it, and say so when you must.
- **Commit early and often, with real messages.** Autosave is a safety net for the current turn, not a substitute for describing the change.
- **Never destroy autosave commits.** No `git reset --hard`, no `git checkout -- .`, no force-push over the session branch — on a reconnect those commits are the only copy of the work. Undo by reverting forward.
- **Pull with `--ff-only`.** A hard reset to `origin` at session start is exactly how a reconnect eats the previous turn's work.
- **Artifacts live outside the worktree, in the directory the lane reads.** Screenshots, reports and datasets go in `~/workspace/artifacts/`. The Stop hook's artifacts lane uploads from exactly ONE directory — the first of `<cwd>/artifacts`, `~/workspace/artifacts`, `~/artifacts` that exists — so `~/artifacts` is silently skipped on any VM that already has `~/workspace/artifacts` (most of them do: it is the pack-wide evidence convention). A screenshot written into the *project* instead rides the staged publish into the site.

## Never park credentials

- The only credential an agent VM holds is `sb_token` in `~/.agent-env`. The cloud MCP token is **never** copied onto a VM.
- Nothing secret is written into the project worktree — no `.env` with real values, no tokens in config, fixtures or committed scripts. **The worktree is published every turn**, so a parked secret becomes a published secret.
- Publish endpoints vend what they need server-side; if a task appears to need a new credential on the VM, that is a signal to stop and ask, not to paste one in.

## Gotchas

- **Declaring ready off a PID or the startup banner.** A started process is not a reachable one — verify with `curl` against `127.0.0.1` before reporting ready.
- **The IPv6-only bind.** The single most likely reason a "healthy" session shows a dead preview. Check `ss -ltn | grep <port>`: `[::1]` is broken, `127.0.0.1` is right.
- **`npm run preview` instead of `dev`.** It serves a build — no HMR, and the user's edits appear to do nothing.
- **A second dev server on a reconnect.** Probe first; reuse a healthy one.
- **Screenshot inside the project.** It gets published with the site. Use `~/workspace/artifacts/` — and note chrome exits 0 even when it could not write the file, so check the file exists before reporting the capture.
- **No chrome binary.** Ready-without-image is still ready — say the image was skipped; do not fail the boot over it.
- **`allowedHosts` forgotten.** The preview renders Vite's "Blocked request" page, which reads like an app error rather than a config gap.
