/**
 * @sidebutton/server
 * HTTP + WebSocket server for SideButton
 */

export { startServer, type ServerConfig } from './server.js';
export { ExtensionClientImpl } from './extension.js';
export { McpHandler } from './mcp/handler.js';
export { MCP_TOOLS, type McpTool } from './mcp/tools.js';
