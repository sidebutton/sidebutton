# @sidebutton/core

Core workflow engine for [SideButton](https://sidebutton.com) - YAML-based browser and shell automation.

[![npm version](https://img.shields.io/npm/v/@sidebutton/core.svg)](https://www.npmjs.com/package/@sidebutton/core)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/sidebutton/sidebutton/blob/main/LICENSE)

## Installation

```bash
npm install @sidebutton/core
```

## Overview

This package provides the core workflow engine used by SideButton:

- **Workflow Types** - TypeScript definitions for workflows, steps, and execution context
- **YAML Parser** - Load and validate workflow definitions from YAML files
- **Step Executors** - Execute 20+ step types (browser, shell, LLM, control flow)
- **Variable Interpolation** - `{{variable}}` syntax for dynamic values

## Usage

```typescript
import { parseWorkflow, executeWorkflow } from '@sidebutton/core';

// Parse a workflow from YAML
const workflow = parseWorkflow(`
  id: hello_world
  title: Hello World
  steps:
    - type: shell.run
      cmd: echo "Hello from SideButton!"
`);

// Execute the workflow
const result = await executeWorkflow(workflow, context);
```

## Step Types

| Category | Steps |
|----------|-------|
| Browser | `navigate`, `click`, `type`, `scroll`, `hover`, `wait`, `extract`, `extractAll`, `exists`, `key` |
| Shell | `shell.run`, `terminal.open`, `terminal.run` |
| LLM | `llm.classify`, `llm.generate` |
| Control | `control.if`, `control.retry`, `control.stop`, `workflow.call` |
| Data | `data.first` |

## Documentation

- [Full Documentation](https://docs.sidebutton.com)
- [GitHub Repository](https://github.com/sidebutton/sidebutton)
- [Website](https://sidebutton.com)

## Related Packages

- [`@sidebutton/server`](https://www.npmjs.com/package/@sidebutton/server) - MCP server with REST API and dashboard

## License

Apache-2.0
