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
} from '@modelcontextprotocol/sdk/types.js';
import { MCP_TOOLS } from './tools.js';
import type { McpHandler } from './handler.js';
import { VERSION } from '../version.js';

/**
 * Start MCP server with stdio transport
 * All communication happens via stdin/stdout - no console.log allowed
 */
export async function startStdioTransport(handler: McpHandler): Promise<void> {
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
      throw new Error(parsed.error.message);
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
      throw new Error(parsed.error.message);
    }

    return parsed.result;
  });

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
