/**
 * stdio transport adapter for MCP
 * Enables Claude Desktop compatibility via stdin/stdout JSON-RPC
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { MCP_TOOLS } from './tools.js';
import type { McpHandler } from './handler.js';
import { VERSION } from '../version.js';

/**
 * Re-raise a JSON-RPC error from the shared handler without losing its shape (KAN-32/D3).
 *
 * `throw new Error(message)` made the SDK re-map every failure to -32603 (Internal error)
 * and drop `data`, so stdio and HTTP+SSE disagreed on the code for the same miss. An
 * McpError carries the handler's own code and data through to the client unchanged.
 */
function rethrowJsonRpcError(error: { code?: number; message?: string; data?: unknown }): never {
  throw new McpError(
    typeof error.code === 'number' ? error.code : ErrorCode.InternalError,
    error.message ?? 'Unknown error',
    error.data,
  );
}

/**
 * Build the MCP `Server` used by the stdio transport, with every request handler wired
 * to the shared JSON-RPC handler.
 *
 * Split out from {@link startStdioTransport} so the transport regression tests can drive
 * exactly these handlers over an in-memory transport pair — including the SDK's own error
 * serialisation, which is where a bare `throw new Error` used to become -32603.
 */
export function createStdioMcpServer(handler: McpHandler): Server {
  const server = new Server(
    {
      name: 'sidebutton',
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Handle tools/list — delegate to the JSON-RPC handler so plugin tools
  // (loaded via configDir/plugins/*) are included alongside MCP_TOOLS.
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const response = await handler.handleRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      })
    );
    const parsed = JSON.parse(response);
    if (parsed.error) {
      // Fall back to core tools if the handler errored — keeps stdio usable.
      process.stderr.write(`[sidebutton] tools/list handler error: ${parsed.error.message}\n`);
      return { tools: MCP_TOOLS };
    }
    return parsed.result;
  });

  // Handle tools/call
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Delegate to existing handler
    const response = await handler.handleRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      })
    );

    const parsed = JSON.parse(response);

    if (parsed.error) {
      rethrowJsonRpcError(parsed.error);
    }

    return parsed.result;
  });

  // Handle resources/list
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const response = await handler.handleRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/list',
      })
    );

    const parsed = JSON.parse(response);
    return parsed.result;
  });

  // Handle resources/read
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const response = await handler.handleRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/read',
        params: { uri: request.params.uri },
      })
    );

    const parsed = JSON.parse(response);

    if (parsed.error) {
      rethrowJsonRpcError(parsed.error);
    }

    return parsed.result;
  });

  return server;
}

/**
 * Start MCP server with stdio transport
 * All communication happens via stdin/stdout - no console.log allowed
 */
export async function startStdioTransport(handler: McpHandler): Promise<void> {
  const server = createStdioMcpServer(handler);

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (allowed by MCP spec)
  process.stderr.write('[sidebutton] stdio transport connected\n');

  // Keep process running until disconnected
  await new Promise<void>((resolve) => {
    server.onclose = () => {
      process.stderr.write('[sidebutton] stdio transport disconnected\n');
      resolve();
    };
  });
}
