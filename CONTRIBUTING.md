# Contributing to SideButton

Thanks for your interest in contributing. SideButton is an open-source workflow automation tool licensed under [Apache-2.0](LICENSE). Contributions of all kinds are welcome — bug reports, workflow additions, feature ideas, and code changes.

Docs: [docs.sidebutton.com](https://docs.sidebutton.com)

## Development Setup

**Prerequisites:**
- Node.js 20+
- pnpm 9.15+
- Chrome (for browser automation features)

```bash
# Clone the repo
git clone https://github.com/sidebutton/sidebutton.git
cd sidebutton

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start the server
pnpm start
# Open http://localhost:9876
```

## Project Structure

| Directory | What it is |
|-----------|------------|
| `packages/core/` | Workflow engine — parser, executor, step implementations |
| `packages/server/` | HTTP server, MCP endpoint, CLI, WebSocket bridge |
| `packages/dashboard/` | Svelte web UI served at localhost:9876 |
| `extension/` | Chrome extension for browser automation |
| `workflows/` | Public workflow library (YAML files) |
| `actions/` | User-created workflows (gitignored) |

## Development Workflow

Start everything in watch mode:

```bash
pnpm dev
```

This runs the core library, server, and dashboard with hot reload. You can also run components individually:

```bash
pnpm dev:server      # Server with auto-restart on :9876
pnpm dev:dashboard   # Dashboard with HMR on :5173
pnpm dev:core        # Core library watch build
```

**Loading the Chrome extension:**

1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `extension/` folder
4. Navigate to any page and click the extension icon to connect

## Contributing Workflows

The easiest way to contribute is by adding workflows to the `workflows/` directory. Each workflow is a YAML file:

```yaml
id: my_workflow
title: "My Workflow"
description: "What this workflow does"
steps:
  - type: shell.run
    cmd: "echo 'Hello!'"
```

See the [step reference](https://docs.sidebutton.com) for all available step types and configuration options.

## Submitting Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Test that everything builds: `pnpm build`
4. Open a pull request against `main`

For commit messages, keep them concise and descriptive. Start with a verb — `add`, `fix`, `update`, `remove`. No strict format enforced.

In your PR description, explain **what** changed and **why**. If it fixes an issue, reference it.

## Reporting Issues

Please [open an issue](https://github.com/sidebutton/sidebutton/issues/new/choose) using one of the templates. Include:

- SideButton version (`pnpm cli --version` or check `package.json`)
- Node.js version (`node --version`)
- OS and browser (if relevant)
- Steps to reproduce

## Code of Conduct

We follow the [Contributor Covenant](https://www.contributor-covenant.org/) in spirit. The short version:

- Be respectful and constructive
- No harassment, discrimination, or personal attacks
- Assume good intent
- Focus on what's best for the project and community

We're a small project. If there's a problem, open an issue or reach out directly. We'll handle it.
