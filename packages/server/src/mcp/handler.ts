/**
 * MCP JSON-RPC handler
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import {
  type Workflow,
  type RunLog,
  type RunLogMetadata,
  type Settings,
  type LlmConfig,
  ExecutionContext,
  executeWorkflow,
  loadWorkflowsFromDir,
  loadWorkflow,
} from '@sidebutton/core';
import type { ExtensionClientImpl } from '../extension.js';
import { MCP_TOOLS, type McpTool } from './tools.js';
import { loadPlugins, executePluginTool } from '../plugins/index.js';
import type { LoadedPlugin, PluginToolDefinition } from '../plugins/types.js';
import { reportRunLog } from '../services/report.js';
import { loadContextAll, loadTargets, loadRoles } from '../context.js';
import { matchTarget } from '../matching.js';
import { VERSION } from '../version.js';

/**
 * Recursively load all YAML workflows from a directory tree (for skill packs).
 */
function loadWorkflowsRecursive(dir: string): Workflow[] {
  const workflows: Workflow[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        workflows.push(...loadWorkflowsRecursive(fullPath));
      } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
        try {
          workflows.push(loadWorkflow(fullPath));
        } catch {
          // skip invalid workflows
        }
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return workflows;
}

function extractDomain(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// Type for the broadcaster passed from server
export interface DashboardBroadcaster {
  broadcastRunningWorkflowsChanged(workflows: { run_id: string; workflow_id: string; workflow_title: string; started_at: string; params: Record<string, string> }[]): void;
}

// Interface for tracking running workflows (shared with REST API)
export interface RunningWorkflowsTracker {
  add(runId: string, workflowId: string, workflowTitle: string, params: Record<string, string>, context?: ExecutionContext): void;
  remove(runId: string): void;
  getAll(): { run_id: string; workflow_id: string; workflow_title: string; started_at: string; params: Record<string, string> }[];
}

export class McpHandler {
  private actionsDir: string;
  private workflowsDir: string;
  private templatesDir: string;
  private runLogsDir: string;
  private configDir: string;
  private extensionClient: ExtensionClientImpl;
  private actions: Workflow[] = [];
  private workflows: Workflow[] = [];
  private templates: Workflow[] = [];
  private plugins: LoadedPlugin[] = [];
  private broadcaster: DashboardBroadcaster | null = null;
  private runningWorkflowsTracker: RunningWorkflowsTracker | null = null;

  constructor(
    actionsDir: string,
    workflowsDir: string,
    templatesDir: string,
    runLogsDir: string,
    extensionClient: ExtensionClientImpl,
    configDir?: string,
  ) {
    this.actionsDir = actionsDir;
    this.workflowsDir = workflowsDir;
    this.templatesDir = templatesDir;
    this.runLogsDir = runLogsDir;
    this.configDir = configDir ?? actionsDir;
    this.extensionClient = extensionClient;
    this.reload();
  }

  /**
   * Set the dashboard broadcaster for real-time updates
   */
  setBroadcaster(broadcaster: DashboardBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  /**
   * Set the running workflows tracker (shared with REST API)
   */
  setRunningWorkflowsTracker(tracker: RunningWorkflowsTracker): void {
    this.runningWorkflowsTracker = tracker;
  }

  /**
   * Reload workflows from disk (actions, workflows, templates, and skill packs)
   */
  reload(): void {
    this.actions = loadWorkflowsFromDir(this.actionsDir);
    this.workflows = loadWorkflowsFromDir(this.workflowsDir);
    this.templates = fs.existsSync(this.templatesDir)
      ? loadWorkflowsFromDir(this.templatesDir)
      : [];

    // Load workflows from installed skill packs: skills/<domain>/**/*.yaml
    const skillsDir = path.join(this.configDir, 'skills');
    if (fs.existsSync(skillsDir)) {
      try {
        for (const domain of fs.readdirSync(skillsDir)) {
          const domainDir = path.join(skillsDir, domain);
          if (!fs.statSync(domainDir).isDirectory()) continue;
          const skillWorkflows = loadWorkflowsRecursive(domainDir);
          this.workflows.push(...skillWorkflows);
        }
      } catch {
        // skip if skills dir unreadable
      }
    }

    // Load agent plugins from plugins/ directory
    const pluginsDir = path.join(this.configDir, 'plugins');
    this.plugins = loadPlugins(pluginsDir);
  }

  /**
   * Load settings from actions directory
   */
  private loadSettings(): Settings {
    const settingsPath = path.join(this.configDir, 'settings.json');
    const defaultSettings: Settings = {
      llm: { provider: 'openai', base_url: 'https://api.openai.com/v1', api_key: '', model: 'gpt-5.4-mini' },
      last_used_params: {},
      dashboard_shortcuts: [],
      user_contexts: [],
    };

    try {
      if (fs.existsSync(settingsPath)) {
        // Substitute environment variables
        const rawContent = fs.readFileSync(settingsPath, 'utf-8');
        const content = rawContent.replace(/\$\{([^}]+)\}/g, (_, varName) => process.env[varName] ?? '');
        const settings = JSON.parse(content) as Settings;
        return {
          llm: settings.llm ?? defaultSettings.llm,
          last_used_params: settings.last_used_params ?? {},
          dashboard_shortcuts: settings.dashboard_shortcuts ?? [],
          user_contexts: settings.user_contexts ?? [],
          reporting: settings.reporting,
          skill_registries: settings.skill_registries,
        };
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
    return defaultSettings;
  }

  /**
   * Get all workflows (actions + published workflows)
   */
  getAllWorkflows(): Workflow[] {
    return [...this.actions, ...this.workflows];
  }

  /**
   * Get only user actions (from actionsDir)
   */
  getAllActions(): Workflow[] {
    return this.actions;
  }

  /**
   * Find a workflow by ID (searches both actions and workflows)
   */
  findWorkflow(id: string): Workflow | undefined {
    return this.actions.find((a) => a.id === id) ??
      this.workflows.find((w) => w.id === id);
  }

  /**
   * Find an action by ID (only searches actions)
   */
  findAction(id: string): Workflow | undefined {
    return this.actions.find((a) => a.id === id);
  }

  /**
   * Get all templates (from templatesDir)
   */
  getTemplates(): Workflow[] {
    return this.templates;
  }

  /**
   * Find a template by ID
   */
  findTemplate(id: string): Workflow | undefined {
    return this.templates.find((t) => t.id === id);
  }

  /**
   * Get templates directory path
   */
  getTemplatesDir(): string {
    return this.templatesDir;
  }

  /**
   * Get actions directory path
   */
  getActionsDir(): string {
    return this.actionsDir;
  }

  /**
   * Handle an HTTP MCP request
   */
  async handleRequest(body: string): Promise<string> {
    let request: JsonRpcRequest;

    try {
      request = JSON.parse(body);
    } catch {
      return JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      });
    }

    const response = await this.processRequest(request);
    return JSON.stringify(response);
  }

  private async processRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      const result = await this.dispatch(request.method, request.params);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32000, message },
      };
    }
  }

  private async dispatch(
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    // Log all MCP method calls to stderr (avoid polluting stdout in stdio mode)
    if (method === 'initialize') {
      process.stderr.write('[MCP] Client initializing...\n');
    } else if (method === 'notifications/initialized') {
      process.stderr.write('[MCP] Client initialized successfully\n');
    } else if (method === 'tools/list') {
      process.stderr.write('[MCP] Client requesting tools list\n');
    } else if (method === 'tools/call') {
      const toolName = params?.name as string;
      const toolArgs = params?.arguments as Record<string, unknown> | undefined;
      process.stderr.write(`[MCP] Tool call: ${toolName} ${toolArgs ? JSON.stringify(toolArgs).slice(0, 200) : ''}\n`);
    } else if (method === 'resources/list') {
      process.stderr.write('[MCP] Client requesting resources list\n');
    } else if (method === 'resources/read') {
      process.stderr.write(`[MCP] Client reading resource: ${params?.uri}\n`);
    } else if (method === 'notifications/cancelled') {
      // Client cancelled a request - this is normal, don't log as unknown
    } else if (method.startsWith('notifications/')) {
      process.stderr.write(`[MCP] Unhandled notification: ${method}\n`);
    } else {
      process.stderr.write(`[MCP] Unknown method: ${method}\n`);
    }

    switch (method) {
      case 'initialize':
        return this.handleInitialize(params);
      case 'notifications/initialized':
      case 'notifications/cancelled':
        // Notifications don't need a response
        return {};
      case 'tools/list':
        return { tools: [...MCP_TOOLS, ...this.getPluginMcpTools()] };
      case 'tools/call':
        return this.handleToolsCall(params);
      case 'resources/list':
        return this.handleResourcesList();
      case 'resources/read':
        return this.handleResourcesRead(params);
      default:
        throw new Error(`Method not found: ${method}`);
    }
  }

  // Supported MCP protocol versions (newest first)
  private static SUPPORTED_VERSIONS = ['2025-11-25', '2025-03-26', '2024-11-05'];

  private handleInitialize(params?: Record<string, unknown>): unknown {
    const clientVersion = (params?.protocolVersion as string) || '2024-11-05';

    // Version negotiation per spec:
    // - If server supports client version, respond with same version
    // - Otherwise, respond with latest version server supports
    const negotiatedVersion = McpHandler.SUPPORTED_VERSIONS.includes(clientVersion)
      ? clientVersion
      : McpHandler.SUPPORTED_VERSIONS[0];

    return {
      protocolVersion: negotiatedVersion,
      capabilities: {
        tools: {
          listChanged: false,
        },
        resources: {
          subscribe: false,
          listChanged: false,
        },
      },
      serverInfo: {
        name: 'sidebutton',
        version: VERSION,
      },
      instructions: this.buildInstructions(),
    };
  }

  private async handleToolsCall(params?: Record<string, unknown>): Promise<unknown> {
    const name = params?.name as string;
    const args = (params?.arguments as Record<string, unknown>) ?? {};

    switch (name) {
      case 'run_workflow':
        return this.toolRunWorkflow(args);
      case 'get_run_log':
        return this.toolGetRunLog(args);
      case 'list_workflows':
        return this.toolListWorkflows(args);
      case 'get_workflow':
        return this.toolGetWorkflow(args);
      case 'list_run_logs':
        return this.toolListRunLogs(args);
      case 'get_browser_status':
        return this.toolGetBrowserStatus();
      case 'capture_page':
        return this.toolCapturePage();
      case 'navigate':
        return this.toolNavigate(args);
      case 'snapshot':
        return this.toolSnapshot(args);
      case 'click':
        return this.toolClick(args);
      case 'type':
        return this.toolType(args);
      case 'press_key':
        return this.toolPressKey(args);
      case 'scroll':
        return this.toolScroll(args);
      case 'select_option':
        return this.toolSelectOption(args);
      case 'extract':
        return this.toolExtract(args);
      case 'screenshot':
        return this.toolScreenshot(args);
      case 'fill':
        return this.toolFill(args);
      case 'wait':
        return this.toolWait(args);
      case 'exists':
        return this.toolExists(args);
      case 'extract_all':
        return this.toolExtractAll(args);
      case 'extract_map':
        return this.toolExtractMap(args);
      case 'scroll_into_view':
        return this.toolScrollIntoView(args);
      case 'hover':
        return this.toolHover(args);
      case 'evaluate':
        return this.toolEvaluate(args);
      default: {
        // Check plugin tools before throwing
        const pluginMatch = this.findPluginTool(name);
        if (pluginMatch) {
          return executePluginTool(pluginMatch.plugin, pluginMatch.tool, args);
        }
        throw new Error(`Tool not found: ${name}`);
      }
    }
  }

  /**
   * Build MCP tool definitions from loaded plugins, prefixing descriptions
   * with [plugin: name] for discoverability.
   */
  private getPluginMcpTools(): McpTool[] {
    const tools: McpTool[] = [];
    for (const plugin of this.plugins) {
      for (const tool of plugin.manifest.tools) {
        tools.push({
          name: tool.name,
          description: `[plugin: ${plugin.manifest.name}] ${tool.description}`,
          inputSchema: tool.inputSchema,
        });
      }
    }
    return tools;
  }

  /**
   * Find which plugin owns a given tool name.
   */
  private findPluginTool(name: string): { plugin: LoadedPlugin; tool: PluginToolDefinition } | null {
    for (const plugin of this.plugins) {
      const tool = plugin.manifest.tools.find((t) => t.name === name);
      if (tool) return { plugin, tool };
    }
    return null;
  }

  private async toolRunWorkflow(args: Record<string, unknown>): Promise<unknown> {
    const workflowId = args.workflow_id as string;
    const params = (args.params as Record<string, string>) ?? {};

    this.reload();

    const workflow = this.findWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Check browser connection for browser workflows
    const hasBrowserSteps = workflow.steps.some((s) =>
      s.type.startsWith('browser.')
    );

    if (hasBrowserSteps && !(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected - please connect the browser extension first');
    }

    // Execute workflow
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const runId = `${workflowId}_${timestamp.replace(/[:.]/g, '').slice(0, 15)}`;

    // Load settings for LLM config and user contexts
    const settings = this.loadSettings();

    const ctx = new ExecutionContext(runId);
    ctx.params = params;
    ctx.extensionClient = this.extensionClient;
    ctx.actionsRegistry = this.actions;
    ctx.workflowsRegistry = this.workflows;
    ctx.llmConfig = settings.llm;
    ctx.repos = settings.repos ?? {};

    // Inject env-type user contexts as envVars (for platform providers)
    for (const uc of settings.user_contexts ?? []) {
      if (uc.type === 'env') {
        ctx.envVars[uc.name] = uc.value;
      }
    }

    // Filter user contexts by type and domain match
    const pageUrl = params.page_url;
    const requestDomain = extractDomain(pageUrl);
    ctx.userContexts = settings.user_contexts
      ?.filter(uc => uc.type === 'llm')
      .filter(uc => {
        if (!uc.domain) return true; // No domain = applies everywhere
        if (!requestDomain) return true; // No URL = include all
        return requestDomain === uc.domain || requestDomain.endsWith('.' + uc.domain);
      })
      .map(uc => uc.context) ?? [];

    // Inject persona, enabled roles, and matching targets
    const contextConfig = loadContextAll(this.configDir, ctx.envVars, settings.provider_connectors);

    if (contextConfig.persona.body.trim()) {
      ctx.userContexts.unshift(`[Persona]\n${contextConfig.persona.body}`);
    }

    for (const role of contextConfig.roles) {
      if (role.enabled !== false && role.body.trim()) {
        ctx.userContexts.push(`[Role: ${role.name}]\n${role.body}`);
      }
    }

    const categoryDomain = workflow?.category?.domain;
    for (const target of contextConfig.targets) {
      if (target.filename === '_system.md') continue;
      if (target.enabled === false) continue;
      if (!target.body.trim()) continue;

      if (target.match.length > 0) {
        if (!matchTarget(target.match, requestDomain, workflowId, categoryDomain)) continue;
      }

      ctx.userContexts.push(`[Target: ${target.name}]\n${target.body}`);
    }

    // Track as running (shared tracker broadcasts automatically)
    if (this.runningWorkflowsTracker) {
      this.runningWorkflowsTracker.add(runId, workflowId, workflow.title, params, ctx);
    }

    let status: 'success' | 'failed' | 'cancelled' = 'success';

    try {
      await executeWorkflow(workflow, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('cancelled')) {
        status = 'cancelled';
      } else {
        status = 'failed';
      }
    }

    // Remove from running (shared tracker broadcasts automatically)
    if (this.runningWorkflowsTracker) {
      this.runningWorkflowsTracker.remove(runId);
    }

    const durationMs = Date.now() - startTime;

    // Save run log
    const runLog: RunLog = {
      metadata: {
        id: runId,
        workflow_id: workflowId,
        workflow_title: workflow.title,
        timestamp,
        status,
        duration_ms: durationMs,
        event_count: ctx.capturedEvents.length,
        triggered_by: 'mcp',
      },
      events: ctx.capturedEvents,
      params,
      output_message: ctx.outputMessage,
    };

    this.saveRunLog(runLog);

    let responseText: string;
    if (status === 'failed') {
      // Look for error message in workflow_end or step_end events
      const endEvents = ctx.capturedEvents.filter(
        (e): e is Extract<typeof e, { type: 'workflow_end' | 'step_end' }> =>
          (e.type === 'workflow_end' || e.type === 'step_end') && !e.success && !!e.message
      );
      const lastEndEvent = endEvents.pop();
      const errorDetail = lastEndEvent?.message ?? 'Unknown error';
      responseText = `Workflow '${workflowId}' failed.\n\nError: ${errorDetail}\n\nRun ID: ${runId}`;
    } else if (status === 'cancelled') {
      responseText = `Workflow '${workflowId}' was cancelled.\n\nRun ID: ${runId}`;
    } else {
      responseText = ctx.outputMessage ??
        `Workflow '${workflowId}' completed successfully.\n\nRun ID: ${runId}`;
    }

    return {
      content: [{ type: 'text', text: responseText }],
    };
  }

  private saveRunLog(runLog: RunLog): void {
    if (!fs.existsSync(this.runLogsDir)) {
      fs.mkdirSync(this.runLogsDir, { recursive: true });
    }
    const filePath = path.join(this.runLogsDir, `${runLog.metadata.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(runLog, null, 2));

    // Send anonymous run report (fire-and-forget)
    reportRunLog(runLog, this.loadSettings().reporting);
  }

  private async toolGetRunLog(args: Record<string, unknown>): Promise<unknown> {
    const runId = args.run_id as string;
    const filePath = path.join(this.runLogsDir, `${runId}.json`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Run log not found: ${runId}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.trim()) {
      throw new Error(`Run log is empty or corrupted: ${runId}`);
    }

    let runLog: RunLog;
    try {
      runLog = JSON.parse(content) as RunLog;
    } catch {
      throw new Error(`Run log is corrupted (invalid JSON): ${runId}`);
    }

    let output = `# Run Log: ${runLog.metadata.id}\n\n`;
    output += `**Workflow:** ${runLog.metadata.workflow_title} (${runLog.metadata.workflow_id})\n`;
    output += `**Status:** ${runLog.metadata.status.toUpperCase()}\n`;
    output += `**Duration:** ${runLog.metadata.duration_ms}ms\n`;
    output += `**Timestamp:** ${runLog.metadata.timestamp}\n\n`;

    output += '## Events\n\n';
    for (const event of runLog.events) {
      if (event.type === 'workflow_start') {
        output += `[START] ${event.action_title} (${event.action_id})\n`;
      } else if (event.type === 'workflow_end') {
        output += `[END] ${event.action_id} - ${event.success ? 'OK' : 'FAILED'}\n`;
      } else if (event.type === 'step_start') {
        output += `  [${event.step_index + 1}] ${event.step_type} ${event.step_details ?? ''}\n`;
      } else if (event.type === 'step_end' && event.result) {
        output += `  [${event.step_index + 1}] -> ${event.result.slice(0, 100)}\n`;
      } else if (event.type === 'log') {
        output += `  [${event.level.toUpperCase()}] ${event.message}\n`;
      }
    }

    return { content: [{ type: 'text', text: output }] };
  }

  private async toolListWorkflows(args: Record<string, unknown>): Promise<unknown> {
    const source = (args.source as string) ?? 'all';
    this.reload();

    let workflows: Array<{ workflow: Workflow; source: string }> = [];

    if (source === 'all' || source === 'actions') {
      workflows.push(...this.actions.map((w) => ({ workflow: w, source: 'actions' })));
    }
    if (source === 'all' || source === 'workflows') {
      workflows.push(...this.workflows.map((w) => ({ workflow: w, source: 'workflows' })));
    }

    let output = `# Available Workflows (${workflows.length})\n\n`;
    for (const { workflow, source: src } of workflows) {
      output += `## ${workflow.title}\n`;
      output += `- **ID:** \`${workflow.id}\`\n`;
      output += `- **Source:** ${src}\n`;
      if (workflow.params && Object.keys(workflow.params).length > 0) {
        output += '- **Parameters:**\n';
        for (const [name, type] of Object.entries(workflow.params)) {
          output += `  - \`${name}\`: ${type}\n`;
        }
      }
      output += '\n';
    }

    return { content: [{ type: 'text', text: output }] };
  }

  private async toolGetWorkflow(args: Record<string, unknown>): Promise<unknown> {
    const workflowId = args.workflow_id as string;
    const workflow = this.findWorkflow(workflowId);

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const yamlStr = yaml.dump(workflow);
    return {
      content: [{ type: 'text', text: `# Workflow: ${workflow.title}\n\n\`\`\`yaml\n${yamlStr}\n\`\`\`` }],
    };
  }

  private async toolListRunLogs(args: Record<string, unknown>): Promise<unknown> {
    const limit = (args.limit as number) ?? 20;
    const filterWorkflow = args.workflow_id as string | undefined;

    if (!fs.existsSync(this.runLogsDir)) {
      return { content: [{ type: 'text', text: 'No run logs found.' }] };
    }

    const logs: RunLogMetadata[] = [];

    for (const file of fs.readdirSync(this.runLogsDir)) {
      if (!file.endsWith('.json')) continue;

      try {
        const content = fs.readFileSync(path.join(this.runLogsDir, file), 'utf-8');
        const log = JSON.parse(content) as RunLog;

        if (filterWorkflow && log.metadata.workflow_id !== filterWorkflow) {
          continue;
        }

        logs.push(log.metadata);
      } catch {
        // Skip invalid files
      }
    }

    logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    logs.splice(limit);

    let output = `# Recent Run Logs (${logs.length})\n\n`;
    output += '| Run ID | Workflow | Status | Duration | Time |\n';
    output += '|--------|----------|--------|----------|------|\n';

    for (const log of logs) {
      output += `| ${log.id} | ${log.workflow_id} | ${log.status} | ${log.duration_ms}ms | ${log.timestamp} |\n`;
    }

    return { content: [{ type: 'text', text: output }] };
  }

  private async toolGetBrowserStatus(): Promise<unknown> {
    const status = this.extensionClient.getStatus();
    const output = `# Browser Status\n\n` +
      `- **Server Running:** ${status.server_running}\n` +
      `- **Browser Connected:** ${status.browser_connected}\n` +
      `- **Tab ID:** ${status.tab_id ?? 'None'}\n` +
      `- **Recording:** ${status.recording}`;

    return { content: [{ type: 'text', text: output }] };
  }

  private async toolCapturePage(): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const result = await this.extensionClient.captureSelectors();
    const url = result.url as string ?? 'unknown';
    const title = result.title as string ?? 'unknown';

    let output = `# Page Capture: ${title}\n\n**URL:** ${url}\n\n`;
    output += JSON.stringify(result, null, 2);

    return { content: [{ type: 'text', text: output }] };
  }

  private async toolNavigate(args: Record<string, unknown>): Promise<unknown> {
    const url = args.url as string;

    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    await this.extensionClient.navigate(url);
    return { content: [{ type: 'text', text: `Navigated to: ${url}` }] };
  }

  private async toolSnapshot(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const includeContent = (args.includeContent as boolean) ?? false;
    const snapshot = await this.extensionClient.ariaSnapshot({ includeContent });
    return { content: [{ type: 'text', text: snapshot }] };
  }

  private async toolClick(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const selector = args.selector as string | undefined;
    const ref = args.ref as number | undefined;
    const element = args.element as string | undefined;

    if (ref !== undefined) {
      await this.extensionClient.clickRef(ref);
      const desc = element ? `"${element}"` : `ref=${ref}`;
      return { content: [{ type: 'text', text: `Clicked: ${desc}` }] };
    } else if (selector) {
      await this.extensionClient.click(selector);
      const desc = element ? `"${element}"` : selector;
      return { content: [{ type: 'text', text: `Clicked: ${desc}` }] };
    } else {
      throw new Error('Either selector or ref must be provided');
    }
  }

  private async toolType(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const selector = args.selector as string | undefined;
    const ref = args.ref as number | undefined;
    const text = args.text as string;
    const submit = (args.submit as boolean) ?? false;
    const element = args.element as string | undefined;

    if (ref !== undefined) {
      await this.extensionClient.typeRef(ref, text, submit);
      const desc = element ? `"${element}"` : `ref=${ref}`;
      return { content: [{ type: 'text', text: `Typed "${text}" into ${desc}` }] };
    } else if (selector) {
      await this.extensionClient.typeText(selector, text, submit);
      const desc = element ? `"${element}"` : selector;
      return { content: [{ type: 'text', text: `Typed "${text}" into ${desc}` }] };
    } else {
      throw new Error('Either selector or ref must be provided');
    }
  }

  private async toolPressKey(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const key = args.key as string;
    if (!key) {
      throw new Error('key parameter is required');
    }

    const selector = args.selector as string | undefined;
    const ref = args.ref as number | undefined;

    // If ref provided, click it first to focus (same pattern as typeRef)
    if (ref !== undefined) {
      await this.extensionClient.clickRef(ref);
      await new Promise(r => setTimeout(r, 100));
    }

    await this.extensionClient.pressKey(key, ref !== undefined ? undefined : selector);
    return { content: [{ type: 'text', text: `Pressed key: ${key}` }] };
  }

  private async toolScroll(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const direction = args.direction as string;
    const amount = (args.amount as number) ?? 300;

    await this.extensionClient.scroll(direction, amount);
    return { content: [{ type: 'text', text: `Scrolled ${direction} by ${amount}px` }] };
  }

  private async toolSelectOption(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const selector = args.selector as string | undefined;
    const ref = args.ref as number | undefined;
    const value = args.value as string | undefined;
    const label = args.label as string | undefined;
    const element = args.element as string | undefined;

    if (!selector && ref === undefined) {
      throw new Error('Either selector or ref must be provided');
    }
    if (value === undefined && label === undefined) {
      throw new Error('Either value or label must be provided');
    }

    const selected = await this.extensionClient.selectOption(selector, ref, value, label);
    const desc = element ? `"${element}"` : (selector ?? `ref=${ref}`);
    return { content: [{ type: 'text', text: `Selected "${selected}" in ${desc}` }] };
  }

  private async toolExtract(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const selector = args.selector as string;
    const text = await this.extensionClient.extract(selector);
    return { content: [{ type: 'text', text }] };
  }

  private async toolScreenshot(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const ref = args.ref as number | undefined;
    const selector = args.selector as string | undefined;
    const region = args.region as { x: number; y: number; width: number; height: number } | undefined;

    const imageData = await this.extensionClient.screenshot({ ref, selector, region });
    return {
      content: [{
        type: 'image',
        data: imageData.replace(/^data:image\/png;base64,/, ''),
        mimeType: 'image/png',
      }],
    };
  }

  private async toolFill(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const selector = args.selector as string;
    const value = args.value as string;
    if (!selector) throw new Error('selector parameter is required');
    if (value === undefined) throw new Error('value parameter is required');

    await this.extensionClient.fill(selector, value);
    return { content: [{ type: 'text', text: `Filled "${selector}" with "${value}"` }] };
  }

  private async toolWait(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const selector = args.selector as string;
    const timeout = (args.timeout as number) ?? 5000;
    if (!selector) throw new Error('selector parameter is required');

    await this.extensionClient.waitForElement(selector, timeout);
    return { content: [{ type: 'text', text: `Element found: ${selector}` }] };
  }

  private async toolExists(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const selector = args.selector as string;
    const timeout = (args.timeout as number) ?? 2000;
    if (!selector) throw new Error('selector parameter is required');

    const found = await this.extensionClient.exists(selector, timeout);
    return { content: [{ type: 'text', text: JSON.stringify({ exists: found, selector }) }] };
  }

  private async toolExtractAll(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const selector = args.selector as string;
    const separator = (args.separator as string) ?? '\n';
    const attribute = args.attribute as string | undefined;
    if (!selector) throw new Error('selector parameter is required');

    const text = await this.extensionClient.extractAll(selector, separator, attribute);
    return { content: [{ type: 'text', text }] };
  }

  private async toolExtractMap(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const selector = args.selector as string;
    const fields = args.fields as Record<string, { selector: string; attribute?: string }>;
    if (!selector) throw new Error('selector parameter is required');
    if (!fields) throw new Error('fields parameter is required');

    const text = await this.extensionClient.extractMap(selector, fields);
    return { content: [{ type: 'text', text }] };
  }

  private async toolScrollIntoView(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const selector = args.selector as string;
    const block = args.block as string | undefined;
    if (!selector) throw new Error('selector parameter is required');

    await this.extensionClient.scrollIntoView(selector, block);
    return { content: [{ type: 'text', text: `Scrolled into view: ${selector}` }] };
  }

  private async toolHover(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const selector = args.selector as string;
    await this.extensionClient.hover(selector);
    return { content: [{ type: 'text', text: `Hovered over: ${selector}` }] };
  }

  private async toolEvaluate(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const js = args.js as string;
    if (!js) {
      throw new Error('js parameter is required');
    }

    const response = await this.extensionClient.injectJS(js);

    if (response.error) {
      return { content: [{ type: 'text', text: `Error: ${response.error}` }] };
    }

    const result = response.result;
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return { content: [{ type: 'text', text: text ?? 'undefined' }] };
  }

  /**
   * Build dynamic instructions for the MCP initialize response.
   * Scans installed skill packs and enumerates modules/roles.
   */
  private buildInstructions(): string {
    const lines: string[] = [];
    lines.push('# SideButton — Workflow Automation MCP Server');
    lines.push('');
    lines.push('## Skill Packs (Domain Knowledge)');
    lines.push('');
    lines.push('SideButton bundles domain knowledge as MCP resources with skill:// URIs.');
    lines.push('Before working with a domain or module, load the relevant skills.');
    lines.push('');
    lines.push('### How to Load Skills');
    lines.push('');
    lines.push('1. List available skill resources using MCP resources/list');
    lines.push('2. Read a skill using MCP resources/read with its skill:// URI');
    lines.push('');
    lines.push('Each module has two key resources:');
    lines.push('- **_skill.md** — Domain knowledge: UI selectors, data model, states, common tasks, gotchas');
    lines.push('- **<role>.md** — Role instructions (e.g., qa.md = QA test playbook with test sequences and verification criteria)');
    lines.push('');

    // Dynamically scan installed skill packs
    const skillsDir = path.join(this.configDir, 'skills');
    if (fs.existsSync(skillsDir)) {
      try {
        const domains = fs.readdirSync(skillsDir).filter(d => {
          const fullPath = path.join(skillsDir, d);
          return fs.statSync(fullPath).isDirectory();
        });

        if (domains.length > 0) {
          lines.push('### Installed Skill Packs');
          lines.push('');

          for (const domain of domains) {
            const domainDir = path.join(skillsDir, domain);
            const modules: string[] = [];
            const rootRoles: string[] = [];

            // Find modules (subdirectories containing _skill.md)
            try {
              for (const entry of fs.readdirSync(domainDir, { withFileTypes: true })) {
                if (!entry.isDirectory()) continue;
                if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
                const skillFile = path.join(domainDir, entry.name, '_skill.md');
                if (fs.existsSync(skillFile)) {
                  modules.push(entry.name);
                }
              }
            } catch { /* skip */ }

            // Find root-level roles
            const rolesDir = path.join(domainDir, '_roles');
            if (fs.existsSync(rolesDir)) {
              try {
                for (const entry of fs.readdirSync(rolesDir)) {
                  if (entry.endsWith('.md')) {
                    rootRoles.push(entry.replace('.md', ''));
                  }
                }
              } catch { /* skip */ }
            }

            const hasRootSkill = fs.existsSync(path.join(domainDir, '_skill.md'));

            lines.push(`**${domain}** (${modules.length} modules):`);
            if (modules.length > 0) {
              lines.push(`  ${modules.join(', ')}`);
            }
            if (hasRootSkill) {
              lines.push(`  Root skill: skill://${domain}/_skill.md`);
            }
            if (rootRoles.length > 0) {
              lines.push(`  Global roles: ${rootRoles.map(r => `skill://${domain}/${r}.md`).join(', ')}`);
            }
            lines.push('');

            // Example for first domain
            if (domains.indexOf(domain) === 0 && modules.length > 0) {
              const exampleModule = modules[0];
              lines.push('Example — to load skills for a module:');
              lines.push(`  Read resource: skill://${domain}/${exampleModule}/_skill.md`);
              lines.push(`  Read resource: skill://${domain}/${exampleModule}/qa.md`);
              lines.push('');
            }
          }
        }
      } catch { /* skip */ }
    }

    lines.push('## Workflows (Already Available as Tool Calls)');
    lines.push('');
    lines.push('Workflows are exposed as MCP tools — they are already callable directly:');
    lines.push('- list_workflows — discover available workflows with IDs and required parameters');
    lines.push('- run_workflow — execute a workflow by ID with params, returns a run_id');
    lines.push('- get_run_log — get detailed execution results using the run_id');
    lines.push('');
    lines.push('workflow:// resources exist for reference only (YAML source code).');
    lines.push('To execute a workflow, always use the run_workflow tool — not resources/read.');
    lines.push('');
    lines.push('## Browser Tools');
    lines.push('');
    lines.push('- Check get_browser_status before using any browser tool');
    lines.push('- **snapshot is your primary tool** — `snapshot(includeContent=true)` returns the FULL page content as markdown + complete accessibility tree with element refs. One call, no scrolling needed. Use this for all content discovery, element mapping, and ref gathering.');
    lines.push('- **screenshot is a secondary tool** — only use for: (1) visual verification of CSS states (colors, animations, visibility), (2) evidence collection (before/after for QA), (3) first-visit layout baseline when you need to see visual design. Never use screenshot to "read" page content — snapshot already has it.');
    lines.push('- **press_key** sends native keyboard events — use for Tab navigation (e.g., between iframe fields), keyboard shortcuts, and form submission');
    lines.push('- **fill** sets input values programmatically with React/Vue/Angular event dispatch — use when **type** (keystroke simulation) doesn\'t trigger framework change handlers');
    lines.push('- **wait** and **exists** check for element presence — use `wait` to block until an element appears, `exists` for non-throwing boolean checks');
    lines.push('- **extract_all** and **extract_map** extract bulk/structured data — use for lists, tables, and repeated elements');
    lines.push('- **scroll_into_view** scrolls a specific element into the viewport — more precise than generic `scroll`');
    lines.push('- Always take a fresh snapshot after any action that modifies the page — refs change on re-render');
    lines.push('');
    lines.push('### Screenshot Cropping (when you DO use screenshot)');
    lines.push('');
    lines.push('ALWAYS pass one of these params to crop instead of capturing the full viewport:');
    lines.push('- `ref` — element ref from snapshot. **Best option**: no coordinate math needed.');
    lines.push('- `selector` — CSS selector (e.g., `{"selector": "main"}`). Good for page sections.');
    lines.push('- `region` — manual rect. Use to skip repeated chrome (sidebars, headers).');
    lines.push('- No params = full viewport. **Only acceptable for first visit to a new page**.');

    return lines.join('\n');
  }

  private handleResourcesList(): unknown {
    const resources = [];

    for (const action of this.actions) {
      resources.push({
        uri: `workflow://${action.id}`,
        name: action.title,
        description: `Executable workflow '${action.title}' — already callable as a tool via run_workflow(workflow_id='${action.id}'). This resource contains YAML source for reference only.`,
        mimeType: 'application/x-yaml',
      });
    }

    for (const workflow of this.workflows) {
      resources.push({
        uri: `workflow://${workflow.id}`,
        name: workflow.title,
        description: `Executable workflow '${workflow.title}' — already callable as a tool via run_workflow(workflow_id='${workflow.id}'). This resource contains YAML source for reference only.`,
        mimeType: 'application/x-yaml',
      });
    }

    // Add skill resources (targets and roles from skill packs)
    const targets = loadTargets(this.configDir);
    for (const target of targets) {
      if (!target.filename.startsWith('skill:')) continue;
      if (target.enabled === false) continue;
      const resourcePath = target.filename.slice('skill:'.length);
      resources.push({
        uri: `skill://${resourcePath}`,
        name: target.name,
        description: `Domain knowledge for ${target.name} — contains UI selectors, data model, states, and gotchas. Read this resource before interacting with the module.`,
        mimeType: 'text/markdown',
      });
    }

    const roles = loadRoles(this.configDir);
    for (const role of roles) {
      if (!role.filename.startsWith('skill:')) continue;
      if (role.enabled === false) continue;
      const resourcePath = role.filename.slice('skill:'.length);
      resources.push({
        uri: `skill://${resourcePath}`,
        name: role.name,
        description: `Agent role: ${role.name} — contains role-specific instructions, test sequences, and verification criteria. Read this resource to understand how to perform the role.`,
        mimeType: 'text/markdown',
      });
    }

    return { resources };
  }

  private handleResourcesRead(params?: Record<string, unknown>): unknown {
    const uri = params?.uri as string;
    if (!uri) {
      throw new Error('Missing uri parameter');
    }

    // Handle skill:// resources
    if (uri.startsWith('skill://')) {
      const skillFilename = 'skill:' + uri.slice('skill://'.length);

      const targets = loadTargets(this.configDir);
      const target = targets.find(t => t.filename === skillFilename);
      if (target) {
        return {
          contents: [{ uri, mimeType: 'text/markdown', text: target.body }],
        };
      }

      const roles = loadRoles(this.configDir);
      const role = roles.find(r => r.filename === skillFilename);
      if (role) {
        return {
          contents: [{ uri, mimeType: 'text/markdown', text: role.body }],
        };
      }

      throw new Error(`Skill resource not found: ${uri}`);
    }

    // Handle workflow:// resources
    const workflowId = uri.replace('workflow://', '');

    const workflow = this.findWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const yamlStr = yaml.dump(workflow);
    return {
      contents: [{
        uri,
        mimeType: 'application/x-yaml',
        text: yamlStr,
      }],
    };
  }
}
