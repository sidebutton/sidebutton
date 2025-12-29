/**
 * Fastify HTTP + WebSocket server
 */

import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ExtensionClientImpl } from './extension.js';
import { McpHandler } from './mcp/handler.js';
import * as yaml from 'js-yaml';
import type { WebSocket } from 'ws';
import type {
  Settings,
  FullLlmConfig,
  Recording,
  RecordingMetadata,
  RecordingStatus,
  WorkflowStats,
  Workflow,
  Step,
  WorkflowEvent,
  RunningWorkflowInfo,
  RunLog,
  HealthResponse,
  WorkflowSummary,
  RunLogMetadata,
} from '@sidebutton/core';
import { ExecutionContext, executeWorkflow } from '@sidebutton/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// WebSocket Broadcast Manager (for dashboard clients)
// ============================================================================

class DashboardBroadcaster {
  private clients: Set<WebSocket> = new Set();

  addClient(socket: WebSocket): void {
    this.clients.add(socket);
    console.log(`Dashboard client connected (total: ${this.clients.size})`);

    socket.on('close', () => {
      this.clients.delete(socket);
      console.log(`Dashboard client disconnected (total: ${this.clients.size})`);
    });
  }

  broadcast(eventType: string, data: unknown): void {
    const message = JSON.stringify({ type: eventType, data });
    for (const client of this.clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    }
  }

  // Specific event broadcasts
  broadcastWorkflowEvent(event: WorkflowEvent, runId: string): void {
    this.broadcast('workflow-event', { ...event, run_id: runId });
  }

  broadcastRunningWorkflowsChanged(workflows: RunningWorkflowInfo[]): void {
    this.broadcast('running-workflows-changed', { workflows });
  }

  broadcastRecordingStatus(isRecording: boolean, eventCount: number): void {
    this.broadcast('recording-status', { is_recording: isRecording, event_count: eventCount });
  }

  broadcastExtensionStatus(connected: boolean): void {
    this.broadcast('extension-status', { connected });
  }
}

// ============================================================================
// Running Workflows Manager
// ============================================================================

class RunningWorkflowsManager {
  private running: Map<string, { info: RunningWorkflowInfo; context: ExecutionContext }> = new Map();
  private broadcaster: DashboardBroadcaster;

  constructor(broadcaster: DashboardBroadcaster) {
    this.broadcaster = broadcaster;
  }

  add(runId: string, workflowId: string, workflowTitle: string, params: Record<string, string>, context: ExecutionContext): void {
    const info: RunningWorkflowInfo = {
      run_id: runId,
      workflow_id: workflowId,
      workflow_title: workflowTitle,
      started_at: new Date().toISOString(),
      params,
    };
    this.running.set(runId, { info, context });
    this.broadcaster.broadcastRunningWorkflowsChanged(this.getAll());
  }

  remove(runId: string): void {
    this.running.delete(runId);
    this.broadcaster.broadcastRunningWorkflowsChanged(this.getAll());
  }

  cancel(runId: string): boolean {
    const entry = this.running.get(runId);
    if (entry) {
      entry.context.cancel();
      return true;
    }
    return false;
  }

  getAll(): RunningWorkflowInfo[] {
    return Array.from(this.running.values()).map(e => e.info);
  }

  get(runId: string): { info: RunningWorkflowInfo; context: ExecutionContext } | undefined {
    return this.running.get(runId);
  }
}

// ============================================================================
// Settings Service
// ============================================================================

function getDefaultSettings(): Settings {
  return {
    llm: {
      provider: 'openai',
      base_url: 'https://api.openai.com/v1',
      api_key: '',
      model: 'gpt-4o',
    },
    last_used_params: {},
    dashboard_shortcuts: [],
    user_contexts: [],
  };
}

/**
 * Substitute ${VAR_NAME} patterns with environment variables
 */
function substituteEnvVars(content: string): string {
  return content.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] ?? '';
  });
}

