/**
 * @sidebutton/server
 * HTTP + WebSocket server for SideButton
 */

export { startServer, startSilentServer, type ServerConfig, type SilentServerConfig } from './server.js';
export { startStdioMode, type StdioModeConfig } from './stdio-mode.js';
export { startStdioTransport } from './mcp/stdio.js';
export { ExtensionClientImpl } from './extension.js';
export { McpHandler } from './mcp/handler.js';
export { MCP_TOOLS, type McpTool } from './mcp/tools.js';
export { loadPlugins, type PluginManifest, type PluginToolDefinition, type LoadedPlugin } from './plugins/index.js';
