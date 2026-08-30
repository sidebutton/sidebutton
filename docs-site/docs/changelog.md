# Changelog

All notable changes to SideButton.

## [1.5.8] - 2026-08-30

### Agent Server

- **New workspaces no longer stall on the "Allow external CLAUDE.md file imports?" dialog** — Claude Code added a second interactive gate past folder trust, triggered by the portal-written workspace pointer (`CLAUDE.md` → `@AGENTS.md`) when a session launches inside a project checkout. The pre-launch trust seeding now approves external includes for every portal-provisioned workspace directory, and also repairs a previously recorded decline (which silently stripped the workspace AGENTS.md from every later session in that directory).

## [1.5.7] - 2026-08-30

### Agent Server

- **Live app-chat streaming finds the transcript again** — Claude Code ≥ 2.1.x creates the session transcript under its own uuid, ignoring the pre-set `--session-id` the dispatcher passes, so the 1.5.6 session watcher could never locate the file and the live stream stayed dark. The watcher now falls back to the single actively-written transcript when the direct lookup misses (only when unambiguous — two candidates track nothing), and keeps reporting under the dispatcher's session id so every portal surface keys as before.

## [1.5.6] - 2026-08-30

### Workflows & MCP

- **`browser.screenshot` step** — captures the page (or a `selector` / `ref` / `region` crop) straight to a PNG file on the agent machine, so an agent can produce a docs screenshot without image bytes entering its context. Brings the step count to 46 (43 implemented).
- **`screenshot` MCP tool takes `path`** — same file output from the tool. With no `path` it behaves exactly as before and still returns image bytes, so existing callers are unaffected.
- **`inject_css` MCP tool** — injects a CSS rule into the page. Combined with the above, `browser_batch` can run navigate → blur the sensitive selectors → wait → screenshot-to-file in a single call, so no unredacted image ever reaches disk.
- **`docs_screenshot` workflow** — bundled single-shot recipe wiring that sequence together.
- Output paths for both writers are contained to the home directory — `..` traversal and escaping symlinks are rejected, and nothing is created on disk until the path is cleared — matching the rule `publish_artifact` already applies, so a captured shot can be published directly. `publish_artifact` now expands `~/…` too, so the path the screenshot tool hands back can be published verbatim.
- **A step whose `{{param}}` was never passed fails loudly** — `browser.screenshot` and `browser.injectCSS` refuse an unresolved placeholder instead of treating it as a value. Previously a missing `redact_css` injected the literal text as a stylesheet, which styles nothing: the run reported success and the screenshot that followed was unredacted. Pass an empty string to mean "no redaction".
- **Browser pre-flight gate is recursive** — `run_workflow` now detects browser steps nested inside `control.foreach` / `control.if`. Previously only top-level steps were checked, so a nested browser step skipped the friendly "browser not connected" error and failed mid-run instead.
- Running an unrecognised step type on an older server still fails fast at parse time with `PARSE_ERROR: Unknown step type`, so a workflow using `browser.screenshot` against a pre-1.5.6 server reports a clear error rather than silently skipping the capture.

### Agent Server

- **Close the window, end the job** — closing a dispatched job's terminal window now kills its Claude session and resolves the job, instead of leaving a headless session running behind a closed window.
- **Live chat streaming** — an app-session chat turn streams into the portal as the agent writes it, rather than arriving as one block at the end.
- **Scripted app-session boot** — the dev-session boots via script before Claude launches, cutting session start-up time and making the ready report deterministic.
- **Notion for agents** — `NOTION_TOKEN` is delivered into the agent environment with an agent-facing connector doc, and the first (gated) Notion browser-webhook lane shipped.
- **GitLab** — a `glab`-based git provider with a host-aware push-PR workflow, a stateless gitlab.com credential helper in both manual lanes, and the workspace attach lane's gaps closed.
- **Claude Code plugin install report** — `/health` and the agent detail page now report each plugin's install outcome, and a malformed report can no longer wipe a real one.
- Fleet honesty fixes: "no evidence" now means exactly that everywhere, and the dispatch stability age keeps its own clock.

### Default skills

- **Agents pack 1.25.0** — the documentation lane ships in the default catalog: six `agent_docs_*` workflows (scope, decisions, write, verify, post-deploy, release-scan) plus the `writer` role, powering the Documentation Page playbook end-to-end; also adds `agent_se_review` (review + fix without merging) and the review-state channel refinements.

## [1.5.5] - 2026-08-11

> **Note on 1.5.4:** the 1.5.4 npm packages shipped with a stale server build that did not contain the changes below, despite reporting version 1.5.4 at runtime. 1.5.5 is the corrected release — if you installed 1.5.4, update.

### Agent Server

