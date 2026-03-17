---
name: System
match: ["*"]
auto: true
---

Connected skills:
- Workflows: loaded
- Browser: status unknown

Skill loading: Knowledge packs provide domain knowledge as skill:// MCP resources. Read _skill.md for UI selectors, data model, states, and gotchas. Read _roles/*.md for role-specific instructions.
Workflow execution: Workflows are callable via the run_workflow MCP tool with workflow_id and params. Use get_run_log with the returned run_id for detailed execution results.

Available step types: browser.navigate, browser.click, browser.type, browser.scroll, browser.extract, browser.extractAll, browser.extractMap, browser.wait, browser.exists, browser.hover, browser.key, browser.snapshot, browser.injectCSS, browser.injectJS, browser.select_option, browser.scrollIntoView, browser.fill, shell.run, terminal.open, terminal.run, llm.classify, llm.generate, llm.decide, control.if, control.retry, control.foreach, control.stop, workflow.call, data.first, data.get, variable.set, issues.create, issues.get, issues.search, issues.attach, issues.transition, issues.comment, chat.listChannels, chat.readChannel, chat.readThread, git.listPRs, git.getPR, git.createPR, git.listIssues, git.getIssue
