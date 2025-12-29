<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getBrowserStatus } from "./lib/api";
  import { dashboardWs } from "./lib/websocket";
  import { viewState, mcpStatus } from "./lib/stores";
  import DrawerNav from "./lib/components/DrawerNav.svelte";
  import DashboardView from "./lib/views/DashboardView.svelte";
  import ActionsView from "./lib/views/ActionsView.svelte";
  import WorkflowsView from "./lib/views/WorkflowsView.svelte";
  import RecordingsView from "./lib/views/RecordingsView.svelte";
  import RunLogView from "./lib/views/RunLogView.svelte";
  import ActionDetailView from "./lib/views/ActionDetailView.svelte";
  import WorkflowDetailView from "./lib/views/WorkflowDetailView.svelte";
  import ExecutionView from "./lib/views/ExecutionView.svelte";
  import RecordingDetailView from "./lib/views/RecordingDetailView.svelte";
  import RunLogDetailView from "./lib/views/RunLogDetailView.svelte";
  import SettingsView from "./lib/views/SettingsView.svelte";
  import Toast from "./lib/components/Toast.svelte";

  let statusInterval: ReturnType<typeof setInterval> | null = null;

  // Global status polling - keeps connection status fresh across all views
  async function pollStatus() {
    try {
      const status = await getBrowserStatus();
      mcpStatus.set({
        server_running: status.server_running,
        browser_connected: status.browser_connected,
        error: null,
      });
    } catch (e) {
      mcpStatus.set({
        server_running: false,
        browser_connected: false,
        error: "Server not running",
      });
    }
  }

  onMount(() => {
    // Connect WebSocket
    dashboardWs.connect();

    // Initial status check
    pollStatus();
    // Poll every 3 seconds
    statusInterval = setInterval(pollStatus, 3000);
  });

  onDestroy(() => {
    if (statusInterval) {
      clearInterval(statusInterval);
    }
    dashboardWs.disconnect();
  });
</script>

<Toast />

<div class="app-layout">
  <DrawerNav />
  <main>
    {#if $viewState.current === "dashboard"}
      <DashboardView />
    {:else if $viewState.current === "actions"}
      <ActionsView />
    {:else if $viewState.current === "workflows"}
      <WorkflowsView />
    {:else if $viewState.current === "recordings"}
      <RecordingsView />
    {:else if $viewState.current === "run-logs"}
      <RunLogView />
    {:else if $viewState.current === "action-detail"}
      <ActionDetailView />
    {:else if $viewState.current === "workflow-detail"}
      <WorkflowDetailView />
    {:else if $viewState.current === "execution"}
      <ExecutionView />
    {:else if $viewState.current === "recording-detail"}
      <RecordingDetailView />
    {:else if $viewState.current === "run-log-detail"}
      <RunLogDetailView />
    {:else if $viewState.current === "settings"}
      <SettingsView />
    {/if}
  </main>
</div>

<style>
  .app-layout {
    width: 100%;
    height: 100vh;
    display: flex;
    background: #fff;
  }

  main {
    flex: 1;
    height: 100vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
