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
  ContextConfig,
  PersonaContext,
  RoleContext,
  TargetContext,
  ProviderStatus,
  ConnectorType,
  InstalledPack,
  SkillPackDetail,
  ContextSummary,
  SkillModule,
  AgentJob,
  AgentPreset,
  Publisher,
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

export async function getAllWorkflowStats(): Promise<Record<string, WorkflowStats>> {
  const data = await apiFetch<{ stats: Record<string, WorkflowStats> }>('/api/workflows/stats');
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

// ============================================================================
// Context API (persona, roles, targets)
// ============================================================================

export async function getContextAll(): Promise<ContextConfig> {
  return apiFetch<ContextConfig>('/api/context');
}

export async function updatePersona(body: string): Promise<PersonaContext> {
  const data = await apiFetch<{ persona: PersonaContext }>('/api/context/persona', {
    method: 'PUT',
    body: JSON.stringify({ body }),
  });
  return data.persona;
}

export async function getRoles(): Promise<RoleContext[]> {
  const data = await apiFetch<{ roles: RoleContext[] }>('/api/context/roles');
  return data.roles;
}

export async function createRole(role: { name: string; match: string[]; enabled?: boolean; body: string }): Promise<RoleContext> {
  const data = await apiFetch<{ role: RoleContext }>('/api/context/roles', {
    method: 'POST',
    body: JSON.stringify(role),
  });
  return data.role;
}

export async function updateRole(filename: string, role: { name: string; match: string[]; enabled?: boolean; body: string }): Promise<RoleContext> {
  const data = await apiFetch<{ role: RoleContext }>(`/api/context/roles/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    body: JSON.stringify(role),
  });
  return data.role;
}

export async function deleteRole(filename: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(`/api/context/roles/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
}

export async function getTargets(): Promise<TargetContext[]> {
  const data = await apiFetch<{ targets: TargetContext[] }>('/api/context/targets');
  return data.targets;
}

export async function createTarget(target: { name: string; match: string[]; enabled?: boolean; body: string }): Promise<TargetContext> {
  const data = await apiFetch<{ target: TargetContext }>('/api/context/targets', {
    method: 'POST',
    body: JSON.stringify(target),
  });
  return data.target;
}

export async function updateTarget(filename: string, target: { name: string; match: string[]; enabled?: boolean; body: string }): Promise<TargetContext> {
  const data = await apiFetch<{ target: TargetContext }>(`/api/context/targets/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    body: JSON.stringify(target),
  });
  return data.target;
}

export async function deleteTarget(filename: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(`/api/context/targets/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// Provider Status API
// ============================================================================

export async function getProviderStatuses(): Promise<ProviderStatus[]> {
  const data = await apiFetch<{ providers: ProviderStatus[] }>('/api/providers/status');
  return data.providers;
}

export async function setProviderConnector(
  providerId: string,
  connector: ConnectorType | null,
): Promise<{ success: boolean; provider: string; connector: ConnectorType | null }> {
  return apiFetch(`/api/providers/${encodeURIComponent(providerId)}/connector`, {
    method: 'POST',
    body: JSON.stringify({ connector }),
  });
}

// ============================================================================
// Skills API
// ============================================================================

export async function fetchSkillPacks(): Promise<InstalledPack[]> {
  const data = await apiFetch<{ packs: InstalledPack[] }>('/api/skills');
  return data.packs;
}

export async function fetchSkillPackDetail(domain: string): Promise<SkillPackDetail> {
  return apiFetch<SkillPackDetail>(`/api/skills/${encodeURIComponent(domain)}`);
}

export async function installSkillPack(source: string): Promise<InstalledPack> {
  return apiFetch<InstalledPack>('/api/skills/install', {
    method: 'POST',
    body: JSON.stringify({ source }),
  });
}

export async function uninstallSkillPack(domain: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(`/api/skills/${encodeURIComponent(domain)}`, {
    method: 'DELETE',
  });
}

export async function fetchContextSummary(): Promise<ContextSummary> {
  return apiFetch<ContextSummary>('/api/context/summary');
}

// ============================================================================
// Skill Modules API
// ============================================================================

export async function fetchSkillModules(domain: string): Promise<SkillModule[]> {
  const data = await apiFetch<{ modules: SkillModule[] }>(`/api/skills/${encodeURIComponent(domain)}/modules`);
  return data.modules;
}

// ============================================================================
// Agents API
// ============================================================================

export async function fetchAgents(): Promise<{ running: AgentJob[]; completed: AgentJob[] }> {
  return apiFetch<{ running: AgentJob[]; completed: AgentJob[] }>('/api/agents');
}

export async function startAgent(params: {
  role: string;
  prompt: string;
  workflow_id?: string;
  skill_pack?: string;
}): Promise<AgentJob> {
  const data = await apiFetch<{ agent: AgentJob }>('/api/agents/start', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return data.agent;
}

export async function stopAgent(agentId: string): Promise<void> {
  await apiFetch<{ stopped: boolean }>(`/api/agents/${encodeURIComponent(agentId)}/stop`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function fetchAgentPresets(): Promise<AgentPreset[]> {
  const data = await apiFetch<{ presets: AgentPreset[] }>('/api/agents/presets');
  return data.presets;
}

export async function updateAgentAvatar(
  agentId: string,
  options: { preset_id?: string; avatar_url?: string | null }
): Promise<{ avatar_url: string | null }> {
  return apiFetch<{ avatar_url: string | null }>(`/api/agents/${encodeURIComponent(agentId)}/avatar`, {
    method: 'PUT',
    body: JSON.stringify(options),
  });
}

export async function uploadAgentAvatar(file: File): Promise<{ url: string }> {
  const response = await fetch(`${API_BASE}/api/agents/avatars/upload`, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: await file.arrayBuffer(),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }
  return response.json();
}

// ============================================================================
// Registries (Publishers) API
// ============================================================================

export async function fetchRegistries(): Promise<Publisher[]> {
  const data = await apiFetch<{ registries: Publisher[] }>('/api/registries');
  return data.registries;
}

export async function addRegistry(url: string, name?: string): Promise<void> {
  await apiFetch<unknown>('/api/registries', {
    method: 'POST',
    body: JSON.stringify({ url, name }),
  });
}

export async function removeRegistry(name: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(`/api/registries/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export interface CatalogPack {
  name: string;
  domain: string;
  version: string;
  title: string;
  description: string;
  path: string;
  installed: boolean;
  installedVersion?: string;
}

export async function fetchRegistryCatalog(registryName: string): Promise<{ name: string; packs: CatalogPack[] }> {
  return apiFetch<{ name: string; packs: CatalogPack[] }>(`/api/registries/${encodeURIComponent(registryName)}/catalog`);
}