function loadSettings(actionsDir: string): Settings {
  const settingsPath = path.join(actionsDir, 'settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      const rawContent = fs.readFileSync(settingsPath, 'utf-8');
      const content = substituteEnvVars(rawContent);
      const settings = JSON.parse(content) as Settings;
      // Ensure all fields exist with defaults
      return {
        llm: settings.llm ?? getDefaultSettings().llm,
        last_used_params: settings.last_used_params ?? {},
        dashboard_shortcuts: settings.dashboard_shortcuts ?? [],
        user_contexts: settings.user_contexts ?? [],
      };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return getDefaultSettings();
}

function saveSettings(actionsDir: string, settings: Settings): void {
  const settingsPath = path.join(actionsDir, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// ============================================================================
// Recording Service
// ============================================================================

function getRecordingsDir(actionsDir: string): string {
  return path.join(actionsDir, 'recordings');
}

function listRecordings(actionsDir: string): RecordingMetadata[] {
  const recordingsDir = getRecordingsDir(actionsDir);
  if (!fs.existsSync(recordingsDir)) {
    return [];
  }

  const recordings: RecordingMetadata[] = [];
  for (const file of fs.readdirSync(recordingsDir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const filePath = path.join(recordingsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const recording = JSON.parse(content) as Recording;
      recordings.push({
        id: recording.id,
        timestamp: recording.timestamp,
        event_count: recording.events.length,
        path: filePath,
      });
    } catch {
      // Skip invalid files
    }
  }

  // Sort by timestamp, newest first
  recordings.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return recordings;
}

function loadRecording(actionsDir: string, recordingId: string): Recording | null {
  const filePath = path.join(getRecordingsDir(actionsDir), `${recordingId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as Recording;
    }
  } catch {
    // Return null on error
  }
  return null;
}

function saveRecording(actionsDir: string, recording: Recording): void {
  const recordingsDir = getRecordingsDir(actionsDir);
  if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
  }
  const filePath = path.join(recordingsDir, `${recording.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(recording, null, 2));
}

function deleteRecording(actionsDir: string, recordingId: string): boolean {
  const filePath = path.join(getRecordingsDir(actionsDir), `${recordingId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch {
    // Return false on error
  }
  return false;
}

// Convert recording to workflow (deterministic conversion)
function convertRecordingToWorkflow(recording: Recording): Workflow {
  const steps: Step[] = [];
  const allowedDomains: string[] = [];
  let initialUrl: string | undefined;
  let hasInitialNavigate = false;
  let extractCount = 0;

  // First pass: find the first navigate URL
  for (const event of recording.events) {
    if (event.event_type === 'navigate' && event.url) {
      initialUrl = event.url;
      break;
    }
  }

  // If first event is not navigate, add initial navigate
  if (recording.events.length > 0 && recording.events[0].event_type !== 'navigate' && initialUrl) {
    try {
      const url = new URL(initialUrl);
      if (!allowedDomains.includes(url.hostname)) {
        allowedDomains.push(url.hostname);
      }
    } catch {
      // Invalid URL
    }
    steps.push({ type: 'browser.navigate', url: initialUrl });
    hasInitialNavigate = true;
  }

  for (const event of recording.events) {
    switch (event.event_type) {
      case 'navigate':
        if (event.url) {
          // Skip if this is the same URL we already added
          if (hasInitialNavigate && event.url === initialUrl) {
            hasInitialNavigate = false;
            continue;
          }
          try {
            const url = new URL(event.url);
            if (!allowedDomains.includes(url.hostname)) {
              allowedDomains.push(url.hostname);
            }
          } catch {
            // Invalid URL
          }
          steps.push({ type: 'browser.navigate', url: event.url });
        }
        break;

      case 'click':
        if (event.selector) {
          steps.push({ type: 'browser.wait', selector: event.selector, timeout: 5000 });
          steps.push({ type: 'browser.click', selector: event.selector });
        }
        break;

      case 'input':
        if (event.selector && event.value) {
          steps.push({ type: 'browser.wait', selector: event.selector, timeout: 5000 });
          steps.push({ type: 'browser.type', selector: event.selector, text: event.value });
        }
        break;

      case 'scroll':
        steps.push({
          type: 'browser.scroll',
          direction: (event.direction as 'up' | 'down') ?? 'down',
          amount: event.amount ?? 300,
        });
        break;

      case 'extract':
        if (event.selector) {
          extractCount++;
          steps.push({ type: 'browser.wait', selector: event.selector, timeout: 5000 });
          steps.push({
            type: 'browser.extract',
            selector: event.selector,
            as: `extracted_${extractCount}`,
          });
        }
        break;
    }
  }

  const title = recording.id
    .replace('recording_', 'Recorded: ')
    .replace(/_/g, ' ')
    .replace(/-/g, ':');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const workflowId = `workflow_${timestamp}`;

  return {
    schema_version: 1,
    namespace: 'local',
    id: workflowId,
    title,
    policies: { allowed_domains: allowedDomains },
    steps,
  };
}

// ============================================================================
// LLM API Helper
// ============================================================================

async function callLlmApi(config: FullLlmConfig, prompt: string): Promise<string> {
  const { provider, base_url, api_key, model } = config;

  if (provider === 'openai' || provider === 'ollama') {
    // OpenAI-compatible API (works for OpenAI, Ollama, and compatible providers)
    const response = await fetch(`${base_url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${api_key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error: ${response.status} ${error}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? '';
  }

  if (provider === 'anthropic') {
    const response = await fetch(`${base_url}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': api_key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${error}`);
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    return data.content[0]?.text ?? '';
  }

  throw new Error(`Unsupported LLM provider: ${provider}`);
}

// ============================================================================
// Workflow Stats Service
// ============================================================================

function getWorkflowStats(runLogsDir: string, workflowId: string): WorkflowStats {
  const stats: WorkflowStats = {
    total_runs: 0,
    success_count: 0,
    failed_count: 0,
    cancelled_count: 0,
  };

  if (!fs.existsSync(runLogsDir)) {
    return stats;
  }

  for (const file of fs.readdirSync(runLogsDir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const content = fs.readFileSync(path.join(runLogsDir, file), 'utf-8');
      const log = JSON.parse(content);
      if (log.metadata.workflow_id !== workflowId) continue;

      stats.total_runs++;
      switch (log.metadata.status) {
        case 'success':
          stats.success_count++;
          break;
        case 'failed':
          stats.failed_count++;
          break;
        case 'cancelled':
          stats.cancelled_count++;
          break;
      }
      if (!stats.last_run || log.metadata.timestamp > stats.last_run) {
        stats.last_run = log.metadata.timestamp;
      }
    } catch {
      // Skip invalid files
    }
  }

  return stats;
}

export interface ServerConfig {
  port: number;
  actionsDir: string;
  workflowsDir: string;
  templatesDir: string;
  runLogsDir: string;
  dashboardDir?: string;
}

export async function startServer(config: ServerConfig): Promise<void> {
  const fastify = Fastify({
    logger: false,
  });

  // Dashboard WebSocket broadcaster
  const broadcaster = new DashboardBroadcaster();

  // Running workflows manager
  const runningWorkflows = new RunningWorkflowsManager(broadcaster);

  // Extension client for browser automation
  const extensionClient = new ExtensionClientImpl();
  extensionClient.markServerRunning();

  // Set up extension status broadcasting
  extensionClient.onStatusChange((connected) => {
    broadcaster.broadcastExtensionStatus(connected);
  });

  // MCP handler
  const mcpHandler = new McpHandler(
    config.actionsDir,
    config.workflowsDir,
    config.templatesDir,
    config.runLogsDir,
    extensionClient
  );

  // Connect MCP handler to broadcaster for real-time updates
  mcpHandler.setBroadcaster(broadcaster);

  // Register plugins
  await fastify.register(fastifyCors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(fastifyWebsocket);

  // Serve dashboard if available
  const dashboardPath = config.dashboardDir ?? path.join(__dirname, '..', 'dashboard');
  if (fs.existsSync(dashboardPath)) {
    await fastify.register(fastifyStatic, {
      root: dashboardPath,
      prefix: '/',
    });
  }

  // WebSocket endpoint for Chrome extension
  fastify.get('/ws', { websocket: true }, (socket) => {
    console.log('Chrome extension connected');
    extensionClient.handleConnection(socket);
  });

  // WebSocket endpoint for Dashboard (real-time events)
  fastify.get('/ws/dashboard', { websocket: true }, (socket) => {
    broadcaster.addClient(socket);
  });

  // MCP JSON-RPC endpoint
  fastify.post('/mcp', async (request, reply) => {
    const body = typeof request.body === 'string'
      ? request.body
      : JSON.stringify(request.body);

    const response = await mcpHandler.handleRequest(body);
    reply.header('Content-Type', 'application/json').send(response);
  });

  // Health check endpoint
  fastify.get('/health', async (): Promise<HealthResponse> => {
    const status = extensionClient.getStatus();
    return {
      status: 'ok',
      version: '1.0.0',
      desktop_connected: status.server_running,
      browser_connected: status.browser_connected,
    };
  });

  // REST API endpoints
  fastify.get('/api/workflows', async (): Promise<{ workflows: WorkflowSummary[] }> => {
    mcpHandler.reload();
    const workflows = mcpHandler.getAllWorkflows();
    return {
      workflows: workflows.map((w): WorkflowSummary => ({
        id: w.id,
        title: w.title,
        description: w.description,
        params: w.params ?? {},
        source: 'workflows',
      })),
    };
  });

  fastify.get<{ Params: { id: string } }>('/api/workflows/:id', async (request) => {
    const workflow = mcpHandler.findWorkflow(request.params.id);
    if (!workflow) {
      throw { statusCode: 404, message: 'Workflow not found' };
    }
    return { workflow };
  });

  fastify.post<{
    Params: { id: string };
    Body: { params?: Record<string, string> };
  }>('/api/workflows/:id/run', async (request, reply) => {
    const workflowId = request.params.id;
    const params = request.body.params ?? {};

    mcpHandler.reload();
    const workflow = mcpHandler.findWorkflow(workflowId);
    if (!workflow) {
      throw { statusCode: 404, message: 'Workflow not found' };
    }

    // Check browser connection for browser workflows
    const hasBrowserSteps = workflow.steps.some((s) => s.type.startsWith('browser.'));
    if (hasBrowserSteps && !(await extensionClient.isConnected())) {
      throw { statusCode: 400, message: 'Browser not connected' };
    }

    // Generate run ID
    const timestamp = new Date().toISOString();
    const runId = `${workflowId}_${timestamp.replace(/[:.]/g, '').slice(0, 15)}`;

    // Load settings for LLM config and user contexts
    const settings = loadSettings(config.actionsDir);

    // Create execution context with event broadcasting
    const ctx = new ExecutionContext(runId);
    ctx.params = params;
    ctx.extensionClient = extensionClient;
    ctx.actionsRegistry = mcpHandler.getAllActions();
    ctx.workflowsRegistry = mcpHandler.getAllWorkflows();
    ctx.llmConfig = settings.llm;
    ctx.userContexts = settings.user_contexts
      ?.filter(uc => uc.type === 'llm')
      .map(uc => uc.context) ?? [];

    // Wire up event callback to broadcast via WebSocket
    ctx.onEvent((event) => {
      broadcaster.broadcastWorkflowEvent(event, runId);
    });

    // Track as running
    runningWorkflows.add(runId, workflowId, workflow.title, params, ctx);

    // Return immediately with run_id (async execution)
    reply.send({ status: 'started', run_id: runId });

    // Execute workflow in background
    const startTime = Date.now();
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

    // Save run log
    const durationMs = Date.now() - startTime;
    const runLog: RunLog = {
      metadata: {
        id: runId,
        workflow_id: workflowId,
        workflow_title: workflow.title,
        timestamp,
        status,
        duration_ms: durationMs,
        event_count: ctx.capturedEvents.length,
        triggered_by: 'dashboard',
      },
      events: ctx.capturedEvents,
      params,
      output_message: ctx.outputMessage,
    };

    // Persist run log
    if (!fs.existsSync(config.runLogsDir)) {
      fs.mkdirSync(config.runLogsDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(config.runLogsDir, `${runId}.json`),
      JSON.stringify(runLog, null, 2)
    );

    // Remove from running and notify
    runningWorkflows.remove(runId);
  });

  fastify.get('/api/status', async () => {
    return extensionClient.getStatus();
  });

  fastify.get<{
    Querystring: { limit?: string; workflow_id?: string };
  }>('/api/runs', async (request): Promise<{ runs: RunLogMetadata[] }> => {
    const runLogsDir = config.runLogsDir;
    if (!fs.existsSync(runLogsDir)) {
      return { runs: [] };
    }

    const limit = Number(request.query.limit) || 20;
    const filterWorkflow = request.query.workflow_id;

    const runs: RunLogMetadata[] = [];

    for (const file of fs.readdirSync(runLogsDir)) {
      if (!file.endsWith('.json')) continue;

      try {
        const content = fs.readFileSync(path.join(runLogsDir, file), 'utf-8');
        const log = JSON.parse(content) as RunLog;

        if (filterWorkflow && log.metadata.workflow_id !== filterWorkflow) {
          continue;
        }

        runs.push(log.metadata);
      } catch {
        // Skip invalid files
      }
    }

    runs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    runs.splice(limit);

    return { runs };
  });

  fastify.get<{ Params: { id: string } }>('/api/runs/:id', async (request) => {
    const filePath = path.join(config.runLogsDir, `${request.params.id}.json`);

    if (!fs.existsSync(filePath)) {
      throw { statusCode: 404, message: 'Run log not found' };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return { run_log: JSON.parse(content) };
  });

  // ============================================================================
  // Settings API
  // ============================================================================

  fastify.get('/api/settings', async () => {
    return { settings: loadSettings(config.actionsDir) };
  });

  fastify.post<{ Body: Partial<Settings> }>('/api/settings', async (request) => {
    const current = loadSettings(config.actionsDir);
    const updated: Settings = {
      llm: request.body.llm ?? current.llm,
      last_used_params: request.body.last_used_params ?? current.last_used_params,
      dashboard_shortcuts: request.body.dashboard_shortcuts ?? current.dashboard_shortcuts,
      user_contexts: request.body.user_contexts ?? current.user_contexts,
    };
    saveSettings(config.actionsDir, updated);
    return { settings: updated };
  });

  // ============================================================================
  // Actions API (separate from workflows)
  // ============================================================================

  fastify.get('/api/actions', async () => {
    mcpHandler.reload();
    const actions = mcpHandler.getAllActions();
    return {
      actions: actions.map((a) => ({
        id: a.id,
        title: a.title,
        category: a.category,
        params: a.params,
        description: a.description,
        version: a.version,
        last_verified: a.last_verified,
        policies: a.policies,
        embed: a.embed,
        steps: a.steps,
        parent_id: a.parent_id,
      })),
    };
  });

  fastify.get<{ Params: { id: string } }>('/api/actions/:id', async (request) => {
    const action = mcpHandler.findAction(request.params.id);
    if (!action) {
      throw { statusCode: 404, message: 'Action not found' };
    }
    return { action };
  });

  fastify.post<{ Body: Workflow }>('/api/actions', async (request) => {
    const action = request.body;
    const content = yaml.dump(action);
    const filePath = path.join(config.actionsDir, `${action.id}.yaml`);
    fs.writeFileSync(filePath, content);
    mcpHandler.reload();
    return { action };
  });

  fastify.put<{ Params: { id: string }; Body: Workflow }>('/api/actions/:id', async (request) => {
    const action = request.body;
    const content = yaml.dump(action);
    const filePath = path.join(config.actionsDir, `${request.params.id}.yaml`);
    fs.writeFileSync(filePath, content);
    mcpHandler.reload();
    return { action };
  });

  fastify.delete<{ Params: { id: string } }>('/api/actions/:id', async (request) => {
    const filePath = path.join(config.actionsDir, `${request.params.id}.yaml`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      mcpHandler.reload();
      return { deleted: true };
    }
    throw { statusCode: 404, message: 'Action not found' };
  });

  // Publish action to workflows
  fastify.post<{ Params: { id: string } }>('/api/actions/:id/publish', async (request) => {
    const action = mcpHandler.findAction(request.params.id);
    if (!action) {
      throw { statusCode: 404, message: 'Action not found' };
    }
    const content = yaml.dump(action);
    if (!fs.existsSync(config.workflowsDir)) {
      fs.mkdirSync(config.workflowsDir, { recursive: true });
    }
    const filePath = path.join(config.workflowsDir, `${action.id}.yaml`);
    fs.writeFileSync(filePath, content);
    mcpHandler.reload();
    return { workflow: action };
  });

  // Copy workflow to actions (fork)
  fastify.post<{ Params: { id: string } }>('/api/workflows/:id/copy-to-actions', async (request) => {
    const workflow = mcpHandler.findWorkflow(request.params.id);
    if (!workflow) {
      throw { statusCode: 404, message: 'Workflow not found' };
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const newId = `${workflow.id}_copy_${timestamp}`;
    const newAction: Workflow = {
      ...workflow,
      id: newId,
      title: `${workflow.title} (Copy)`,
      parent_id: workflow.id,
    };
    const content = yaml.dump(newAction);
    const filePath = path.join(config.actionsDir, `${newId}.yaml`);
    fs.writeFileSync(filePath, content);
    mcpHandler.reload();
    return { action: newAction };
  });

  // ============================================================================
  // Workflow Stats API
  // ============================================================================

  fastify.get<{ Params: { id: string } }>('/api/workflows/:id/stats', async (request) => {
    return { stats: getWorkflowStats(config.runLogsDir, request.params.id) };
  });

  // ============================================================================
  // Embed Workflows API (for Chrome extension)
  // ============================================================================

  fastify.get('/api/embed-workflows', async () => {
    mcpHandler.reload();
    // Only return actions with embed config (not workflows)
    const actions = mcpHandler.getAllActions();
    const embedActions = actions.filter((a) => a.embed);
    return {
      workflows: embedActions.map((a) => ({
        id: a.id,
        title: a.title,
        embed: a.embed,
        params: a.params,
        policies: a.policies,
      })),
    };
  });

  // ============================================================================
  // Templates API
  // ============================================================================

  // List all available templates
  fastify.get('/api/templates', async () => {
    mcpHandler.reload();
    const templates = mcpHandler.getTemplates();
    return {
      templates: templates.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        category: t.category,
        params: t.params,
        hasEmbed: !!t.embed,
      })),
    };
  });

  // Import a template to actions
  fastify.post<{ Params: { id: string } }>('/api/templates/:id/import', async (request) => {
    const template = mcpHandler.findTemplate(request.params.id);
    if (!template) {
      throw { statusCode: 404, message: 'Template not found' };
    }

    // Copy template file to actions directory
    const srcPath = path.join(mcpHandler.getTemplatesDir(), `${request.params.id}.yaml`);
    const destPath = path.join(mcpHandler.getActionsDir(), `${template.id}.yaml`);

    if (!fs.existsSync(srcPath)) {
      throw { statusCode: 404, message: 'Template file not found' };
    }

    // Copy the file
    fs.copyFileSync(srcPath, destPath);
    mcpHandler.reload();

    return { action: template };
  });

  // ============================================================================
  // Run Log Management API
  // ============================================================================

  fastify.delete<{ Params: { id: string } }>('/api/runs/:id', async (request) => {
    const filePath = path.join(config.runLogsDir, `${request.params.id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { deleted: true };
    }
    throw { statusCode: 404, message: 'Run log not found' };
  });

  fastify.delete('/api/runs', async () => {
    if (!fs.existsSync(config.runLogsDir)) {
      return { deleted: 0 };
    }
    let count = 0;
    for (const file of fs.readdirSync(config.runLogsDir)) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(config.runLogsDir, file));
        count++;
      }
    }
    return { deleted: count };
  });

  // ============================================================================
  // Recording API
  // ============================================================================

  fastify.get('/api/recordings', async () => {
    return { recordings: listRecordings(config.actionsDir) };
  });

  fastify.get<{ Params: { id: string } }>('/api/recordings/:id', async (request) => {
    const recording = loadRecording(config.actionsDir, request.params.id);
    if (!recording) {
      throw { statusCode: 404, message: 'Recording not found' };
    }
    return { recording };
  });

  fastify.delete<{ Params: { id: string } }>('/api/recordings/:id', async (request) => {
    if (deleteRecording(config.actionsDir, request.params.id)) {
      return { deleted: true };
    }
    throw { statusCode: 404, message: 'Recording not found' };
  });

  fastify.post('/api/recordings/start', async () => {
    try {
      await extensionClient.startRecording();
      return { status: 'recording' };
    } catch (e) {
      throw { statusCode: 500, message: (e as Error).message };
    }
  });

  fastify.post('/api/recordings/stop', async () => {
    try {
      const events = await extensionClient.stopRecording();
      const timestamp = new Date().toISOString();
      const id = `recording_${timestamp.replace(/[:.]/g, '-').slice(0, 19)}`;
      const recording: Recording = { id, timestamp, events };
      saveRecording(config.actionsDir, recording);
      return { recording };
    } catch (e) {
      throw { statusCode: 500, message: (e as Error).message };
    }
  });

  fastify.get('/api/recordings/status', async () => {
    const status: RecordingStatus = {
      is_recording: extensionClient.isRecording(),
      event_count: extensionClient.getRecordedEvents().length,
    };
    return { status };
  });

  // Convert recording to workflow (deterministic)
  fastify.post<{ Params: { id: string } }>('/api/recordings/:id/convert', async (request) => {
    const recording = loadRecording(config.actionsDir, request.params.id);
    if (!recording) {
      throw { statusCode: 404, message: 'Recording not found' };
    }
    const workflow = convertRecordingToWorkflow(recording);
    // Save as action
    const content = yaml.dump(workflow);
    const filePath = path.join(config.actionsDir, `${workflow.id}.yaml`);
    fs.writeFileSync(filePath, content);
    mcpHandler.reload();
    return { workflow };
  });

  // ============================================================================
  // Reload API
  // ============================================================================

  fastify.post('/api/reload', async () => {
    mcpHandler.reload();
    return { reloaded: true };
  });

  // ============================================================================
  // Running Workflows API
  // ============================================================================

  fastify.get('/api/running-workflows', async () => {
    return { workflows: runningWorkflows.getAll() };
  });

  fastify.post<{ Params: { id: string } }>('/api/running-workflows/:id/stop', async (request) => {
    const runId = request.params.id;
    if (runningWorkflows.cancel(runId)) {
      return { cancelled: true, run_id: runId };
    }
    throw { statusCode: 404, message: 'Running workflow not found' };
  });

  // Alias for backwards compatibility
  fastify.post<{ Params: { id: string } }>('/api/workflows/:id/cancel', async (request) => {
    // This expects workflow_id, but we need to find the running workflow by workflow_id
    const workflowId = request.params.id;
    const running = runningWorkflows.getAll();
    const match = running.find(w => w.workflow_id === workflowId);
    if (match && runningWorkflows.cancel(match.run_id)) {
      return { cancelled: true, run_id: match.run_id };
    }
    throw { statusCode: 404, message: 'No running workflow found for this ID' };
  });

  // ============================================================================
  // LLM Recording Conversion API
  // ============================================================================

  fastify.post<{ Params: { id: string } }>('/api/recordings/:id/convert-llm', async (request) => {
    const recording = loadRecording(config.actionsDir, request.params.id);
    if (!recording) {
      throw { statusCode: 404, message: 'Recording not found' };
    }

    // Load settings to get LLM config
    const settings = loadSettings(config.actionsDir);
    if (!settings.llm.api_key) {
      throw { statusCode: 400, message: 'LLM API key not configured in settings' };
    }

    // Build prompt for LLM to clean up recorded events
    const eventsJson = JSON.stringify(recording.events, null, 2);
    const prompt = `You are a workflow optimization expert. Analyze this browser recording and create an optimized workflow.

Raw recorded events:
${eventsJson}

Generate a clean, optimized YAML workflow that:
1. Removes redundant waits and clicks
2. Combines related actions where possible
3. Uses better selectors (prefer IDs and data attributes over complex CSS paths)
4. Adds appropriate wait steps before interactions
5. Names extracted variables clearly

Return ONLY valid YAML for the workflow, no explanation. The YAML should follow this structure:
schema_version: 1
namespace: local
id: <generated_id>
title: <descriptive_title>
steps:
  - type: browser.navigate
    url: <url>
  ...`;

    try {
      // Call LLM API
      const llmResponse = await callLlmApi(settings.llm, prompt);

      // Parse YAML response
      const cleanedYaml = llmResponse.trim().replace(/^```yaml\n?/, '').replace(/\n?```$/, '');
      const workflow = yaml.load(cleanedYaml) as Workflow;

      // Ensure required fields
      if (!workflow.id) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        workflow.id = `workflow_llm_${timestamp}`;
      }
      if (!workflow.schema_version) workflow.schema_version = 1;
      if (!workflow.namespace) workflow.namespace = 'local';

      // Save as action
      const content = yaml.dump(workflow);
      const filePath = path.join(config.actionsDir, `${workflow.id}.yaml`);
      fs.writeFileSync(filePath, content);
      mcpHandler.reload();

      return { workflow };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw { statusCode: 500, message: `LLM conversion failed: ${message}` };
    }
  });

  // Start server
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`\nSideButton server started on http://localhost:${config.port}`);
    console.log(`  - Dashboard:  http://localhost:${config.port}`);
    console.log(`  - WebSocket:  ws://localhost:${config.port}/ws`);
    console.log(`  - MCP:        http://localhost:${config.port}/mcp`);
    console.log(`  - API:        http://localhost:${config.port}/api`);
    console.log(`\nPress Ctrl+C to stop\n`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}
