import { writable, derived } from "svelte/store";
import type {
  Action,
  LogEntry,
  ViewState,
  McpStatus,
  RunningWorkflow,
  WorkflowStats,
  RecordingMetadata,
  RecordingStatus,
  Settings,
  WorkflowEvent,
} from "./types";

// ============================================================================
// Data Stores
// ============================================================================

// Actions list (user-created, from /actions directory)
export const actions = writable<Action[]>([]);

// Workflows list (pre-defined, from /workflows directory)
export const workflows = writable<Action[]>([]);

// Recordings list
export const recordings = writable<RecordingMetadata[]>([]);

// Recording status (is recording active, event count)
export const recordingStatus = writable<RecordingStatus>({
  is_recording: false,
  event_count: 0,
});

// Settings (LLM config, shortcuts, user contexts)
export const settings = writable<Settings | null>(null);

// MCP/Browser connection status
export const mcpStatus = writable<McpStatus>({
  server_running: false,
  browser_connected: false,
  error: null,
});

// Currently running workflows
export const runningWorkflows = writable<RunningWorkflow[]>([]);

// Workflow run statistics (keyed by workflow_id)
export const workflowStats = writable<Record<string, WorkflowStats>>({});

// ============================================================================
// Execution State
// ============================================================================

// Execution log entries (for ExecutionView)
export const logs = writable<LogEntry[]>([]);

// Execution state flags
export const isRunning = writable(false);
export const currentActionId = writable<string | null>(null);
export const currentRunId = writable<string | null>(null);

// Helper function to add log entry
export function addLog(message: string, type: string = "info", depth: number = 0) {
  const timestamp = new Date().toLocaleTimeString();
  logs.update((entries) => [...entries, { timestamp, message, type, depth }]);
}

// Helper function to clear logs
export function clearLogs() {
  logs.set([]);
}

// Helper to handle incoming workflow events
export function handleWorkflowEvent(event: WorkflowEvent) {
  const message = formatEventMessage(event);
  const type = event.type;
  const depth = event.depth;
  addLog(message, type, depth);
}

function formatEventMessage(event: WorkflowEvent): string {
  switch (event.type) {
    case 'workflow_start':
      return `Running: ${event.action_title} (${event.action_id})`;
    case 'workflow_end':
      return event.success
        ? `Completed: ${event.action_id}`
        : `Failed: ${event.action_id} - ${event.message ?? 'Unknown error'}`;
    case 'step_start':
      return `Step ${event.step_index + 1}: ${event.step_type}${event.step_details ? ` - ${event.step_details}` : ''}`;
    case 'step_end':
      return event.success
        ? `Step ${event.step_index + 1} completed${event.result ? `: ${event.result}` : ''}`
        : `Step ${event.step_index + 1} failed: ${event.message ?? 'Unknown error'}`;
    case 'log':
      return `[${event.level.toUpperCase()}] ${event.message}`;
    case 'error':
      return `Error: ${event.message}`;
  }
}

// ============================================================================
// View Navigation State
// ============================================================================

export const viewState = writable<ViewState>({
  current: "dashboard",
  activePage: "dashboard",
  selectedActionId: null,
  selectedWorkflowId: null,
  selectedRecordingId: null,
  selectedRunLogId: null,
});

// ============================================================================
// URL Routing
// ============================================================================

const pageToPath: Record<string, string> = {
  dashboard: "/",
  actions: "/actions",
  workflows: "/workflows",
  recordings: "/recordings",
  "run-logs": "/run-logs",
};

function updateUrl(path: string) {
  if (typeof window !== "undefined" && window.location.pathname !== path) {
    history.pushState(null, "", path);
  }
}

/** Read URL path on startup and set viewState accordingly */
export function initFromUrl() {
  if (typeof window === "undefined") return;

  const path = window.location.pathname;
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0 || segments[0] === "dashboard") {
    // default — do nothing, already on dashboard
    return;
  }

  const base: ViewState = {
    current: "dashboard",
    activePage: "dashboard",
    selectedActionId: null,
    selectedWorkflowId: null,
    selectedRecordingId: null,
    selectedRunLogId: null,
  };

  switch (segments[0]) {
    case "actions":
      if (segments[1]) {
        viewState.set({ ...base, current: "action-detail", activePage: "actions", selectedActionId: segments[1] });
      } else {
        viewState.set({ ...base, current: "actions", activePage: "actions" });
      }
      break;
    case "workflows":
      if (segments[1]) {
        viewState.set({ ...base, current: "workflow-detail", activePage: "workflows", selectedWorkflowId: segments[1] });
      } else {
        viewState.set({ ...base, current: "workflows", activePage: "workflows" });
      }
      break;
    case "recordings":
      if (segments[1]) {
        viewState.set({ ...base, current: "recording-detail", activePage: "recordings", selectedRecordingId: segments[1] });
      } else {
        viewState.set({ ...base, current: "recordings", activePage: "recordings" });
      }
      break;
    case "run-logs":
      if (segments[1]) {
        viewState.set({ ...base, current: "run-log-detail", activePage: "run-logs", selectedRunLogId: segments[1] });
      } else {
        viewState.set({ ...base, current: "run-logs", activePage: "run-logs" });
      }
      break;
    case "settings":
      viewState.set({ ...base, current: "settings" });
      break;
  }
}

/** Listen for browser back/forward and sync viewState */
export function setupUrlListener() {
  if (typeof window === "undefined") return;
  window.addEventListener("popstate", () => {
    initFromUrl();
  });
}

