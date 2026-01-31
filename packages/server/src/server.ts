/**
 * Fastify HTTP + WebSocket server
 */

import Fastify, { type FastifyReply } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import fastifyFormbody from '@fastify/formbody';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ExtensionClientImpl } from './extension.js';
import { McpHandler } from './mcp/handler.js';
import { reportRunLog } from './services/report.js';
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
  ExternalMcpConfig,
} from '@sidebutton/core';
import { ExecutionContext, executeWorkflow } from '@sidebutton/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Utility Functions
// ============================================================================

function extractDomain(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

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
  private running: Map<string, { info: RunningWorkflowInfo; context: ExecutionContext | null }> = new Map();
  private broadcaster: DashboardBroadcaster;

  constructor(broadcaster: DashboardBroadcaster) {
    this.broadcaster = broadcaster;
  }

  // Full add with context (for REST API workflows that support cancellation)
  add(runId: string, workflowId: string, workflowTitle: string, params: Record<string, string>, context?: ExecutionContext): void {
    const info: RunningWorkflowInfo = {
      run_id: runId,
      workflow_id: workflowId,
      workflow_title: workflowTitle,
      started_at: new Date().toISOString(),
      params,
    };
    this.running.set(runId, { info, context: context ?? null });
    this.broadcaster.broadcastRunningWorkflowsChanged(this.getAll());
  }

  remove(runId: string): void {
    this.running.delete(runId);
    this.broadcaster.broadcastRunningWorkflowsChanged(this.getAll());
  }

  cancel(runId: string): boolean {
    const entry = this.running.get(runId);
    if (entry?.context) {
      entry.context.cancel();
      return true;
    }
    return false;
  }

  getAll(): RunningWorkflowInfo[] {
    return Array.from(this.running.values()).map(e => e.info);
  }

  get(runId: string): { info: RunningWorkflowInfo; context: ExecutionContext | null } | undefined {
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
      model: 'gpt-5.2',
    },
    last_used_params: {},
    dashboard_shortcuts: [],
    user_contexts: [],
    external_mcps: [],
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
      const defaults = getDefaultSettings();
      // Ensure all fields exist with defaults
      return {
        llm: settings.llm ?? defaults.llm,
        last_used_params: settings.last_used_params ?? {},
        dashboard_shortcuts: settings.dashboard_shortcuts ?? [],
        user_contexts: settings.user_contexts ?? [],
        external_mcps: settings.external_mcps ?? defaults.external_mcps,
        reporting: settings.reporting,
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

  // Allow empty JSON bodies (fixes DELETE requests with Content-Type: application/json but no body)
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || body === '') {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
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

  // Connect MCP handler to broadcaster and running workflows tracker
  mcpHandler.setBroadcaster(broadcaster);
  mcpHandler.setRunningWorkflowsTracker(runningWorkflows);

  // Register plugins
  await fastify.register(fastifyCors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(fastifyFormbody);
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

    // Send current running workflows state immediately on connect
    // This ensures new clients don't miss running workflows due to race conditions
    const currentRunning = runningWorkflows.getAll();
    if (currentRunning.length > 0) {
      try {
        socket.send(JSON.stringify({
          type: 'running-workflows-changed',
          data: { workflows: currentRunning }
        }));
      } catch (e) {
        // Client might disconnect immediately, ignore
      }
    }
  });

  // MCP Streamable HTTP Transport
  // Supports both old HTTP+SSE (2024-11-05) and new Streamable HTTP (2025-06-18)
  // Session tracking for SSE streams - MCP 2025-11-25 compliant
  interface McpSession {
    sseReply: FastifyReply | null;
    pendingMessages: Array<{ id: string; data: string }>;  // Buffered with IDs for replay
    messageBuffer: Map<string, string>;  // Event ID -> data for Last-Event-ID replay
    lastEventId: number;  // Sequence counter for event IDs
    expiryTimer: ReturnType<typeof setTimeout> | null;
    isNewTransport: boolean;
    createdAt: number;  // For cleanup tracking
    lastActivityAt: number;  // For idle detection
  }

  const mcpSessions = new Map<string, McpSession>();

  // Session configuration - MCP spec compliant
  const SESSION_EXPIRY_MS = 5 * 60 * 1000;  // 5 minutes reconnection window
  const MAX_SESSIONS = 100;  // Prevent unbounded growth
  const MESSAGE_BUFFER_SIZE = 50;  // Max messages to buffer for replay
  const CLEANUP_INTERVAL_MS = 60 * 1000;  // Run cleanup every 60s
  const IDLE_SESSION_TIMEOUT_MS = 10 * 60 * 1000;  // 10 minutes idle timeout

  // Helper: Create a new session with proper initialization
  function createMcpSession(isNewTransport: boolean): McpSession {
    const now = Date.now();
    return {
      sseReply: null,
      pendingMessages: [],
      messageBuffer: new Map(),
      lastEventId: 0,
      expiryTimer: null,
      isNewTransport,
      createdAt: now,
      lastActivityAt: now,
    };
  }

  // Helper: Generate event ID per MCP spec (globally unique within session)
  function generateEventId(sessionId: string, session: McpSession): string {
    session.lastEventId++;
    return `${sessionId.slice(0, 8)}_${session.lastEventId}`;
  }

  // Helper: Send SSE message with event ID and retry hint (MCP 2025-11-25 compliant)
  // For old transport: Always queue messages and let drain handle delivery
  // This ensures messages aren't lost if client disconnects immediately after send
  function sendSSEMessage(
    session: McpSession,
    sessionId: string,
    data: string,
    eventType: string = 'message'
  ): boolean {
    session.lastActivityAt = Date.now();
    const eventId = generateEventId(sessionId, session);

    // Buffer for replay on reconnection (MCP spec: resumability)
    session.messageBuffer.set(eventId, data);

    // Trim buffer if too large (keep most recent)
    if (session.messageBuffer.size > MESSAGE_BUFFER_SIZE) {
      const firstKey = session.messageBuffer.keys().next().value;
      if (firstKey) session.messageBuffer.delete(firstKey);
    }

    // For OLD transport: Always queue first, then try to send
    // This ensures message isn't lost if client disconnects right after write
    if (!session.isNewTransport) {
      session.pendingMessages.push({ id: eventId, data });

      // Try to drain immediately if SSE is available
      if (session.sseReply && !session.sseReply.raw.writableEnded) {
        const socket = session.sseReply.raw.socket;
        if (socket && !socket.destroyed && socket.writable) {
          // Drain all pending (including the one we just added)
          let sent = 0;
          const toSend = [...session.pendingMessages];
          session.pendingMessages = [];

          for (const msg of toSend) {
            try {
              const sseEvent = `id: ${msg.id}\nretry: 5000\nevent: ${eventType}\ndata: ${msg.data}\n\n`;
              session.sseReply.raw.write(sseEvent);
              sent++;
            } catch (e) {
              // Re-queue failed messages
              session.pendingMessages.push(msg);
              console.log(`[MCP] Failed to write SSE event ${msg.id}:`, e);
              break;
            }
          }

          if (sent > 0) {
            console.log(`[MCP] Sent ${sent} SSE event(s), latest: ${eventId} (${data.length} bytes)`);
            return true;
          }
        }
      }

      console.log(`[MCP] Queued message ${eventId} for later delivery (pending: ${session.pendingMessages.length})`);
      return false;
    }

    // For NEW transport: Send directly if possible (uses Last-Event-ID for recovery)
    if (session.sseReply && !session.sseReply.raw.writableEnded) {
      const socket = session.sseReply.raw.socket;
      if (socket && !socket.destroyed && socket.writable) {
        try {
          const sseEvent = `id: ${eventId}\nretry: 5000\nevent: ${eventType}\ndata: ${data}\n\n`;
          session.sseReply.raw.write(sseEvent);
          console.log(`[MCP] Sent SSE event ${eventId} (${data.length} bytes)`);
          return true;
        } catch (e) {
          console.log(`[MCP] Failed to write SSE event ${eventId}:`, e);
        }
      }
    }

    // Queue for later delivery if no active connection
    session.pendingMessages.push({ id: eventId, data });
    console.log(`[MCP] Queued message ${eventId} for later delivery (pending: ${session.pendingMessages.length})`);
    return false;
  }

  // Helper: Parse event ID to extract sequence number
  function parseEventIdSequence(eventId: string): number {
    const parts = eventId.split('_');
    return parts.length > 1 ? parseInt(parts[1], 10) : 0;
  }

  // Helper: Replay messages after Last-Event-ID (MCP spec: resumability)
  function replayMessagesAfter(
    session: McpSession,
    sessionId: string,
    lastEventId: string,
    reply: FastifyReply
  ): number {
    const lastSeq = parseEventIdSequence(lastEventId);
    let replayed = 0;

    for (const [eventId, data] of session.messageBuffer) {
      const seq = parseEventIdSequence(eventId);
      if (seq > lastSeq) {
        try {
          reply.raw.write(`id: ${eventId}\nretry: 5000\nevent: message\ndata: ${data}\n\n`);
          replayed++;
        } catch (e) {
          console.log(`[MCP] Failed to replay event ${eventId}:`, e);
          break;
        }
      }
    }

    if (replayed > 0) {
      console.log(`[MCP] Replayed ${replayed} messages after ${lastEventId}`);
    }
    return replayed;
  }

  // Helper: Drain pending messages to SSE connection
  function drainPendingMessages(session: McpSession, reply: FastifyReply): number {
    let sent = 0;
    for (const msg of session.pendingMessages) {
      try {
        reply.raw.write(`id: ${msg.id}\nretry: 5000\nevent: message\ndata: ${msg.data}\n\n`);
        sent++;
      } catch (e) {
        console.log(`[MCP] Failed to drain pending message ${msg.id}:`, e);
        break;
      }
    }
    if (sent > 0) {
      session.pendingMessages = session.pendingMessages.slice(sent);
      console.log(`[MCP] Drained ${sent} pending messages`);
    }
    return sent;
  }

  // Periodic session cleanup (MCP spec: server MAY terminate sessions)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of mcpSessions) {
      // Clean up sessions that are:
      // 1. Idle for too long with no SSE connection
      // 2. Have no SSE and no pending expiry timer
      const isIdle = (now - session.lastActivityAt) > IDLE_SESSION_TIMEOUT_MS;
      const hasNoSSE = !session.sseReply || session.sseReply.raw.writableEnded;
      const hasNoExpiry = !session.expiryTimer;

      if (isIdle && hasNoSSE && hasNoExpiry) {
        mcpSessions.delete(sessionId);
        cleaned++;
        console.log(`[MCP] Cleaned up idle session ${sessionId.slice(0, 8)}`);
      }
    }

    if (cleaned > 0 || mcpSessions.size > 0) {
      console.log(`[MCP] Session cleanup: removed ${cleaned}, active: ${mcpSessions.size}`);
    }
  }, CLEANUP_INTERVAL_MS);

  // Clean up interval on server shutdown
  fastify.addHook('onClose', async () => {
    clearInterval(cleanupInterval);
  });

  // Old HTTP+SSE transport endpoint (for backwards compatibility)
  // Redirects to /mcp which handles both old and new transport
  fastify.get('/sse', async (request, reply) => {
    const accept = request.headers.accept || '';

    if (!accept.includes('text/event-stream')) {
      reply.code(406).send({ error: 'Must accept text/event-stream' });
      return;
    }

    // Close all existing SSE sessions (old transport only allows one)
    for (const [existingId, existingSession] of mcpSessions) {
      if (existingSession.sseReply) {
        try {
          if (!existingSession.sseReply.raw.writableEnded) {
            existingSession.sseReply.raw.end();
          }
        } catch { /* ignore */ }
        mcpSessions.delete(existingId);
      }
    }

    const sessionId = crypto.randomUUID();
    const session = createMcpSession(false);
    session.sseReply = reply;
    mcpSessions.set(sessionId, session);

    // Tell Fastify we're taking over the response (required for SSE)
    reply.hijack();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send endpoint event with event ID (MCP spec compliant)
    const endpointEventId = generateEventId(sessionId, session);
    reply.raw.write(`id: ${endpointEventId}\nretry: 5000\nevent: endpoint\ndata: /message\n\n`);
    console.log(`[MCP] /sse: new session ${sessionId.slice(0, 8)}`);

    // Keep alive with pings - 5s to stay under client idle timeout
    const pingInterval = setInterval(() => {
      const s = mcpSessions.get(sessionId);
      if (s?.sseReply) {
        try {
          s.lastActivityAt = Date.now();
          reply.raw.write(`: ping\n\n`);
        } catch { /* ignore */ }
      }
    }, 5000);

    request.raw.on('close', () => {
      clearInterval(pingInterval);
      mcpSessions.delete(sessionId);
      console.log(`[MCP] /sse: session ${sessionId.slice(0, 8)} closed`);
    });
  });

  // Old transport message endpoint (POST target from /sse)
  fastify.post('/message', async (request, reply) => {
    const body = typeof request.body === 'string'
      ? request.body
      : JSON.stringify(request.body);

    let parsedBody: { method?: string; id?: string | number | null } = {};
    try {
      parsedBody = JSON.parse(body);
    } catch { /* handler will deal with it */ }

    const isNotification = parsedBody.method && parsedBody.id === undefined;
    const response = await mcpHandler.handleRequest(body);

    // Find active SSE session (old transport ensures only one)
    let activeSession: McpSession | null = null;
    let activeSessionId: string | null = null;
    for (const [sessionId, session] of mcpSessions) {
      if (session.sseReply && !session.sseReply.raw.writableEnded) {
        activeSession = session;
        activeSessionId = sessionId;
        break;
      }
    }

    if (activeSession && activeSessionId) {
      if (!isNotification) {
        // Use new sendSSEMessage for proper event IDs and buffering
        sendSSEMessage(activeSession, activeSessionId, response);
      }
      reply.code(202).send();
    } else {
      // No SSE stream, return direct response
      reply.header('Content-Type', 'application/json').send(response);
    }
  });

  // MCP GET endpoint - Opens SSE stream
  // Supports both old HTTP+SSE transport (2024-11-05) and new Streamable HTTP (2025-06-18)
  // MCP 2025-11-25 compliant with Last-Event-ID resumability
  let mcpConnectionCount = 0;

  fastify.get('/mcp', async (request, reply) => {
    const clientIP = request.ip;
    const userAgent = request.headers['user-agent'] || 'unknown';
    const lastEventId = request.headers['last-event-id'] as string | undefined;
    console.log(`[MCP] GET /mcp from ${clientIP}, UA: ${userAgent.slice(0, 50)}${lastEventId ? `, Last-Event-ID: ${lastEventId}` : ''}`);

    const accept = request.headers.accept || '';

    // Must accept text/event-stream
    if (!accept.includes('text/event-stream')) {
      console.log('[MCP] GET /mcp rejected - Accept header does not include text/event-stream');
      reply.code(406).send({ error: 'Must accept text/event-stream' });
      return;
    }

    // Get session from header
    let sessionId = request.headers['mcp-session-id'] as string | undefined;
    const isNewTransport = !!sessionId;

    // Check if session was terminated or expired (new transport only)
    if (sessionId && !mcpSessions.has(sessionId)) {
      reply.code(404).send({ error: 'Session not found or expired' });
      return;
    }

    // Enforce max sessions limit (MCP spec: prevent unbounded growth)
    if (!sessionId && mcpSessions.size >= MAX_SESSIONS) {
      // Find and remove oldest session without active SSE
      let oldestSessionId: string | null = null;
      let oldestTime = Infinity;
      for (const [id, sess] of mcpSessions) {
        if (!sess.sseReply && sess.createdAt < oldestTime) {
          oldestTime = sess.createdAt;
          oldestSessionId = id;
        }
      }
      if (oldestSessionId) {
        mcpSessions.delete(oldestSessionId);
        console.log(`[MCP] Evicted oldest session ${oldestSessionId.slice(0, 8)} to make room`);
      }
    }

    // Tell Fastify we're taking over the response (required for SSE)
    reply.hijack();

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    });

    // If no session ID, this is the old HTTP+SSE transport (2024-11-05)
    // Send the endpoint event to tell client where to POST messages
    if (!sessionId) {
      // Old transport only allows one active SSE session at a time.
      // Check if there's already an active session - if so, REUSE it instead of creating a new one.
      // This prevents reconnection loops where closing old session triggers immediate reconnect.
      let existingActiveSession: string | null = null;
      for (const [existingId, existingSession] of mcpSessions) {
        if (!existingSession.isNewTransport && existingSession.sseReply) {
          const socket = existingSession.sseReply.raw.socket;
          if (socket && !socket.destroyed && socket.writable) {
            existingActiveSession = existingId;
            break;
          } else {
            // Clean up dead session
            mcpSessions.delete(existingId);
          }
        }
      }

      if (existingActiveSession) {
        // Already have an active SSE session - transfer to new connection
        // Close old reply gracefully and use the same session ID
        sessionId = existingActiveSession;
        const oldSession = mcpSessions.get(sessionId)!;
        if (oldSession.sseReply && !oldSession.sseReply.raw.writableEnded) {
          try {
            oldSession.sseReply.raw.end();
          } catch { /* ignore */ }
        }
        oldSession.sseReply = null;  // Will be set to new reply below
        console.log(`[MCP] SSE session ${sessionId.slice(0, 8)} transferred to new connection`);
      } else {
        sessionId = crypto.randomUUID();
        const newSession = createMcpSession(false);
        mcpSessions.set(sessionId, newSession);
        mcpConnectionCount++;
        console.log(`[MCP] SSE connection established (old transport, session ${sessionId.slice(0, 8)})`);
      }

      // Send endpoint event with event ID (MCP spec compliant)
      const session = mcpSessions.get(sessionId)!;
      const endpointEventId = generateEventId(sessionId, session);
      const host = request.headers.host || 'localhost:9876';
      reply.raw.write(`id: ${endpointEventId}\nretry: 5000\nevent: endpoint\ndata: http://${host}/mcp\n\n`);
    }

    const session = mcpSessions.get(sessionId);
    if (session) {
      // Clear any pending expiry timer (client reconnected)
      if (session.expiryTimer) {
        clearTimeout(session.expiryTimer);
        session.expiryTimer = null;
        console.log(`[MCP] Session ${sessionId.slice(0, 8)} reconnected, expiry cancelled`);
      }

      // Update activity timestamp
      session.lastActivityAt = Date.now();

      // Store SSE reply for this session
      session.sseReply = reply;

      // MCP spec: Handle Last-Event-ID for resumability
      // Replay any messages that were sent after the last event ID
      if (lastEventId) {
        replayMessagesAfter(session, sessionId, lastEventId, reply);
      } else if (!session.isNewTransport && session.messageBuffer.size > 0) {
        // Old transport without Last-Event-ID: Replay ALL recent messages from buffer
        // Claude Code doesn't send Last-Event-ID, so we replay everything on reconnect
        // This ensures messages sent right before disconnect are re-delivered
        let replayed = 0;
        for (const [eventId, data] of session.messageBuffer) {
          try {
            reply.raw.write(`id: ${eventId}\nretry: 5000\nevent: message\ndata: ${data}\n\n`);
            replayed++;
          } catch (e) {
            console.log(`[MCP] Failed to replay event ${eventId}:`, e);
            break;
          }
        }
        if (replayed > 0) {
          console.log(`[MCP] Replayed ${replayed} buffered messages on reconnect (old transport, no Last-Event-ID)`);
        }
      }

      // Drain any pending messages that were queued while disconnected
      drainPendingMessages(session, reply);
    }

    // Keep alive with pings - 5s interval to stay under Claude Code's ~10s idle timeout
    const pingInterval = setInterval(() => {
      const s = mcpSessions.get(sessionId!);
      if (s?.sseReply) {
        try {
          s.lastActivityAt = Date.now();
          reply.raw.write(`: ping\n\n`);
        } catch {
          // Connection failed, clean up
          clearInterval(pingInterval);
          s.sseReply = null;
        }
      }
    }, 5000);

    // Capture reference to THIS reply for close handler
    const thisReply = reply;

    // Cleanup on close
    request.raw.on('close', () => {
      clearInterval(pingInterval);
      mcpConnectionCount--;
      const s = mcpSessions.get(sessionId!);

      if (!s) {
        // Session already deleted
        return;
      }

      // Only clear sseReply if it's still OUR reply (prevents race condition during transfer)
      if (s.sseReply !== thisReply) {
        console.log(`[MCP] SSE connection closed for session ${sessionId?.slice(0, 8)} (already transferred)`);
        return;
      }

      console.log(`[MCP] SSE connection closed for session ${sessionId?.slice(0, 8)}`);
      s.sseReply = null;

      if (isNewTransport) {
        // New transport: Keep session for reconnection window
        // Client can reconnect with same session ID and use Last-Event-ID
        s.expiryTimer = setTimeout(() => {
          const current = mcpSessions.get(sessionId!);
          if (current && current.sseReply === null) {
            mcpSessions.delete(sessionId!);
            console.log(`[MCP] Session ${sessionId?.slice(0, 8)} expired (no reconnect after ${SESSION_EXPIRY_MS / 1000}s)`);
          }
        }, SESSION_EXPIRY_MS);
        console.log(`[MCP] SSE stream closed for session ${sessionId?.slice(0, 8)} (reconnect window: ${SESSION_EXPIRY_MS / 1000}s)`);
      } else {
        // Old transport: Keep session briefly for message delivery
        // Don't delete immediately - allow pending async responses to be queued
        s.expiryTimer = setTimeout(() => {
          const current = mcpSessions.get(sessionId!);
          if (current && current.sseReply === null) {
            mcpSessions.delete(sessionId!);
            console.log(`[MCP] Old transport session ${sessionId?.slice(0, 8)} cleaned up`);
          }
        }, 30000);  // 30s grace period for reconnection
      }
    });
  });

  // MCP POST endpoint - Send JSON-RPC messages
  // Supports both old HTTP+SSE transport (2024-11-05) and new Streamable HTTP (2025-06-18)
  fastify.post('/mcp', async (request, reply) => {
    const accept = request.headers.accept || '';
    const wantsSSE = accept.includes('text/event-stream');

    console.log(`[MCP] POST /mcp received (Accept: ${accept})`);

    const body = typeof request.body === 'string'
      ? request.body
      : JSON.stringify(request.body);

    // Parse to check message type
    let parsedBody: { method?: string; id?: string | number | null } = {};
    try {
      parsedBody = JSON.parse(body);
    } catch {
      // Ignore parse errors, handler will deal with it
    }

    // Check if this is a notification (has method but no id)
    const isNotification = parsedBody.method && parsedBody.id === undefined;

    // Get or create session
    let sessionId = request.headers['mcp-session-id'] as string | undefined;

    // Check if session was terminated or expired (return 404 per MCP spec)
    if (sessionId && !mcpSessions.has(sessionId) && parsedBody.method !== 'initialize') {
      reply.code(404).send({ error: 'Session not found or expired' });
      return;
    }

    // For initialize requests in new transport, create a new session
    // But ONLY if there's no active old-transport SSE (to avoid confusing transports)
    if (parsedBody.method === 'initialize' && !sessionId) {
      // Check if there's an active old-transport SSE - if so, don't create new transport session
      let hasOldTransportSSE = false;
      for (const [, session] of mcpSessions) {
        if (!session.isNewTransport && session.sseReply && !session.sseReply.raw.writableEnded) {
          hasOldTransportSSE = true;
          break;
        }
      }

      if (!hasOldTransportSSE) {
        sessionId = crypto.randomUUID();
        const newSession = createMcpSession(true);
        mcpSessions.set(sessionId, newSession);
        console.log(`[MCP] New session created: ${sessionId.slice(0, 8)} (new transport, via initialize)`);
      }
    }

    // Handle notifications - return 202 Accepted with no body per MCP spec
    if (isNotification) {
      // Still process the notification for side effects
      await mcpHandler.handleRequest(body);

      if (sessionId) {
        reply.header('Mcp-Session-Id', sessionId);
      }
      reply.code(202).send();
      return;
    }

    // Check for old transport SSE session FIRST (no Mcp-Session-Id header but active SSE stream)
    // Old transport: client connects to GET /mcp first, then POSTs without session header
    // We need to return 202 IMMEDIATELY and send response via SSE when done
    // IMPORTANT: Only use old transport if SSE is actually connected, otherwise return sync JSON
    if (!request.headers['mcp-session-id']) {
      // Find active old transport SSE session (MUST be connected)
      let oldTransportSession: McpSession | null = null;
      let oldTransportSessionId: string | null = null;
      for (const [sseSessionId, session] of mcpSessions) {
        if (!session.isNewTransport) {
          // Check if SSE is alive - only use if actually connected
          if (session.sseReply && !session.sseReply.raw.writableEnded) {
            const socket = session.sseReply.raw.socket;
            if (socket && !socket.destroyed && socket.writable) {
              oldTransportSession = session;
              oldTransportSessionId = sseSessionId;
              break;
            }
          }
          // NOTE: Removed fallback to disconnected session - this caused 202 empty responses
          // when no SSE was active, breaking direct POST calls from extension
        }
      }

      if (oldTransportSession && oldTransportSessionId) {
        // Old transport: Return 202 IMMEDIATELY, execute async, send response via SSE
        // If client disconnects during execution, response will be buffered and
        // delivered when they reconnect (MCP spec: resumability)
        console.log(`[MCP] Old transport: accepting request, will respond via SSE (session ${oldTransportSessionId.slice(0, 8)})`);

        // Clear message buffer on new request - client must have received previous messages
        // if they're sending a new request. This prevents endless replay of old messages.
        oldTransportSession.messageBuffer.clear();
        oldTransportSession.pendingMessages = [];

        reply.code(202).send();

        // Execute request asynchronously and send response via SSE when done
        const sessionIdRef = oldTransportSessionId;

        mcpHandler.handleRequest(body).then((response) => {
          // Get current session state (may have changed during execution)
          const currentSession = mcpSessions.get(sessionIdRef);
          if (!currentSession) {
            console.log(`[MCP] Session ${sessionIdRef.slice(0, 8)} deleted before response could be sent`);
            return;
          }

          // Use sendSSEMessage which handles buffering if client disconnected
          // This is the key fix for BUG-002 and BUG-005
          const sent = sendSSEMessage(currentSession, sessionIdRef, response);
          if (sent) {
            console.log(`[MCP] Response sent via SSE (old transport, async):`, response.slice(0, 200));
          } else {
            console.log(`[MCP] Response queued for delivery when client reconnects (session ${sessionIdRef.slice(0, 8)})`);
          }
        }).catch((e) => {
          console.error(`[MCP] Async request handling failed:`, e);
          // Try to send error response via SSE (or buffer it)
          const currentSession = mcpSessions.get(sessionIdRef);
          if (currentSession) {
            const errorResponse = JSON.stringify({
              jsonrpc: '2.0',
              id: parsedBody.id,
              error: { code: -32000, message: String(e) }
            });
            sendSSEMessage(currentSession, sessionIdRef, errorResponse);
          }
        });

        return;
      }
    }

    // New transport or no SSE session: execute synchronously
    const response = await mcpHandler.handleRequest(body);

    // For initialize requests with new transport (no active old SSE), respond directly with JSON
    if (parsedBody.method === 'initialize' && sessionId) {
      reply.header('Mcp-Session-Id', sessionId);
      reply.header('Content-Type', 'application/json').send(response);
      console.log(`[MCP] Initialize response sent directly (new transport, session: ${sessionId})`);
      return;
    }

    // Set session header in response (new transport)
    if (sessionId) {
      reply.header('Mcp-Session-Id', sessionId);
    }

    if (wantsSSE) {
      // Return as SSE stream (new transport) with event ID for resumability
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      });

      // Generate event ID if we have a session (MCP spec compliant)
      if (sessionId) {
        const session = mcpSessions.get(sessionId);
        if (session) {
          const eventId = generateEventId(sessionId, session);
          session.messageBuffer.set(eventId, response);
          reply.raw.write(`id: ${eventId}\nretry: 5000\ndata: ${response}\n\n`);
        } else {
          reply.raw.write(`data: ${response}\n\n`);
        }
      } else {
        reply.raw.write(`data: ${response}\n\n`);
      }
      reply.raw.end();
    } else {
      // Return as JSON
      reply.header('Content-Type', 'application/json').send(response);
    }
  });

  // MCP DELETE endpoint - Client-initiated session termination
  // Per MCP spec: "Clients SHOULD send HTTP DELETE to explicitly terminate session"
  fastify.delete('/mcp', async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;

    if (!sessionId) {
      reply.code(400).send({ error: 'Missing Mcp-Session-Id header' });
      return;
    }

    const session = mcpSessions.get(sessionId);
    if (!session) {
      // Session already terminated or never existed
      reply.code(404).send({ error: 'Session not found' });
      return;
    }

    // Close active SSE stream if any
    if (session.sseReply && !session.sseReply.raw.writableEnded) {
      try {
        session.sseReply.raw.end();
      } catch {
        // Ignore close errors
      }
    }

    // Clear expiry timer if pending
    if (session.expiryTimer) {
      clearTimeout(session.expiryTimer);
    }

    // Delete session
    mcpSessions.delete(sessionId);
    console.log(`MCP session ${sessionId} terminated by client DELETE request`);

    reply.code(204).send();
  });

  // Health check endpoint
  fastify.get('/health', async (): Promise<HealthResponse> => {
    const status = extensionClient.getStatus();
    return {
      status: 'ok',
      version: '1.0.6',
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
    Querystring: { sync?: string };
    Body: { params?: Record<string, string> };
  }>('/api/workflows/:id/run', async (request, reply) => {
    const workflowId = request.params.id;
    const params = request.body.params ?? {};
    const syncMode = request.query.sync === 'true';

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

    // Wire up event callback to broadcast via WebSocket
    ctx.onEvent((event) => {
      broadcaster.broadcastWorkflowEvent(event, runId);
    });

    // Track as running
    runningWorkflows.add(runId, workflowId, workflow.title, params, ctx);

    // Helper to execute and save run log
    const executeAndSave = async () => {
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

      // Send anonymous run report (fire-and-forget)
      reportRunLog(runLog, settings.reporting);

      // Remove from running and notify
      runningWorkflows.remove(runId);

      return { status, variables: ctx.variables, output_message: ctx.outputMessage };
    };

    if (syncMode) {
      // Synchronous mode: wait for workflow to complete and return results
      const result = await executeAndSave();
      return {
        status: result.status,
        run_id: runId,
        variables: result.variables,
        output_message: result.output_message,
      };
    } else {
      // Async mode: return immediately with run_id
      reply.send({ status: 'started', run_id: runId });
      // Execute workflow in background
      executeAndSave();
    }
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
      external_mcps: request.body.external_mcps ?? current.external_mcps,
      reporting: request.body.reporting ?? current.reporting,
    };
    saveSettings(config.actionsDir, updated);
    return { settings: updated };
  });

  // Get specific external MCP configuration
  fastify.get<{ Params: { mcpName: string } }>('/api/settings/mcp/:mcpName', async (request) => {
    const settings = loadSettings(config.actionsDir);
    const mcpConfig = settings.external_mcps?.find(m => m.name === request.params.mcpName);
    if (!mcpConfig) {
      return { enabled: false, error: `MCP "${request.params.mcpName}" not configured` };
    }
    return mcpConfig;
  });

  // ============================================================================
  // MCP Proxy API (for calling external MCPs)
  // ============================================================================

  // Proxy requests to external MCPs
  fastify.post<{
    Params: { mcpName: string; toolName: string };
    Body: Record<string, unknown>;
  }>('/api/mcp/:mcpName/:toolName', async (request, reply) => {
    const { mcpName, toolName } = request.params;
    const params = request.body;

    // Get MCP config from settings
    const settings = loadSettings(config.actionsDir);
    const mcpConfig = settings.external_mcps?.find(m => m.name === mcpName && m.enabled);

    if (!mcpConfig) {
      reply.status(404);
      return { error: `MCP "${mcpName}" not configured or disabled` };
    }

    // Route based on transport type
    switch (mcpConfig.transport.type) {
      case 'claude-code': {
        // For Atlassian, try direct API call if credentials are available
        if (mcpName === 'atlassian' && toolName === 'createJiraIssue') {
          // Helper to get env value from user_contexts
          const getEnvValue = (name: string): string | undefined => {
            const ctx = settings.user_contexts?.find(c => c.type === 'env' && c.name === name);
            return ctx?.type === 'env' ? ctx.value : undefined;
          };
          const userEmail = getEnvValue('JIRA_USER_EMAIL');
          const apiToken = getEnvValue('JIRA_API_TOKEN');

          if (userEmail && apiToken) {
            // Call Atlassian REST API directly
            try {
              const { cloudId, projectKey, issueTypeName, summary, description, screenshots } = params as {
                cloudId: string;
                projectKey: string;
                issueTypeName: string;
                summary: string;
                description?: string;
                screenshots?: Array<{ name: string; data: string }>;
              };

              const baseUrl = cloudId.includes('.atlassian.net')
                ? `https://${cloudId}`
                : `https://${cloudId}.atlassian.net`;

              const apiUrl = `${baseUrl}/rest/api/3/issue`;
              const auth = Buffer.from(`${userEmail}:${apiToken}`).toString('base64');

              const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Basic ${auth}`,
                  'Accept': 'application/json',
                },
                body: JSON.stringify({
                  fields: {
                    project: { key: projectKey },
                    issuetype: { name: issueTypeName || 'Task' },
                    summary: summary,
                    description: description ? {
                      type: 'doc',
                      version: 1,
                      content: [{
                        type: 'paragraph',
                        content: [{ type: 'text', text: description }]
                      }]
                    } : undefined,
                  }
                }),
              });

              if (!response.ok) {
                const errorText = await response.text();
                reply.status(response.status);
                return { error: `Atlassian API error: ${errorText}` };
              }

              const result = await response.json() as { id: string; key: string; self: string };

              // Upload screenshots as attachments if present
              const attachmentResults: Array<{ name: string; success: boolean; error?: string }> = [];
              if (screenshots && screenshots.length > 0) {
                const attachmentUrl = `${baseUrl}/rest/api/3/issue/${result.key}/attachments`;

                for (const screenshot of screenshots) {
                  try {
                    // Convert base64 data URL to binary
                    const base64Data = screenshot.data.replace(/^data:image\/\w+;base64,/, '');
                    const binaryData = Buffer.from(base64Data, 'base64');

                    // Create form data with the file
                    const boundary = '----FormBoundary' + crypto.randomUUID();
                    const formData = [
                      `--${boundary}`,
                      `Content-Disposition: form-data; name="file"; filename="${screenshot.name}"`,
                      'Content-Type: image/png',
                      '',
                      '',
                    ].join('\r\n');

                    const formDataEnd = `\r\n--${boundary}--\r\n`;
                    const formDataBuffer = Buffer.concat([
                      Buffer.from(formData),
                      binaryData,
                      Buffer.from(formDataEnd),
                    ]);

                    const attachResponse = await fetch(attachmentUrl, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Basic ${auth}`,
                        'X-Atlassian-Token': 'no-check',
                        'Content-Type': `multipart/form-data; boundary=${boundary}`,
                      },
                      body: formDataBuffer,
                    });

                    if (attachResponse.ok) {
                      attachmentResults.push({ name: screenshot.name, success: true });
                      console.log(`Attached ${screenshot.name} to ${result.key}`);
                    } else {
                      const errText = await attachResponse.text();
                      attachmentResults.push({ name: screenshot.name, success: false, error: errText });
                      console.error(`Failed to attach ${screenshot.name}: ${errText}`);
                    }
                  } catch (attachErr) {
                    attachmentResults.push({
                      name: screenshot.name,
                      success: false,
                      error: (attachErr as Error).message
                    });
                  }
                }
              }

              return {
                success: true,
                key: result.key,
                id: result.id,
                self: result.self,
                attachments: attachmentResults.length > 0 ? attachmentResults : undefined,
              };
            } catch (e) {
              reply.status(500);
              return { error: `Atlassian API call failed: ${(e as Error).message}` };
            }
          }
        }

        // Fallback: return special response indicating Claude Code should handle this
        return {
          success: true,
          transport: 'claude-code',
          tool: `mcp__${mcpName}__${toolName}`,
          params,
        };
      }

      case 'http': {
        // Forward to HTTP endpoint
        const endpoint = mcpConfig.transport.endpoint;
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: Date.now(),
              method: 'tools/call',
              params: { name: toolName, arguments: params },
            }),
          });
          return response.json();
        } catch (e) {
          reply.status(502);
          return { error: `Failed to reach MCP endpoint: ${(e as Error).message}` };
        }
      }

      case 'sse': {
        // SSE transport not yet implemented
        reply.status(501);
        return { error: 'SSE transport not yet implemented' };
      }

      default:
        reply.status(400);
        return { error: 'Unknown transport type' };
    }
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

  // Install action from website (receives YAML content directly)
  fastify.post<{ Body: { id: string; slug?: string; title?: string; yaml: string } }>('/api/actions/install', async (request, reply) => {
    const { id, slug, title, yaml: yamlContent } = request.body;

    if (!id || !yamlContent) {
      reply.status(400);
      return { error: 'Missing required fields: id and yaml' };
    }

    const filePath = path.join(config.actionsDir, `${id}.yaml`);
    fs.writeFileSync(filePath, yamlContent);
    mcpHandler.reload();

    // Broadcast to extension for badge update
    extensionClient.broadcast('workflow-installed', {
      workflowId: id,
      title: title || id,
      slug: slug || id,
    });

    return { success: true, id };
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
  // Chat Panel API
  // ============================================================================

  interface ChatMessage {
    role: 'user' | 'assistant' | 'context';
    content: string;
    pickedElements?: Array<{ tagName?: string; label?: string; text?: string }>;
    pageInfo?: { url?: string; title?: string };
  }

  interface ChatRequest {
    messages: ChatMessage[];
    context?: {
      url?: string;
      title?: string;
    };
  }

  interface ToolCall {
    id: string;
    tool: string;
    params: Record<string, unknown>;
    status: 'pending' | 'running' | 'complete' | 'error';
    result?: unknown;
    error?: string;
  }

  interface ChatResponse {
    content: string;
    toolCalls?: ToolCall[];
  }

  // Browser tools for chat assistant
  const CHAT_BROWSER_TOOLS = [
    {
      name: 'navigate',
      description: 'Navigate to a URL in the browser',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to navigate to' },
        },
        required: ['url'],
      },
    },
    {
      name: 'click',
      description: 'Click an element on the page. Use a CSS selector.',
      input_schema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the element' },
        },
        required: ['selector'],
      },
    },
    {
      name: 'type',
      description: 'Type text into an input field',
      input_schema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the input element' },
          text: { type: 'string', description: 'Text to type' },
          submit: { type: 'boolean', description: 'Press Enter after typing' },
        },
        required: ['selector', 'text'],
      },
    },
    {
      name: 'scroll',
      description: 'Scroll the page',
      input_schema: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
          amount: { type: 'number', description: 'Pixels to scroll (default 300)' },
        },
        required: ['direction'],
      },
    },
    {
      name: 'extract',
      description: 'Extract text content from an element',
      input_schema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the element' },
        },
        required: ['selector'],
      },
    },
    {
      name: 'screenshot',
      description: 'Take a screenshot of the current page',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'snapshot',
      description: 'Get an accessibility snapshot of the page structure',
      input_schema: {
        type: 'object',
        properties: {
          includeContent: { type: 'boolean', description: 'Include page text content' },
        },
      },
    },
  ];

  // Execute a browser tool via extension client
  async function executeChatBrowserTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    if (!(await extensionClient.isConnected())) {
      throw new Error('Browser not connected. Please connect a tab first.');
    }

    switch (toolName) {
      case 'navigate':
        await extensionClient.navigate(params.url as string);
        return { ok: true, message: `Navigated to ${params.url}` };
      case 'click':
        await extensionClient.click(params.selector as string);
        return { ok: true, message: `Clicked ${params.selector}` };
      case 'type':
        await extensionClient.typeText(
          params.selector as string,
          params.text as string,
          params.submit as boolean ?? false
        );
        return { ok: true, message: `Typed text into ${params.selector}` };
      case 'scroll':
        await extensionClient.scroll(
          params.direction as string,
          params.amount as number ?? 300
        );
        return { ok: true, message: `Scrolled ${params.direction}` };
      case 'extract':
        const text = await extensionClient.extract(params.selector as string);
        return { ok: true, text };
      case 'screenshot':
        const image = await extensionClient.screenshot();
        return { ok: true, message: 'Screenshot captured', hasImage: !!image };
      case 'snapshot':
        const snapshot = await extensionClient.ariaSnapshot({ includeContent: params.includeContent as boolean ?? false });
        return { ok: true, snapshot };
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // OpenAI-compatible tools format (used by OpenAI, Ollama, and compatible providers)
  const OPENAI_TOOLS = CHAT_BROWSER_TOOLS.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));

  // Chat endpoint - handles LLM calls with tool use
  fastify.post<{ Body: ChatRequest }>('/api/chat', async (request): Promise<ChatResponse> => {
    const { messages, context } = request.body;

    // Load settings for LLM config
    const settings = loadSettings(config.actionsDir);
    const llmConfig = settings.llm;

    if (!llmConfig.api_key) {
      return {
        content: 'LLM not configured. Please set your API key in the SideButton dashboard settings.',
      };
    }

    // Build system prompt
    let pageContext = '';
    if (context?.url) {
      pageContext += `Current page: ${context.url}\n`;
    }
    if (context?.title) {
      pageContext += `Page title: ${context.title}\n`;
    }

    const systemPrompt = `You are a helpful browser assistant that can interact with web pages. You have access to tools for clicking, typing, scrolling, extracting content, and taking screenshots.

${pageContext ? `Context:\n${pageContext}` : ''}

When helping users:
1. Be concise and direct
2. Use tools to take actions when asked
3. Explain what you did after completing an action
4. If you need to see the page structure, use the snapshot tool first
5. For clicking elements, use specific CSS selectors

Always confirm when an action is complete.`;

    try {
      // Route to appropriate provider handler
      if (llmConfig.provider === 'anthropic') {
        return await handleAnthropicChat(llmConfig, systemPrompt, messages);
      } else {
        // OpenAI, Ollama, and other OpenAI-compatible providers
        return await handleOpenAIChat(llmConfig, systemPrompt, messages);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: `Error: ${message}` };
    }
  });

  // Handle OpenAI-compatible API with tool support (OpenAI, Ollama, etc.)
  async function handleOpenAIChat(
    llmConfig: FullLlmConfig,
    systemPrompt: string,
    messages: ChatMessage[]
  ): Promise<ChatResponse> {
    const baseUrl = llmConfig.base_url || 'https://api.openai.com/v1';

    // Format messages for OpenAI API
    // Filter and convert context messages to user messages
    const formattedMessages = messages.map(m => {
      if (m.role === 'context') {
        // Convert context message to user message with picked elements info
        let contextContent = '[Selected elements context]\n';
        if ((m as any).pickedElements && Array.isArray((m as any).pickedElements)) {
          for (const elem of (m as any).pickedElements) {
            contextContent += `- ${elem.tagName || 'element'}: "${elem.label}"`;
            if (elem.text) {
              contextContent += `\n  Content: ${elem.text.substring(0, 200)}${elem.text.length > 200 ? '...' : ''}`;
            }
            contextContent += '\n';
          }
        }
        if ((m as any).pageInfo) {
          contextContent += `Page: ${(m as any).pageInfo.title || ''} (${(m as any).pageInfo.url || ''})\n`;
        }
        return { role: 'user', content: contextContent };
      }
      return { role: m.role, content: m.content };
    });

    const apiMessages: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }> = [
      { role: 'system', content: systemPrompt },
      ...formattedMessages,
    ];

    const requestBody = {
      model: llmConfig.model || 'gpt-5.2',
      messages: apiMessages,
      tools: OPENAI_TOOLS,
      tool_choice: 'auto',
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmConfig.api_key}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as {
      choices: Array<{
        message: {
          role: string;
          content: string | null;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: {
              name: string;
              arguments: string;
            };
          }>;
        };
        finish_reason: string;
      }>;
    };

    const choice = result.choices[0];
    if (!choice) {
      throw new Error('No response from API');
    }

    const assistantMessage = choice.message;
    let textContent = assistantMessage.content || '';
    const toolCalls: ToolCall[] = [];

    // Check for tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      for (const tc of assistantMessage.tool_calls) {
        let params: Record<string, unknown> = {};
        try {
          params = JSON.parse(tc.function.arguments);
        } catch {
          // Invalid JSON in arguments
        }
        toolCalls.push({
          id: tc.id,
          tool: tc.function.name,
          params,
          status: 'pending',
        });
      }
    }

    // If there are tool calls, execute them
    if (choice.finish_reason === 'tool_calls' && toolCalls.length > 0) {
      const toolResults: Array<{ role: string; tool_call_id: string; content: string }> = [];

      for (const tc of toolCalls) {
        tc.status = 'running';
        try {
          const toolResult = await executeChatBrowserTool(tc.tool, tc.params);
          tc.status = 'complete';
          tc.result = toolResult;
          toolResults.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(toolResult),
          });
        } catch (e) {
          tc.status = 'error';
          tc.error = e instanceof Error ? e.message : String(e);
          toolResults.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `Error: ${tc.error}`,
          });
        }
      }

      // Continue conversation with tool results
      const continueMessages = [
        ...apiMessages,
        {
          role: 'assistant',
          content: assistantMessage.content,
          tool_calls: assistantMessage.tool_calls,
        },
        ...toolResults,
      ];

      const continueResponse = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${llmConfig.api_key}`,
        },
        body: JSON.stringify({
          model: llmConfig.model || 'gpt-5.2',
          messages: continueMessages,
          tools: OPENAI_TOOLS,
          tool_choice: 'auto',
        }),
      });

      if (!continueResponse.ok) {
        throw new Error(`API error: ${continueResponse.status}`);
      }

      const continueResult = await continueResponse.json() as {
        choices: Array<{ message: { content: string | null } }>;
      };

      const finalText = continueResult.choices[0]?.message?.content || '';

      return {
        content: textContent + (finalText ? '\n\n' + finalText : ''),
        toolCalls,
      };
    }

    return { content: textContent, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  }

  // Handle Anthropic API with tool support
  async function handleAnthropicChat(
    llmConfig: FullLlmConfig,
    systemPrompt: string,
    messages: ChatMessage[]
  ): Promise<ChatResponse> {
    const baseUrl = llmConfig.base_url || 'https://api.anthropic.com/v1';

    // Format messages for Anthropic API
    // Filter and convert context messages to user messages
    const apiMessages = messages.map(m => {
      if (m.role === 'context') {
        // Convert context message to user message with picked elements info
        let contextContent = '[Selected elements context]\n';
        if ((m as any).pickedElements && Array.isArray((m as any).pickedElements)) {
          for (const elem of (m as any).pickedElements) {
            contextContent += `- ${elem.tagName || 'element'}: "${elem.label}"`;
            if (elem.text) {
              contextContent += `\n  Content: ${elem.text.substring(0, 200)}${elem.text.length > 200 ? '...' : ''}`;
            }
            contextContent += '\n';
          }
        }
        if ((m as any).pageInfo) {
          contextContent += `Page: ${(m as any).pageInfo.title || ''} (${(m as any).pageInfo.url || ''})\n`;
        }
        return { role: 'user', content: contextContent };
      }
      return { role: m.role, content: m.content };
    });

    const requestBody = {
      model: llmConfig.model || 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      tools: CHAT_BROWSER_TOOLS,
      messages: apiMessages,
    };

    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': llmConfig.api_key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as {
      content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
      stop_reason: string;
    };

    // Extract text content and tool calls
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const block of result.content) {
      if (block.type === 'text' && block.text) {
        textContent += block.text;
      } else if (block.type === 'tool_use' && block.id && block.name) {
        toolCalls.push({
          id: block.id,
          tool: block.name,
          params: block.input || {},
          status: 'pending',
        });
      }
    }

    // If there are tool calls, execute them
    if (result.stop_reason === 'tool_use' && toolCalls.length > 0) {
      const toolResults: Array<{ type: string; tool_use_id: string; content: string; is_error?: boolean }> = [];

      for (const tc of toolCalls) {
        tc.status = 'running';
        try {
          const toolResult = await executeChatBrowserTool(tc.tool, tc.params);
          tc.status = 'complete';
          tc.result = toolResult;
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: JSON.stringify(toolResult),
          });
        } catch (e) {
          tc.status = 'error';
          tc.error = e instanceof Error ? e.message : String(e);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: `Error: ${tc.error}`,
            is_error: true,
          });
        }
      }

      // Continue conversation with tool results
      const continueMessages = [
        ...apiMessages,
        { role: 'assistant' as const, content: result.content },
        { role: 'user' as const, content: toolResults },
      ];

      const continueResponse = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': llmConfig.api_key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: llmConfig.model || 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: systemPrompt,
          tools: CHAT_BROWSER_TOOLS,
          messages: continueMessages,
        }),
      });

      if (!continueResponse.ok) {
        throw new Error(`API error: ${continueResponse.status}`);
      }

      const continueResult = await continueResponse.json() as {
        content: Array<{ type: string; text?: string }>;
      };

      // Extract final text
      let finalText = '';
      for (const block of continueResult.content) {
        if (block.type === 'text' && block.text) {
          finalText += block.text;
        }
      }

      return {
        content: textContent + (finalText ? '\n\n' + finalText : ''),
        toolCalls,
      };
    }

    return { content: textContent, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  }

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

  // ============================================================================
  // One-Click Install Routes
  // ============================================================================

  // Use SIDEBUTTON_API_BASE env var for local development, defaults to production
  const SIDEBUTTON_API_BASE = process.env.SIDEBUTTON_API_BASE || 'https://sidebutton.com';

  // Helper to generate install page HTML
  function generateInstallPage(workflow: {
    id: string;
    slug: string;
    title: string;
    description: string;
    hasYaml?: boolean;
    publisher?: { name: string; verified: boolean; avatar: string } | null;
    category?: { name: string } | null;
    platform?: { name: string } | null;
  }, error?: string): string {
    const publisherHtml = workflow.publisher
      ? `<div class="publisher">
           <img src="${workflow.publisher.avatar}" alt="${workflow.publisher.name}" class="avatar">
           <span>${workflow.publisher.name}</span>
           ${workflow.publisher.verified ? '<span class="verified">✓</span>' : ''}
         </div>`
      : '';

    const platformSlug = workflow.platform?.name?.toLowerCase() || 'tools';
    const workflowSegment = workflow.slug.startsWith(platformSlug + '-')
      ? workflow.slug.slice(platformSlug.length + 1)
      : workflow.slug;
    const viewDetailsUrl = `${SIDEBUTTON_API_BASE}/integrations/${platformSlug}/${workflowSegment}`;

    const errorHtml = error
      ? `<div class="error">${error}</div>`
      : '';

    const placeholderWarningHtml = !workflow.hasYaml && !error
      ? `<div class="warning">
           <strong>Preview Only:</strong> This workflow doesn't have an implementation yet.
           A placeholder will be installed that you can customize or wait for the official release.
         </div>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Install ${workflow.title} | SideButton</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.1);
      max-width: 420px;
      width: 100%;
      padding: 32px;
    }
    .logo { text-align: center; margin-bottom: 24px; }
    .logo svg { width: 48px; height: 48px; fill: #6366f1; }
    h1 { font-size: 20px; color: #1e293b; margin-bottom: 8px; text-align: center; }
    .subtitle { color: #64748b; font-size: 14px; text-align: center; margin-bottom: 24px; }
    .workflow-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .workflow-title { font-weight: 600; color: #1e293b; margin-bottom: 4px; }
    .workflow-desc { font-size: 14px; color: #64748b; margin-bottom: 12px; }
    .publisher {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #475569;
    }
    .avatar { width: 20px; height: 20px; border-radius: 50%; }
    .verified { color: #6366f1; font-weight: bold; }
    .meta { display: flex; gap: 12px; font-size: 12px; color: #94a3b8; margin-top: 8px; }
    .error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 14px;
    }
    .warning {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #b45309;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 13px;
      line-height: 1.4;
    }
    .warning strong { color: #92400e; }
    .btn {
      display: block;
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary {
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: white;
    }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.4); }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    .btn-secondary {
      background: #f1f5f9;
      color: #475569;
      margin-top: 12px;
    }
    .btn-secondary:hover { background: #e2e8f0; }
    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid transparent;
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 8px;
      vertical-align: middle;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hidden { display: none; }
    .footer {
      text-align: center;
      margin-top: 20px;
      font-size: 12px;
      color: #94a3b8;
    }
    .footer a { color: #6366f1; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <svg viewBox="80 240 420 420"><path d="M122.96,593.43l20.99-57.86c42.5,20.99,101.38,34.82,151.55,34.82,68.61,0,112.64-26.11,112.64-75.26,0-41.47-29.18-62.98-93.18-69.12-65.54-6.14-86.53-21.5-86.53-50.18,0-31.23,29.7-48.64,90.62-48.64,26.62,0,57.34,4.1,77.82,11.78v-20.99c-19.46-7.17-47.62-11.26-77.82-11.26-53.76,0-111.1,16.9-111.1,69.12,0,41.98,31.23,64,104.96,70.66,55.81,5.12,74.75,20.48,74.75,48.64,0,35.33-32.77,54.78-92.16,54.78-49.15,0-103.93-13.31-144.38-33.79l18.94-51.2c-27.14-18.94-40.96-48.64-40.96-84.48,0-95.23,91.13-129.53,189.95-129.53,50.18,0,103.93,9.73,146.94,26.62v136.7c22.02,19.46,33.79,47.1,33.79,79.36,0,98.81-96.25,132.61-199.17,132.61-68.09,0-134.65-12.8-177.66-32.77Z"/></svg>
    </div>
    <h1>Install Workflow</h1>
    <p class="subtitle">Add this workflow to your SideButton library</p>

    ${errorHtml}
    ${placeholderWarningHtml}

    <div class="workflow-card">
      <div class="workflow-title">${workflow.title}</div>
      <div class="workflow-desc">${workflow.description}</div>
      ${publisherHtml}
      <div class="meta">
        ${workflow.category ? `<span>${workflow.category.name}</span>` : ''}
        ${workflow.platform ? `<span>${workflow.platform.name}</span>` : ''}
      </div>
    </div>

    <form id="installForm" method="POST">
      <button type="submit" class="btn btn-primary" id="installBtn">
        <span id="btnText">Install Workflow</span>
        <span id="btnLoading" class="hidden"><span class="spinner"></span>Installing...</span>
      </button>
    </form>

    <a href="${viewDetailsUrl}" class="btn btn-secondary">View Details</a>

    <div class="footer">
      <a href="${SIDEBUTTON_API_BASE}">sidebutton.com</a>
    </div>
  </div>

  <script>
    document.getElementById('installForm').addEventListener('submit', function(e) {
      document.getElementById('installBtn').disabled = true;
      document.getElementById('btnText').classList.add('hidden');
      document.getElementById('btnLoading').classList.remove('hidden');
    });
  </script>
</body>
</html>`;
  }

  // Helper to generate success page HTML
  function generateSuccessPage(workflow: { title: string; slug: string }): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Installed! | SideButton</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.1);
      max-width: 420px;
      width: 100%;
      padding: 32px;
      text-align: center;
    }
    .success-icon {
      width: 64px;
      height: 64px;
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
    }
    .success-icon svg { width: 32px; height: 32px; fill: white; }
    h1 { font-size: 22px; color: #1e293b; margin-bottom: 8px; }
    .subtitle { color: #64748b; font-size: 14px; margin-bottom: 24px; }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
      border: none;
      outline: none;
      cursor: pointer;
    }
    .btn-primary {
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: white;
    }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.4); }
    .btn-secondary {
      background: #f1f5f9;
      color: #475569;
      margin-left: 12px;
    }
    .btn-secondary:hover { background: #e2e8f0; }
    .close-note {
      margin-top: 20px;
      font-size: 12px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">
      <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
    </div>
    <h1>Workflow Installed!</h1>
    <p class="subtitle">"${workflow.title}" has been added to your library</p>
    <div>
      <button onclick="goBack()" class="btn btn-primary">Back to Website</button>
      <a href="http://localhost:${config.port}" class="btn btn-secondary">Open Dashboard</a>
    </div>
    <p class="close-note">You can close this tab</p>
  </div>
  <script>
    function goBack() {
      // Try to close if opened as popup, otherwise go back in history
      if (window.opener) {
        window.close();
      } else if (window.history.length > 2) {
        window.history.go(-2); // Go back past the install confirmation page
      } else {
        window.location.href = '${SIDEBUTTON_API_BASE}';
      }
    }
  </script>
</body>
</html>`;
  }

  // GET /install/:workflowId - Show install page
  fastify.get<{ Params: { workflowId: string } }>('/install/:workflowId', async (request, reply) => {
    const { workflowId } = request.params;

    try {
      // Fetch workflow metadata from sidebutton.com
      const response = await fetch(`${SIDEBUTTON_API_BASE}/api/workflows/${workflowId}.json`);

      if (!response.ok) {
        reply.status(404).type('text/html').send(generateInstallPage({
          id: workflowId,
          slug: workflowId,
          title: 'Workflow Not Found',
          description: `Could not find workflow: ${workflowId}`,
        }, 'Could not fetch workflow details. Install from sidebutton.com/integrations instead.'));
        return;
      }

      const workflow = await response.json() as {
        id: string;
        slug: string;
        title: string;
        description: string;
        comingSoon?: boolean;
        hasYaml?: boolean;
        publisher?: { name: string; verified: boolean; avatar: string } | null;
        category?: { name: string } | null;
        platform?: { name: string } | null;
      };

      if (workflow.comingSoon) {
        reply.type('text/html').send(generateInstallPage(workflow, 'This workflow is coming soon and cannot be installed yet.'));
        return;
      }

      reply.type('text/html').send(generateInstallPage({
        ...workflow,
        hasYaml: workflow.hasYaml ?? false,
      }));
    } catch (error) {
      console.error('Install page error:', error);
      reply.status(500).type('text/html').send(generateInstallPage({
        id: workflowId,
        slug: workflowId,
        title: 'Error',
        description: 'Failed to load workflow',
      }, 'Could not fetch workflow details. Install from sidebutton.com/integrations instead.'));
    }
  });

  // POST /install/:workflowId - Perform install
  fastify.post<{ Params: { workflowId: string } }>('/install/:workflowId', async (request, reply) => {
    const { workflowId } = request.params;

    try {
      // Fetch workflow metadata from sidebutton.com
      const metaResponse = await fetch(`${SIDEBUTTON_API_BASE}/api/workflows/${workflowId}.json`);

      if (!metaResponse.ok) {
        reply.status(404).type('text/html').send(generateInstallPage({
          id: workflowId,
          slug: workflowId,
          title: 'Workflow Not Found',
          description: `Could not find workflow: ${workflowId}`,
        }, 'Could not fetch workflow details. Install from sidebutton.com/integrations instead.'));
        return;
      }

      const metadata = await metaResponse.json() as {
        id: string;
        slug: string;
        title: string;
        description: string;
        comingSoon?: boolean;
        hasYaml?: boolean;
        yaml?: string | null;
        publisher?: { name: string; verified: boolean; avatar: string } | null;
        category?: { name: string } | null;
        platform?: { name: string } | null;
      };

      // Use actual YAML from API if available, otherwise create placeholder
      let workflowYaml: string;
      if (metadata.yaml && metadata.hasYaml) {
        workflowYaml = metadata.yaml;
      } else {
        // Create placeholder for workflows without implementation yet
        workflowYaml = `# ${metadata.title}
# Installed from sidebutton.com/marketplace/workflows/${metadata.slug}
# This is a placeholder - full workflow will be synced when available

schema_version: 1
namespace: marketplace
id: ${metadata.id}
title: "${metadata.title}"

# Workflow implementation pending
# Visit https://sidebutton.com/marketplace/workflows/${metadata.slug} for details

steps:
  - type: control.stop
    message: "This workflow is a placeholder. Check sidebutton.com for the full implementation."
`;
      }

      // Save to actions directory
      const fileName = `${metadata.id}.yaml`;
      const filePath = path.join(config.actionsDir, fileName);
      fs.writeFileSync(filePath, workflowYaml);

      // Reload workflows
      mcpHandler.reload();

      // Broadcast to extension for badge update
      extensionClient.broadcast('workflow-installed', {
        workflowId: metadata.id,
        title: metadata.title,
        slug: metadata.slug,
      });

      // Return success page
      reply.type('text/html').send(generateSuccessPage(metadata));
    } catch (error) {
      console.error('Install error:', error);
      reply.status(500).type('text/html').send(generateInstallPage({
        id: workflowId,
        slug: workflowId,
        title: 'Install Error',
        description: 'Failed to install workflow',
      }, `Installation failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
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

// ============================================================================
// Silent Server Mode (for stdio transport)
// ============================================================================

export interface SilentServerConfig {
  port: number;
  actionsDir: string;
  workflowsDir: string;
  templatesDir: string;
  runLogsDir: string;
  dashboardDir?: string;
  extensionClient: ExtensionClientImpl;
  mcpHandler: import('./mcp/handler.js').McpHandler;
}

/**
 * Start HTTP server silently (no console output)
 * Used when running in stdio mode - HTTP server provides WebSocket for browser extension
 * All logs go to stderr instead of stdout
 */
export async function startSilentServer(config: SilentServerConfig): Promise<void> {
  const fastify = Fastify({
    logger: false,
  });

  // Allow empty JSON bodies
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || body === '') {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  const { extensionClient, mcpHandler } = config;

  // Register plugins
  await fastify.register(fastifyCors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(fastifyFormbody);
  await fastify.register(fastifyWebsocket);

  // WebSocket endpoint for Chrome extension
  fastify.get('/ws', { websocket: true }, (socket) => {
    process.stderr.write('[sidebutton] Chrome extension connected\n');
    extensionClient.handleConnection(socket);
  });

  // Health check endpoint
  fastify.get('/health', async () => {
    const status = extensionClient.getStatus();
    return {
      status: 'ok',
      version: '1.0.6',
      mode: 'stdio',
      desktop_connected: status.server_running,
      browser_connected: status.browser_connected,
    };
  });

  // Basic MCP endpoint for testing (responds with error directing to stdio)
  fastify.post('/mcp', async (request, reply) => {
    reply.code(400).send({
      error: 'Server is running in stdio mode. Use stdin/stdout for MCP communication.',
    });
  });

  // Start server (no console output - use stderr)
  await fastify.listen({ port: config.port, host: '0.0.0.0' });
}
