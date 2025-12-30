/**
 * REST API client for SideButton dashboard
 */

import type {
  Action,
  Recording,
  RecordingMetadata,
  RecordingStatus,
  Settings,
  RunLogMetadata,
  RunLog,
  RunningWorkflow,
  WorkflowStats,
} from './types';

const API_BASE = 'http://localhost:9876';

/**
 * Fetch helper with error handling
 */
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const fetchOptions: RequestInit = { ...options };

  // Only set Content-Type header when there's a body
  if (options?.body) {
    fetchOptions.headers = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };
  }

  const response = await fetch(`${API_BASE}${url}`, fetchOptions);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// Status API
// ============================================================================

export interface McpStatusResponse {
  server_running: boolean;
  browser_connected: boolean;
  tab_id?: number;
  recording: boolean;
}

export async function getBrowserStatus(): Promise<McpStatusResponse> {
  try {
    const data = await apiFetch<{
      status: string;
      browser_connected: boolean;
      server_running: boolean;
    }>('/health');
    return {
      server_running: data.server_running,
      browser_connected: data.browser_connected,
      tab_id: undefined,
      recording: false,
    };
  } catch {
    return {
      server_running: false,
      browser_connected: false,
      recording: false,
    };
  }
}

// ============================================================================
// Workflows API
// ============================================================================

export async function listWorkflows(): Promise<Action[]> {
  const data = await apiFetch<{ workflows: Action[] }>('/api/workflows');
  return data.workflows;
}

export async function getWorkflow(id: string): Promise<Action> {
  const data = await apiFetch<{ workflow: Action }>(`/api/workflows/${id}`);
  return data.workflow;
}

export async function runWorkflow(
  id: string,
  params?: Record<string, string>
): Promise<{ run_id: string }> {
  const data = await apiFetch<{ status: string; run_id: string }>(
    `/api/workflows/${id}/run`,
    {
      method: 'POST',
      body: JSON.stringify({ params }),
    }
  );
  return { run_id: data.run_id };
}

export async function getWorkflowStats(id: string): Promise<WorkflowStats> {
  const data = await apiFetch<{ stats: WorkflowStats }>(`/api/workflows/${id}/stats`);
  return data.stats;
}

export async function copyWorkflowToActions(id: string): Promise<Action> {
  const data = await apiFetch<{ action: Action }>(`/api/workflows/${id}/copy-to-actions`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return data.action;
}

// ============================================================================
// Actions API
// ============================================================================

export async function listActions(): Promise<Action[]> {
  const data = await apiFetch<{ actions: Action[] }>('/api/actions');
  return data.actions;
}

export async function getAction(id: string): Promise<Action> {
  const data = await apiFetch<{ action: Action }>(`/api/actions/${id}`);
  return data.action;
}

export async function createAction(action: Action): Promise<Action> {
  const data = await apiFetch<{ action: Action }>('/api/actions', {
    method: 'POST',
    body: JSON.stringify(action),
  });
  return data.action;
}

export async function updateAction(id: string, action: Action): Promise<Action> {
  const data = await apiFetch<{ action: Action }>(`/api/actions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(action),
  });
  return data.action;
}

export async function deleteAction(id: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(`/api/actions/${id}`, {
    method: 'DELETE',
  });
}

export async function publishAction(id: string): Promise<Action> {
  const data = await apiFetch<{ workflow: Action }>(`/api/actions/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return data.workflow;
}

// ============================================================================
// Run Logs API
// ============================================================================

export async function listRunLogs(
  limit = 20,
  workflowId?: string
): Promise<RunLogMetadata[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (workflowId) params.append('workflow_id', workflowId);

  const data = await apiFetch<{ runs: RunLogMetadata[] }>(`/api/runs?${params}`);
  return data.runs;
}

export async function getRunLog(runId: string): Promise<RunLog> {
  const data = await apiFetch<{ run_log: RunLog }>(`/api/runs/${runId}`);
  return data.run_log;
}

export async function deleteRunLog(id: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(`/api/runs/${id}`, {
    method: 'DELETE',
  });
}

export async function clearRunLogs(): Promise<number> {
  const data = await apiFetch<{ deleted: number }>('/api/runs', {
    method: 'DELETE',
  });
  return data.deleted;
}

// ============================================================================
// Running Workflows API
// ============================================================================

export async function getRunningWorkflows(): Promise<RunningWorkflow[]> {
  const data = await apiFetch<{ workflows: RunningWorkflow[] }>('/api/running-workflows');
  return data.workflows ?? [];
}

export async function stopWorkflow(runId: string): Promise<void> {
  await apiFetch<{ cancelled: boolean }>(`/api/running-workflows/${runId}/stop`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function cancelWorkflow(workflowId: string): Promise<void> {
  await apiFetch<{ cancelled: boolean }>(`/api/workflows/${workflowId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// ============================================================================
// Recordings API
// ============================================================================

export async function listRecordings(): Promise<RecordingMetadata[]> {
  const data = await apiFetch<{ recordings: RecordingMetadata[] }>('/api/recordings');
  return data.recordings;
}

export async function getRecording(id: string): Promise<Recording> {
  const data = await apiFetch<{ recording: Recording }>(`/api/recordings/${id}`);
  return data.recording;
}

export async function deleteRecording(id: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(`/api/recordings/${id}`, {
    method: 'DELETE',
  });
}

export async function startRecording(): Promise<void> {
  await apiFetch<{ status: string }>('/api/recordings/start', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function stopRecording(): Promise<Recording> {
  const data = await apiFetch<{ recording: Recording }>('/api/recordings/stop', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return data.recording;
}

export async function getRecordingStatus(): Promise<RecordingStatus> {
  const data = await apiFetch<{ status: RecordingStatus }>('/api/recordings/status');
  return data.status;
}

export async function convertRecording(id: string): Promise<Action> {
  const data = await apiFetch<{ workflow: Action }>(`/api/recordings/${id}/convert`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return data.workflow;
}

export async function convertRecordingWithLLM(id: string): Promise<Action> {
  const data = await apiFetch<{ workflow: Action }>(`/api/recordings/${id}/convert-llm`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return data.workflow;
}

// ============================================================================
// Settings API
// ============================================================================

export async function getSettings(): Promise<Settings> {
  const data = await apiFetch<{ settings: Settings }>('/api/settings');
  return data.settings;
}

export async function saveSettings(settings: Partial<Settings>): Promise<Settings> {
  const data = await apiFetch<{ settings: Settings }>('/api/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
  return data.settings;
}

// ============================================================================
// Utility API
// ============================================================================

export async function reloadAll(): Promise<void> {
  await apiFetch<{ reloaded: boolean }>('/api/reload', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function getWebSocketUrl(): string {
  return `ws://localhost:9876/ws/dashboard`;
}
