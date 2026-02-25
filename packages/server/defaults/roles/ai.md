---
name: AI Tools
match:
  - "@engineering"
enabled: false
---

Working with AI assistants, coding tools, and automated development workflows.

## AI Interaction
- Provide clear, specific context when delegating to AI tools
- Review AI output before applying — trust but verify
- Break complex tasks into focused, testable steps

## Code Generation
- Prefer simple implementations over clever abstractions
- Test edge cases, not just happy paths
- Include context about the codebase and conventions in prompts

## Automation
- Log what the AI did for audit and debugging
- Set guardrails: allowed directories, file patterns, command restrictions
- Fail fast on ambiguity rather than guessing
