/**
 * stdio mode entry point
 * Starts MCP server with stdio transport for Claude Desktop
 * Also runs HTTP server silently for browser extension WebSocket
 */

import { startStdioTransport } from './mcp/stdio.js';
import { McpHandler } from './mcp/handler.js';
import { ExtensionClientImpl } from './extension.js';
import { startSilentServer } from './server.js';

export interface StdioModeConfig {
  port: number;
  actionsDir: string;
  workflowsDir: string;
  templatesDir: string;
  runLogsDir: string;
}

/**
 * Start SideButton in stdio mode for Claude Desktop
 *
 * - No stdout output (reserved for JSON-RPC)
 * - Logs to stderr only
 * - HTTP server runs silently for browser extension
 * - stdio transport handles MCP protocol
 */
export async function startStdioMode(config: StdioModeConfig): Promise<void> {
  // Log to stderr (allowed by MCP spec)
  process.stderr.write('[sidebutton] starting in stdio mode\n');

  // Create extension client for browser automation
  const extensionClient = new ExtensionClientImpl();
  extensionClient.markServerRunning();

  // Create MCP handler
  const mcpHandler = new McpHandler(
    config.actionsDir,
    config.workflowsDir,
    config.templatesDir,
    config.runLogsDir,
    extensionClient
  );

  // Start HTTP server silently in background (for browser extension WebSocket)
  // This doesn't block - runs in background
  try {
    await startSilentServer({
      ...config,
      extensionClient,
      mcpHandler,
    });
    process.stderr.write(`[sidebutton] HTTP server on port ${config.port} (for browser extension)\n`);
  } catch (err) {
    process.stderr.write(`[sidebutton] warning: could not start HTTP server: ${err}\n`);
    // Continue anyway - stdio transport can work without browser
  }

  process.stderr.write('[sidebutton] ready for MCP connections via stdio\n');

  // Start stdio transport (this blocks until disconnected)
  await startStdioTransport(mcpHandler);
}
