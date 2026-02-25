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
  selectedSkillDomain: null,
  selectedModulePath: null,
  selectedAgentId: null,
};

const router = navaid("/", () => {
  // 404 — fall back to dashboard
  viewState.set({ ...base });
});

router
  .on("/", () => {
    viewState.set({ ...base });
  })
  // Skills (replaces Actions)
  .on("/skills", () => {
    viewState.set({ ...base, current: "skills", activePage: "skills" });
  })
  .on("/skills/:domain", (params) => {
    viewState.set({
      ...base,
      current: "skill-detail",
      activePage: "skills",
      selectedSkillDomain: params!.domain,
    });
  })
  .on("/skills/:domain/:module", (params) => {
    viewState.set({
      ...base,
      current: "module-detail",
      activePage: "dashboard",
      selectedSkillDomain: params!.domain,
      selectedModulePath: params!.module,
    });
  })
  // Library (replaces Workflows)
  .on("/library", () => {
    viewState.set({ ...base, current: "library", activePage: "library" });
  })
  // Agents (new)
  .on("/agents", () => {
    viewState.set({ ...base, current: "agents", activePage: "agents" });
  })
  .on("/agents/:id", (params) => {
    viewState.set({
      ...base,
      current: "agent-detail",
      activePage: "agents",
      selectedAgentId: params!.id,
    });
  })
  // Recordings (unchanged)
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
  // Run logs (still accessible, just not in nav)
  .on("/run-logs", () => {
    viewState.set({ ...base, current: "run-logs", activePage: "skills" });
  })
  .on("/run-logs/:id", (params) => {
    viewState.set({
      ...base,
      current: "run-log-detail",
      activePage: "skills",
      selectedRunLogId: params!.id,
    });
  })
  // Redirects for old routes
  .on("/actions", () => {
    router.route("/skills");
  })
  .on("/actions/:id", () => {
    router.route("/skills");
  })
  .on("/workflows", () => {
    router.route("/library");
  })
  .on("/workflows/:id", () => {
    router.route("/library");
  })
  // Settings
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
  skills: "/skills",
  library: "/library",
  agents: "/agents",
  recordings: "/recordings",
};

// Main page navigation (drawer)
export function navigateToDashboard() {
  router.route("/");
}

export function navigateToSkills() {
  router.route("/skills");
}

export function navigateToLibrary() {
  router.route("/library");
}

export function navigateToAgents() {
  router.route("/agents");
}

export function navigateToRecordings() {
  router.route("/recordings");
}

export function navigateToRunLogs() {
  router.route("/run-logs");
}

// Detail navigation
export function navigateToSkillDetail(domain: string) {
  router.route(`/skills/${domain}`);
}

export function navigateToModuleDetail(domain: string, modulePath: string) {
  router.route(`/skills/${domain}/${modulePath}`);
}

export function navigateToAgentDetail(agentId: string) {
  router.route(`/agents/${agentId}`);
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
