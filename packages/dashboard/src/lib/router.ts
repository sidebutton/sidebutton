import navaid from "navaid";
import { get } from "svelte/store";
import { viewState, clearLogs, isRunning, currentRunId } from "./stores";
import type { ViewState } from "./types";

const base: ViewState = {
  current: "dashboard",
  activePage: "dashboard",
  selectedActionId: null,
  selectedWorkflowId: null,
  selectedRecordingId: null,
  selectedRunLogId: null,
};

const router = navaid("/", () => {
  // 404 — fall back to dashboard
  viewState.set({ ...base });
});

router
  .on("/", () => {
    viewState.set({ ...base });
  })
  .on("/actions", () => {
    viewState.set({ ...base, current: "actions", activePage: "actions" });
  })
  .on("/actions/:id", (params) => {
    viewState.set({
      ...base,
      current: "action-detail",
      activePage: "actions",
      selectedActionId: params!.id,
    });
  })
  .on("/workflows", () => {
    viewState.set({ ...base, current: "workflows", activePage: "workflows" });
  })
  .on("/workflows/:id", (params) => {
    viewState.set({
      ...base,
      current: "workflow-detail",
      activePage: "workflows",
      selectedWorkflowId: params!.id,
    });
  })
  .on("/recordings", () => {
    viewState.set({ ...base, current: "recordings", activePage: "recordings" });
  })
  .on("/recordings/:id", (params) => {
    viewState.set({
      ...base,
      current: "recording-detail",
      activePage: "recordings",
      selectedRecordingId: params!.id,
    });
  })
  .on("/run-logs", () => {
    viewState.set({ ...base, current: "run-logs", activePage: "run-logs" });
  })
  .on("/run-logs/:id", (params) => {
    viewState.set({
      ...base,
      current: "run-log-detail",
      activePage: "run-logs",
      selectedRunLogId: params!.id,
    });
  })
  .on("/settings", () => {
    viewState.set({ ...base, current: "settings" });
  });

export function startRouter() {
  router.listen();
}

// ============================================================================
// Navigation Helpers
// ============================================================================

const pageToPath: Record<string, string> = {
  dashboard: "/",
  actions: "/actions",
  workflows: "/workflows",
  recordings: "/recordings",
  "run-logs": "/run-logs",
};

// Main page navigation (drawer)
export function navigateToDashboard() {
  router.route("/");
}

export function navigateToActions() {
  router.route("/actions");
}

export function navigateToWorkflows() {
  router.route("/workflows");
}

export function navigateToRecordings() {
  router.route("/recordings");
}

export function navigateToRunLogs() {
  router.route("/run-logs");
}

// Detail navigation
export function navigateToActionDetail(actionId: string) {
  router.route(`/actions/${actionId}`);
}

export function navigateToWorkflowDetail(workflowId: string) {
  router.route(`/workflows/${workflowId}`);
}

export function navigateToRecordingDetail(recordingId: string) {
  router.route(`/recordings/${recordingId}`);
}

export function navigateToRunLogDetail(runLogId: string) {
  router.route(`/run-logs/${runLogId}`);
}

// Settings navigation
export function navigateToSettings() {
  router.route("/settings");
}

// Execution navigation — transient state, no URL change
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

// Back navigation (returns to active page)
export function navigateBack() {
  const state = get(viewState);
  const path = pageToPath[state.activePage] ?? "/";
  router.route(path);
}
