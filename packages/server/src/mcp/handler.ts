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
} from '@sidebutton/core';
import type { ExtensionClientImpl } from '../extension.js';
import { MCP_TOOLS } from './tools.js';

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
  private extensionClient: ExtensionClientImpl;
  private actions: Workflow[] = [];
  private workflows: Workflow[] = [];
  private templates: Workflow[] = [];
  private broadcaster: DashboardBroadcaster | null = null;
  private runningWorkflowsTracker: RunningWorkflowsTracker | null = null;

  constructor(
    actionsDir: string,
    workflowsDir: string,
    templatesDir: string,
    runLogsDir: string,
    extensionClient: ExtensionClientImpl
  ) {
    this.actionsDir = actionsDir;
    this.workflowsDir = workflowsDir;
    this.templatesDir = templatesDir;
    this.runLogsDir = runLogsDir;
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
   * Reload workflows from disk
   */
  reload(): void {
    this.actions = loadWorkflowsFromDir(this.actionsDir);
    this.workflows = loadWorkflowsFromDir(this.workflowsDir);
    this.templates = fs.existsSync(this.templatesDir)
      ? loadWorkflowsFromDir(this.templatesDir)
      : [];
  }

  /**
   * Load settings from actions directory
   */
  private loadSettings(): Settings {
    const settingsPath = path.join(this.actionsDir, 'settings.json');
    const defaultSettings: Settings = {
      llm: { provider: 'openai', base_url: 'https://api.openai.com/v1', api_key: '', model: 'gpt-4o' },
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
    // Log all MCP method calls
    if (method === 'initialize') {
      console.log('[MCP] Client initializing...');
    } else if (method === 'notifications/initialized') {
      console.log('[MCP] Client initialized successfully');
    } else if (method === 'tools/list') {
      console.log('[MCP] Client requesting tools list');
    } else if (method === 'tools/call') {
      const toolName = params?.name as string;
      const toolArgs = params?.arguments as Record<string, unknown> | undefined;
      console.log(`[MCP] Tool call: ${toolName}`, toolArgs ? JSON.stringify(toolArgs).slice(0, 200) : '');
    } else if (method === 'resources/list') {
      console.log('[MCP] Client requesting resources list');
    } else if (method === 'resources/read') {
      console.log('[MCP] Client reading resource:', params?.uri);
    } else if (method === 'notifications/cancelled') {
      // Client cancelled a request - this is normal, don't log as unknown
    } else if (method.startsWith('notifications/')) {
      console.error(`[MCP] Unhandled notification: ${method}`);
    } else {
      console.log(`[MCP] Unknown method: ${method}`);
    }

    switch (method) {
      case 'initialize':
        return this.handleInitialize(params);
      case 'notifications/initialized':
      case 'notifications/cancelled':
        // Notifications don't need a response
        return {};
      case 'tools/list':
        return { tools: MCP_TOOLS };
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
        version: '1.0.0',
      },
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
      case 'scroll':
        return this.toolScroll(args);
      case 'extract':
        return this.toolExtract(args);
      case 'screenshot':
        return this.toolScreenshot();
      case 'hover':
        return this.toolHover(args);
      default:
        throw new Error(`Tool not found: ${name}`);
    }
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
    ctx.userContexts = settings.user_contexts
      ?.filter(uc => uc.type === 'llm')
      .map(uc => uc.context) ?? [];

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
  }

  private async toolGetRunLog(args: Record<string, unknown>): Promise<unknown> {
    const runId = args.run_id as string;
    const filePath = path.join(this.runLogsDir, `${runId}.json`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Run log not found: ${runId}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const runLog = JSON.parse(content) as RunLog;

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

  private async toolScroll(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const direction = args.direction as string;
    const amount = (args.amount as number) ?? 300;

    await this.extensionClient.scroll(direction, amount);
    return { content: [{ type: 'text', text: `Scrolled ${direction} by ${amount}px` }] };
  }

  private async toolExtract(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const selector = args.selector as string;
    const text = await this.extensionClient.extract(selector);
    return { content: [{ type: 'text', text }] };
  }

  private async toolScreenshot(): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const imageData = await this.extensionClient.screenshot();
    return {
      content: [{
        type: 'image',
        data: imageData.replace(/^data:image\/png;base64,/, ''),
        mimeType: 'image/png',
      }],
    };
  }

  private async toolHover(args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.extensionClient.isConnected())) {
      throw new Error('Browser not connected');
    }

    const selector = args.selector as string;
    await this.extensionClient.hover(selector);
    return { content: [{ type: 'text', text: `Hovered over: ${selector}` }] };
  }

  private handleResourcesList(): unknown {
    const resources = [];

    for (const action of this.actions) {
      resources.push({
        uri: `workflow://${action.id}`,
        name: action.title,
        description: `User action: ${action.id}`,
        mimeType: 'application/x-yaml',
      });
    }

    for (const workflow of this.workflows) {
      resources.push({
        uri: `workflow://${workflow.id}`,
        name: workflow.title,
        description: `Published workflow: ${workflow.id}`,
        mimeType: 'application/x-yaml',
      });
    }

    return { resources };
  }

  private handleResourcesRead(params?: Record<string, unknown>): unknown {
    const uri = params?.uri as string;
    const workflowId = uri?.replace('workflow://', '');

    if (!workflowId) {
      throw new Error(`Invalid URI: ${uri}`);
    }

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
