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

/**
 * Start MCP server with stdio transport
 * All communication happens via stdin/stdout - no console.log allowed
 */
export async function startStdioTransport(handler: McpHandler): Promise<void> {
  const server = new Server(
    {
      name: 'sidebutton',
      version: '1.0.6',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Handle tools/list
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: MCP_TOOLS };
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
