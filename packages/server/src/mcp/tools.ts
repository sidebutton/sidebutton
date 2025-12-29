/**
 * MCP tool definitions
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'run_workflow',
    description:
      'Execute a workflow automation by ID. Returns a run_id for tracking execution status.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: 'Unique identifier of the workflow',
        },
        params: {
          type: 'object',
          description: 'Key-value parameters required by the workflow',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['workflow_id'],
    },
  },
  {
    name: 'get_run_log',
    description: 'Retrieve the execution log for a completed workflow run.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: {
          type: 'string',
          description: 'The run ID returned from run_workflow',
        },
      },
      required: ['run_id'],
    },
  },
  {
    name: 'list_workflows',
    description: 'List all available workflow automations.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['all', 'actions', 'workflows'],
          description: 'Filter by source',
        },
      },
    },
  },
  {
    name: 'get_workflow',
    description: 'Get detailed information about a specific workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: 'Unique identifier of the workflow',
        },
      },
      required: ['workflow_id'],
    },
  },
  {
    name: 'list_run_logs',
    description: 'List recent workflow execution logs.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of logs to return',
        },
        workflow_id: {
          type: 'string',
          description: 'Filter logs by workflow ID',
        },
      },
    },
  },
  {
    name: 'get_browser_status',
    description: 'Check if the browser extension is connected.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'capture_page',
    description: 'Capture selectors and interactive elements from the current page.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'navigate',
    description: 'Navigate the connected browser tab to a URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'snapshot',
    description: 'Capture accessibility snapshot of the current page. Returns YAML with element refs for use with click/type. Use includeContent=true to also include visible text content as markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        includeContent: {
          type: 'boolean',
          description: 'Include visible text content in the snapshot as markdown (default: false). Useful for reading articles, documentation, or any page content.',
        },
      },
    },
  },
  {
    name: 'click',
    description: 'Click an element on the page.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element. Supports :has-text("text") pseudo-selector.',
        },
        ref: {
          type: 'number',
          description: 'Element reference from snapshot (the number after ref=).',
        },
        element: {
          type: 'string',
          description: 'Human-readable element description (for logging).',
        },
      },
    },
  },
  {
    name: 'type',
    description: 'Type text into an input element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the input element.',
        },
        ref: {
          type: 'number',
          description: 'Element reference from snapshot.',
        },
        element: {
          type: 'string',
          description: 'Human-readable element description.',
        },
        text: {
          type: 'string',
          description: 'Text to type.',
        },
        submit: {
          type: 'boolean',
          description: 'Press Enter after typing (default: false).',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['up', 'down', 'left', 'right'],
          description: 'Scroll direction.',
        },
        amount: {
          type: 'number',
          description: 'Scroll amount in pixels (default: 300).',
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'extract',
    description: 'Extract text content from an element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element.',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'screenshot',
    description: 'Capture a screenshot of the current page.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'hover',
    description: 'Hover over an element (positions cursor for scroll targeting).',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element.',
        },
      },
      required: ['selector'],
    },
  },
];
