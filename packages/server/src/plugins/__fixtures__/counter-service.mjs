/**
 * Minimal stateful stdio-MCP server used as a test fixture for the service-plugin runtime.
 *
 * It is a real MCP server (built on the same SDK the SideButton server uses) that holds an
 * in-memory counter across calls — exercising the whole point of the `service` tier (state that
 * survives between `tools/call`s, impossible in the stateless spawn-per-call `process` tier).
 *
 * Plain ESM (.mjs) so it runs directly under `node` when spawned by the manager — no build step.
 * Writes nothing to stdout except MCP protocol frames (the SDK transport owns stdout); diagnostics
 * go to stderr only.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

let counter = 0;

const server = new Server(
  { name: 'counter-service', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'increment',
      description: 'Add `by` (default 1) to the persistent counter and return the new value.',
      inputSchema: { type: 'object', properties: { by: { type: 'number' } } },
    },
    {
      name: 'get',
      description: 'Return the current counter value (proves state persists across calls).',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'echo',
      description: 'Echo back the `text` input.',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    },
    {
      name: 'sleep',
      description: 'Sleep for `ms` then return — used to exercise serialization and timeouts.',
      inputSchema: { type: 'object', properties: { ms: { type: 'number' } } },
    },
    {
      name: 'crash',
      description: 'Exit the process immediately — used to exercise restart-on-crash.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  switch (name) {
    case 'increment': {
      const by = typeof args.by === 'number' ? args.by : 1;
      counter += by;
      return { content: [{ type: 'text', text: String(counter) }] };
    }
    case 'get':
      return { content: [{ type: 'text', text: String(counter) }] };
    case 'echo':
      return { content: [{ type: 'text', text: String(args.text ?? '') }] };
    case 'sleep': {
      const ms = typeof args.ms === 'number' ? args.ms : 0;
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { content: [{ type: 'text', text: `slept ${ms}` }] };
    }
    case 'crash':
      process.exit(1);
      return { content: [{ type: 'text', text: 'unreachable' }] };
    default:
      return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
process.stderr.write('[counter-service] ready\n');
