/**
 * WebSocket client for real-time dashboard events
 * Connects to /ws/dashboard endpoint on the server
 */

import { get } from 'svelte/store';
import {
  runningWorkflows,
  recordingStatus,
  mcpStatus,
  handleWorkflowEvent,
  isRunning,
  currentRunId,
} from './stores';
import type { WorkflowEvent, RunningWorkflow, RecordingStatus } from './types';

// WebSocket URL for dashboard events
const WS_URL = 'ws://localhost:9876/ws/dashboard';

// Message types from server
interface WsMessage {
  type: string;
  data: unknown;
}

// WorkflowEvent with run_id added for WebSocket messages
type WorkflowEventData = WorkflowEvent & { run_id: string };

interface RunningWorkflowsChangedData {
  workflows: RunningWorkflow[];
}

interface RecordingStatusData {
  is_recording: boolean;
  event_count: number;
}

interface ExtensionStatusData {
  connected: boolean;
}

// Event callback type for external listeners
type EventCallback = (event: WsMessage) => void;

/**
 * Dashboard WebSocket client with auto-reconnect
 */
class DashboardWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 2000;
  private isConnecting = false;
  private listeners: EventCallback[] = [];

  /**
   * Connect to the dashboard WebSocket
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('[WS] Connected to dashboard');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        mcpStatus.update((s) => ({ ...s, server_running: true }));
      };

      this.ws.onclose = () => {
        console.log('[WS] Disconnected from dashboard');
        this.isConnecting = false;
        this.ws = null;
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        this.isConnecting = false;
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WsMessage;
          this.handleMessage(message);
          // Notify external listeners
          for (const listener of this.listeners) {
            try {
              listener(message);
            } catch (e) {
              console.error('[WS] Listener error:', e);
            }
          }
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
        }
      };
    } catch (e) {
      console.error('[WS] Failed to connect:', e);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Add an event listener
   */
  onEvent(callback: EventCallback): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WS] Max reconnect attempts reached');
      mcpStatus.update((s) => ({ ...s, server_running: false }));
      return;
    }

    if (this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private handleMessage(message: WsMessage): void {
    switch (message.type) {
      case 'workflow-event':
        this.handleWorkflowEventMessage(message.data as WorkflowEventData);
        break;

      case 'running-workflows-changed':
        this.handleRunningWorkflowsChanged(message.data as RunningWorkflowsChangedData);
        break;

      case 'recording-status':
        this.handleRecordingStatus(message.data as RecordingStatusData);
        break;

      case 'extension-status':
        this.handleExtensionStatus(message.data as ExtensionStatusData);
        break;

      default:
        console.log('[WS] Unknown message type:', message.type);
    }
  }

  private handleWorkflowEventMessage(data: WorkflowEventData): void {
    // Only process events for the current run
    const activeRunId = get(currentRunId);
    if (activeRunId && data.run_id === activeRunId) {
      handleWorkflowEvent(data);

      // Update isRunning based on event type
      if (data.type === 'workflow_end' || data.type === 'error') {
        // Check if this is the top-level workflow completion (depth 0)
        if (data.depth === 0) {
          isRunning.set(false);
        }
      }
    }
  }

  private handleRunningWorkflowsChanged(data: RunningWorkflowsChangedData): void {
    runningWorkflows.set(data.workflows);

    // If current run is no longer in the list, it completed
    const activeRunId = get(currentRunId);
    if (activeRunId) {
      const stillRunning = data.workflows.some((w) => w.run_id === activeRunId);
      if (!stillRunning) {
        isRunning.set(false);
      }
    }
  }

  private handleRecordingStatus(data: RecordingStatusData): void {
    const status: RecordingStatus = {
      is_recording: data.is_recording,
      event_count: data.event_count,
    };
    recordingStatus.set(status);
  }

  private handleExtensionStatus(data: ExtensionStatusData): void {
    mcpStatus.update((s) => ({
      ...s,
      browser_connected: data.connected,
    }));
  }
}

// Singleton instance
export const dashboardWs = new DashboardWebSocket();

/**
 * Initialize WebSocket connection
 * Call this when the dashboard loads
 */
export function initWebSocket(): void {
  dashboardWs.connect();
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    dashboardWs.disconnect();
  });
}