// ============================================================================
// Derived Stores
// ============================================================================

// Derived store for selected action
export const selectedAction = derived(
  [actions, viewState],
  ([$actions, $viewState]) => {
    if (!$viewState.selectedActionId) return null;
    return $actions.find((a) => a.id === $viewState.selectedActionId) || null;
  }
);

// Derived store for selected workflow
export const selectedWorkflow = derived(
  [workflows, viewState],
  ([$workflows, $viewState]) => {
    if (!$viewState.selectedWorkflowId) return null;
    return $workflows.find((w) => w.id === $viewState.selectedWorkflowId) || null;
  }
);

// Derived store for selected recording
export const selectedRecording = derived(
  [recordings, viewState],
  ([$recordings, $viewState]) => {
    if (!$viewState.selectedRecordingId) return null;
    return $recordings.find((r) => r.id === $viewState.selectedRecordingId) || null;
  }
);

// ============================================================================
// Navigation Helpers
// ============================================================================

// Main page navigation (drawer)
export function navigateToDashboard() {
  viewState.set({
    current: "dashboard",
    activePage: "dashboard",
    selectedActionId: null,
    selectedWorkflowId: null,
    selectedRecordingId: null,
    selectedRunLogId: null,
  });
  updateUrl("/");
}

export function navigateToActions() {
  viewState.set({
    current: "actions",
    activePage: "actions",
    selectedActionId: null,
    selectedWorkflowId: null,
    selectedRecordingId: null,
    selectedRunLogId: null,
  });
  updateUrl("/actions");
}

export function navigateToWorkflows() {
  viewState.set({
    current: "workflows",
    activePage: "workflows",
    selectedActionId: null,
    selectedWorkflowId: null,
    selectedRecordingId: null,
    selectedRunLogId: null,
  });
  updateUrl("/workflows");
}

export function navigateToRecordings() {
  viewState.set({
    current: "recordings",
    activePage: "recordings",
    selectedActionId: null,
    selectedWorkflowId: null,
    selectedRecordingId: null,
    selectedRunLogId: null,
  });
  updateUrl("/recordings");
}

export function navigateToRunLogs() {
  viewState.set({
    current: "run-logs",
    activePage: "run-logs",
    selectedActionId: null,
    selectedWorkflowId: null,
    selectedRecordingId: null,
    selectedRunLogId: null,
  });
  updateUrl("/run-logs");
}

// Detail navigation
export function navigateToActionDetail(actionId: string) {
  viewState.update((state) => ({
    ...state,
    current: "action-detail",
    selectedActionId: actionId,
  }));
  updateUrl(`/actions/${actionId}`);
}

export function navigateToWorkflowDetail(workflowId: string) {
  viewState.update((state) => ({
    ...state,
    current: "workflow-detail",
    selectedWorkflowId: workflowId,
  }));
  updateUrl(`/workflows/${workflowId}`);
}

export function navigateToRecordingDetail(recordingId: string) {
  viewState.update((state) => ({
    ...state,
    current: "recording-detail",
    selectedRecordingId: recordingId,
  }));
  updateUrl(`/recordings/${recordingId}`);
}

export function navigateToRunLogDetail(runLogId: string) {
  viewState.update((state) => ({
    ...state,
    current: "run-log-detail",
    selectedRunLogId: runLogId,
  }));
  updateUrl(`/run-logs/${runLogId}`);
}

// Execution navigation
export function navigateToExecution(actionId: string, runId?: string) {
  clearLogs();
  isRunning.set(true);
  viewState.update((state) => ({
    ...state,
    current: "execution",
    selectedActionId: actionId,
  }));
  if (runId) {
    currentRunId.set(runId);
  }
}

export function navigateToWorkflowExecution(workflowId: string, runId?: string) {
  clearLogs();
  isRunning.set(true);
  viewState.update((state) => ({
    ...state,
    current: "execution",
    selectedWorkflowId: workflowId,
    selectedActionId: null,
  }));
  if (runId) {
    currentRunId.set(runId);
  }
}

// Navigate to execution view for a running workflow by run_id
export function navigateToRunningExecution(runId: string, workflowId: string) {
  clearLogs();
  isRunning.set(true);
  currentRunId.set(runId);
  viewState.update((state) => ({
    ...state,
    current: "execution",
    selectedActionId: workflowId,
    selectedWorkflowId: null,
  }));
}

// Settings navigation
export function navigateToSettings() {
  viewState.update((state) => ({ ...state, current: "settings" }));
  updateUrl("/settings");
}

// Back navigation (returns to active page)
export function navigateBack() {
  viewState.update((state) => {
    updateUrl(pageToPath[state.activePage] ?? "/");
    return {
      ...state,
      current: state.activePage,
      selectedActionId: null,
      selectedWorkflowId: null,
      selectedRecordingId: null,
      selectedRunLogId: null,
    };
  });
}

// ============================================================================
// Toast Notifications
// ============================================================================

export interface Toast {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
}

export const toasts = writable<Toast[]>([]);

let toastId = 0;

export function showToast(message: string, type: Toast["type"] = "info", duration = 3000) {
  const id = `toast_${++toastId}`;
  toasts.update(t => [...t, { id, type, message }]);

  if (duration > 0) {
    setTimeout(() => removeToast(id), duration);
  }
}

export function removeToast(id: string) {
  toasts.update(t => t.filter(toast => toast.id !== id));
}

