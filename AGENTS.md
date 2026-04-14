# AGENTS.md

## Project

SideButton is an open-source AI agent platform: MCP server (40+ browser tools), YAML workflow engine (34+ step types), and knowledge packs that bundle domain expertise per web app.

- **Language:** TypeScript
- **Package manager:** pnpm
- **Monorepo layout:** `packages/` (server, core, dashboard, sidebutton)

## Build & Run

```bash
pnpm install
pnpm build
npx sidebutton@latest   # starts server + dashboard on port 9876
```

## Code Style

- TypeScript strict mode
- ES modules
- Conventional commits: `feat(server):`, `fix(core):`, `docs:`, etc.

## Testing

```bash
pnpm test              # run all tests
pnpm test --filter server  # test specific package
```

## Package Structure

| Package | Purpose |
|---------|---------|
| `packages/server` | MCP server — browser tools, workflow runner, REST API |
| `packages/core` | Shared types, utilities, workflow parser |
| `packages/dashboard` | Web UI for workflows, run logs, settings |
| `packages/sidebutton` | CLI entry point (`npx sidebutton@latest`) |

## Key Concepts

- **Knowledge packs** — markdown files bundling selectors, data models, and role playbooks per web app
- **Workflows** — YAML files with steps (navigate, click, type, extract, LLM, shell, control flow)
- **Skill resources** — served via MCP `skill://` URIs for AI agent consumption
- **Browser tools** — snapshot, screenshot, click, type, fill, navigate, evaluate, etc.

## Security

- Never commit secrets or credentials
- See SECURITY.md for vulnerability reporting
