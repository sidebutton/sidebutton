# AGENTS.md

## Project

SideButton is an open-source AI agent platform: MCP server with browser tools, YAML workflow engine, and knowledge packs that bundle domain expertise per web app.

- **Language:** TypeScript
- **Package manager:** pnpm
- **Monorepo layout:** `packages/` (server, core, dashboard, sidebutton)

## Build & Run

**Quick start (published package, no clone needed):**

```bash
npx sidebutton@latest   # starts server + dashboard on port 9876
```

**Local development:**

```bash
pnpm install
pnpm build
pnpm start               # or: pnpm dev
```

## Code Style

- TypeScript strict mode
- ES modules

## Testing

```bash
pnpm test              # run all tests
pnpm test --filter server  # test specific package
```

## Package Structure

| Package | Purpose |
|---------|---------|
| `packages/server` | MCP server — browser tools, workflow runner, REST API |
| `packages/core` | Workflow engine, step executors, shared types |
| `packages/dashboard` | Web UI for workflows, run logs, settings |
| `packages/sidebutton` | CLI entry point (`npx sidebutton@latest`) |
| `extension/` | Chrome extension (Manifest V3) — distributed via Chrome Web Store |

## Key Concepts

- **Knowledge packs** — markdown files bundling selectors, data models, and role playbooks per web app
- **Workflows** — YAML files with steps (navigate, click, type, extract, LLM, shell, control flow)
- **Skill resources** — served via MCP `skill://` URIs for AI agent consumption
- **Browser tools** — snapshot, screenshot, click, type, fill, navigate, evaluate, etc.

## Security

- Never commit secrets or credentials
- See SECURITY.md for vulnerability reporting
