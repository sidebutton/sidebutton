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
    description: 'Capture accessibility snapshot of the current page. Returns YAML with element refs for use with click/type. Use includeContent=true to also include visible text content as markdown. Note: taking a snapshot may dismiss inline modals or popups — use screenshot instead if you need to verify modal content.',
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
    name: 'press_key',
    description: 'Press a key on the keyboard. Use this for keyboard shortcuts, Tab navigation, Enter, Escape, arrow keys, etc. Supports key combinations like "Ctrl+A" or "Shift+Tab".',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Key to press. Examples: "Tab", "Enter", "Escape", "ArrowDown", "Backspace", "Shift+Tab", "Ctrl+A". For single characters, use the character directly (e.g., "a").',
        },
        selector: {
          type: 'string',
          description: 'Optional CSS selector to focus before pressing the key.',
        },
        ref: {
          type: 'number',
          description: 'Optional element reference from snapshot to focus before pressing the key.',
        },
      },
      required: ['key'],
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
    description: 'Capture a screenshot of the current page. Prefer cropping to a specific area instead of capturing the full viewport — use ref (from snapshot), selector (CSS), or region (manual rect) to save context tokens. Full viewport is fine for first visit to a new page; after that, crop to the relevant section.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: {
          type: 'number',
          description: 'Element reference from snapshot (the number after ref=). Crops screenshot to that element with padding.',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for the element. Crops screenshot to that element with padding.',
        },
        region: {
          type: 'object',
          description: 'Manual crop region in CSS pixels (viewport coordinates).',
          properties: {
            x: { type: 'number', description: 'Left edge X coordinate' },
            y: { type: 'number', description: 'Top edge Y coordinate' },
            width: { type: 'number', description: 'Width in pixels' },
            height: { type: 'number', description: 'Height in pixels' },
          },
          required: ['x', 'y', 'width', 'height'],
        },
      },
    },
  },
  {
    name: 'select_option',
    description: 'Select an option from a native <select> dropdown element. Use this instead of click for <select> elements, as native dropdowns cannot be controlled via click events.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the <select> element.',
        },
        ref: {
          type: 'number',
          description: 'Element reference from snapshot (the number after ref=).',
        },
        element: {
          type: 'string',
          description: 'Human-readable element description (for logging).',
        },
        value: {
          type: 'string',
          description: 'The option value to select (matches <option value="...">).',
        },
        label: {
          type: 'string',
          description: 'The visible text of the option to select (matches <option> text content).',
        },
      },
    },
  },
  {
    name: 'fill',
    description: 'Fill a form field by setting its value programmatically. Unlike "type" (which simulates keystrokes), "fill" sets the value directly and triggers React/Vue/Angular change events. Use this for framework-controlled inputs where "type" doesn\'t work.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the input element.',
        },
        value: {
          type: 'string',
          description: 'Value to set on the input.',
        },
      },
      required: ['selector', 'value'],
    },
  },
  {
    name: 'wait',
    description: 'Wait for an element to appear on the page. Blocks until the element matching the selector exists in the DOM, or throws after timeout.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector to wait for.',
        },
        timeout: {
          type: 'number',
          description: 'Maximum wait time in milliseconds (default: 5000).',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'exists',
    description: 'Check if an element exists on the page. Returns true/false without throwing. Useful for conditional logic.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector to check.',
        },
        timeout: {
          type: 'number',
          description: 'How long to wait before returning false, in milliseconds (default: 2000).',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'extract_all',
    description: 'Extract text from all elements matching a selector, joined by a separator. Useful for getting lists of items, table columns, or repeated elements.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector matching multiple elements.',
        },
        separator: {
          type: 'string',
          description: 'String to join results with (default: "\\n").',
        },
        attribute: {
          type: 'string',
          description: 'Optional attribute to extract instead of text content (e.g., "href", "src").',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'extract_map',
    description: 'Extract structured data from repeated elements. For each element matching the outer selector, extracts named fields using sub-selectors. Returns JSON array of objects.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the repeating container elements (e.g., "table tbody tr", ".card").',
        },
        fields: {
          type: 'object',
          description: 'Map of field names to extraction rules. Each rule has a "selector" (relative CSS selector) and optional "attribute".',
          additionalProperties: {
            type: 'object',
            properties: {
              selector: { type: 'string', description: 'CSS selector relative to the container element.' },
              attribute: { type: 'string', description: 'Optional attribute to extract instead of text content.' },
            },
            required: ['selector'],
          },
        },
      },
      required: ['selector', 'fields'],
    },
  },
  {
    name: 'scroll_into_view',
    description: 'Scroll a specific element into the viewport. More precise than "scroll" — targets an exact element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to scroll into view.',
        },
        block: {
          type: 'string',
          enum: ['start', 'center', 'end', 'nearest'],
          description: 'Vertical alignment in viewport (default: "center").',
        },
      },
      required: ['selector'],
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
  {
    name: 'evaluate',
    description: 'Execute JavaScript in the browser page context and return the result. Useful for reading page state, checking values, or performing calculations.',
    inputSchema: {
      type: 'object',
      properties: {
        js: {
          type: 'string',
          description: 'JavaScript code to evaluate in the page context.',
        },
      },
      required: ['js'],
    },
  },
];
