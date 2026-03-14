# Contributing

Thank you for your interest in contributing to SideButton!

## Contributing Skill Packs

Skill packs are the fastest way to contribute — no code changes needed. A skill pack packages domain knowledge, workflows, and role playbooks for a specific web app.

### Quick Start

```bash
# Initialize a new skill pack for a domain
sidebutton init example.com

# Document the app — add selectors, states, navigation to _skill.md files
# Add workflows as YAML files
# Add role playbooks in _roles/ directories

# Validate your pack
sidebutton validate

# Publish to the registry (free for everyone)
sidebutton publish
```

### Skill Pack Guidelines

- **One domain per pack** — each pack targets a single web application
- **Use real selectors** — test with the actual app, not guessed selectors
- **No credentials** — never include API keys, passwords, or personal data
- **Test with an agent** — verify your pack works with an AI agent (Claude Code, Cursor)
- **Include a root `_skill.md`** — every pack needs domain-level documentation
- **Add role playbooks** — `_roles/qa.md`, `_roles/se.md` etc. teach agents how to use the pack

See [Creating Skill Packs](/skill-packs/creating) for the full guide and [CLI Reference](/skill-packs/cli) for all commands.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Chrome browser

### Setup

```bash
# Clone the repository
git clone https://github.com/sidebutton/sidebutton.git
cd sidebutton

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start development mode
pnpm dev
```

### Project Structure

```
sidebutton/
├── packages/
│   ├── core/          # Workflow types and execution engine
│   ├── server/        # HTTP/WebSocket server, MCP handler
│   ├── dashboard/     # Svelte web UI
│   └── desktop/       # Electron app
├── workflows/         # Public workflow library
├── actions/           # User workflows (gitignored)
├── docs/              # Documentation source
└── docs-site/         # VitePress documentation site
```

## Development

### Running in Dev Mode

```bash
# Full dev mode (all packages with watch rebuild)
pnpm dev

# Individual components
pnpm dev:server        # Server with auto-restart on :9876
pnpm dev:dashboard     # Dashboard watch build (outputs to server)
pnpm dev:core          # Core library watch
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @sidebutton/core build
```

### Testing

```bash
# Run tests
pnpm test

# Run linting
pnpm lint
```

## Contributing Workflows

### Adding a Public Workflow

1. Create a YAML file in `workflows/`
2. Follow the naming convention: `domain_action.yaml`
3. Include required fields:
   ```yaml
   id: unique_id
   title: "Human-Readable Title"
   description: "What this workflow does"
   steps:
     - type: ...
   ```
4. Add appropriate policies:
   ```yaml
   policies:
     allowed_domains:
       - example.com
   ```

### Workflow Guidelines

- Keep workflows focused (one task per workflow)
- Use stable selectors (prefer `data-testid`, `aria-label`)
- Include helpful descriptions
- Don't hardcode credentials or personal data
- Test on different screen sizes

## Contributing Code

### Code Style

- TypeScript for all source code
- Prettier for formatting (run `pnpm format`)
- ESLint for linting (run `pnpm lint`)

### Commit Messages

Follow conventional commits:

```
feat: add new browser.select step type
fix: handle null selectors in extract
docs: update MCP setup instructions
```

### Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run tests: `pnpm test`
5. Run linting: `pnpm lint`
6. Commit with conventional commit message
7. Push and create PR

### PR Guidelines

- Keep PRs focused (one feature/fix per PR)
- Update documentation if needed
- Add tests for new functionality
- Ensure CI passes

## Contributing Documentation

### Documentation Site

```bash
cd docs-site
npm install
npm run dev
```

### Writing Docs

- Use clear, simple language
- Include code examples
- Add links to related pages
- Use tables for reference content

## Areas for Contribution

### Good First Issues

Look for issues labeled `good first issue`:
- Documentation improvements
- Bug fixes with clear reproduction steps
- Small feature additions

### Wanted Features

- Additional step types
- More workflow examples
- IDE integrations
- Performance improvements

## Questions?

- [GitHub Discussions](https://github.com/sidebutton/sidebutton/discussions) — For questions and ideas
- [GitHub Issues](https://github.com/sidebutton/sidebutton/issues) — For bugs and feature requests

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.