- **Preview passthrough** — `ANY /api/preview/:port/*` proxies HTTP and WebSocket to a dev server on the agent machine's loopback, so a live app (including hot module reload) can be viewed through the portal. Guarded by the same bearer token as the rest of `/api/*`; `SIDEBUTTON_PREVIEW_PORTS` narrows which ports are reachable.
- **Trustworthy reboots** — `POST /api/system/reboot` now runs the privileged reboot wrapper first, awaits the result, and reports what actually happened instead of replying ok before attempting anything.
- **Build verification on publish** — the npm packages now rebuild themselves at publish time (`prepublishOnly`), so a release can no longer ship a stale compiled output.

### Default skills

- **Agents pack 1.22.0** — the dev-session boot report gains an optional `ROUTES:` block (the app's pages, read off the router) and a `[viewing /path]` context line on user turns, and the ops playbook's `app_edit_session` workflow carries the full per-project app contract.

## [1.0.12] - 2026-03-28

### Highlights

- **MCP OAuth 2.1** — full OAuth discovery and registration for Claude Code 2.1.84+ compatibility
- **Temporal orchestration panel** — real-time workflow execution visibility in job detail view
- **Mobile-responsive portal** — Fleet Control pages adapt to mobile/tablet viewports
- **Plugin system** — extend the MCP server with custom tools via handler scripts in any language
- **45 step types** — added issues, git, chat, and data step categories (42 implemented, 3 chat pending)
- **Knowledge pack CLI** — `sidebutton init`, `validate`, and `publish` for creating and sharing knowledge packs
- **Context system** — persona, roles, and targets injected into every LLM call via both REST and MCP
- **Community roles** — 15 built-in role templates (SE, QA, PM, SD, HR, Sales, and more)
- **Abstract providers** — issues and git steps work across Jira, GitHub, and other platforms via auto-detected providers

### Portal & Dashboard

- Temporal orchestration panel on job detail page with phase timeline
- Sidebar count badges for Jobs and Queue
- Clickable navigation across all dashboard tables
- Removed collapsibles and Steps section from job detail for cleaner UX
- Mobile-responsive Fleet Control pages
- "All agents" targeting option for automations

### MCP & Agent Infrastructure

- MCP OAuth 2.1 discovery and `/register` endpoint for Claude Code compatibility
- Fixed OAuth discovery returning HTML 404 to Bun-based clients
- Agent 10-minute inactivity timeout for Claude Code busy status
- Default LLM model updated to gpt-5.4-nano

### New Step Types

- `browser.extractMap` — extract structured data with field mapping
- `browser.fill` — set input values directly (React-compatible)
- `browser.select_option` — select dropdown options by value or label
- `browser.scrollIntoView` — scroll elements into viewport
- `browser.injectCSS` / `browser.injectJS` — inject styles and scripts
- `browser.snapshot` — capture accessibility tree for LLM analysis
- `llm.decide` — LLM picks from a list of actions based on context
- `data.get` — get list item by index
- `variable.set` — set variables directly
- `issues.*` — create, get, search, attach, transition, comment (6 types)
- `git.*` — listPRs, getPR, createPR, listIssues, getIssue (5 types)
- `chat.*` — listChannels, readChannel, readThread (3 types, pending provider)

---

## [1.0.0] - 2025-12-27

### Initial Release

The first public release of SideButton.

#### Features

- **Workflow Engine**
  - 20 step types (browser, shell, LLM, control flow)
  - YAML-based workflow definitions
  - Variable interpolation with <code v-pre>{{variable}}</code> syntax
  - Nested workflow support via `workflow.call`

- **Browser Automation**
  - Chrome extension with WebSocket connection
  - Navigate, click, type, scroll, extract
  - Recording mode for capturing actions
  - Embed buttons for in-page automation

- **MCP Server**
  - Tools for workflow and browser control
  - Compatible with Claude Code, Cursor, VS Code, Windsurf
  - SSE transport over HTTP

- **Dashboard**
  - Svelte-based web UI
  - Workflow management
  - Recording management
  - Run log inspection
  - Settings configuration

- **Desktop App**
  - Electron-based native app
  - macOS, Windows, Linux support

- **LLM Integration**
  - OpenAI and Anthropic support
  - `llm.classify` for categorization
  - `llm.generate` for text generation
  - User contexts for customization

#### Workflow Library

Includes example workflows for:
- Wikipedia summarization
- News site aggregation
- GitHub release creation
- General browser automation

---

## Versioning

This project uses [Semantic Versioning](https://semver.org/):

- **MAJOR:** Incompatible API changes
- **MINOR:** New functionality (backward-compatible)
- **PATCH:** Bug fixes (backward-compatible)

## Reporting Issues

Found a bug? [Open an issue](https://github.com/sidebutton/sidebutton/issues/new) on GitHub.
