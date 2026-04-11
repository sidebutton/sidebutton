# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in SideButton, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email **security@sidebutton.com** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and aim to provide a fix or mitigation within 7 days for critical issues.

## Scope

This policy covers:

- `@sidebutton/core` — workflow engine and step executors
- `@sidebutton/server` — MCP server, HTTP/WebSocket API
- `sidebutton` — CLI wrapper
- SideButton Chrome extension

## Security Considerations

SideButton runs locally on your machine and connects to your browser. Key security notes:

- **Local execution only.** The server runs on localhost. It does not expose ports to the network by default.
- **Browser extension permissions.** The Chrome extension requires broad permissions to automate web pages. Review the extension permissions before installing.
- **Workflow execution.** Workflows can execute shell commands and browser actions. Only run workflows from trusted sources.
- **API keys.** LLM step types require API keys (OpenAI, Anthropic). These are read from environment variables and never logged or transmitted beyond the configured LLM provider.
