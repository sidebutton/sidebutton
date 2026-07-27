<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getBrowserStatus } from "./lib/api";
  import { dashboardWs } from "./lib/websocket";
  import { viewState, mcpStatus, navOpen } from "./lib/stores";
  import { startRouter } from "./lib/router";
  import DrawerNav from "./lib/components/DrawerNav.svelte";
  import Logo from "./lib/components/Logo.svelte";
  import DashboardView from "./lib/views/DashboardView.svelte";
  import SkillsView from "./lib/views/SkillsView.svelte";
  import LibraryView from "./lib/views/LibraryView.svelte";
  import AgentsView from "./lib/views/AgentsView.svelte";
  import RecordingsView from "./lib/views/RecordingsView.svelte";
  import ModuleDetailView from "./lib/views/ModuleDetailView.svelte";
  import RunLogView from "./lib/views/RunLogView.svelte";
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
    startRouter();

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

{#if $navOpen}
  <div class="nav-overlay" role="presentation" onclick={() => navOpen.set(false)}></div>
{/if}

<div class="app-layout">
  <DrawerNav />
  <main>
    <div class="mobile-topbar">
      <button class="hamburger-btn" onclick={() => navOpen.set(true)} aria-label="Open menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>
      <Logo size={20} />
      <span class="topbar-title">SideButton</span>
    </div>
    {#if $viewState.current === "dashboard"}
      <DashboardView />
    {:else if $viewState.current === "skills" || $viewState.current === "skill-detail"}
      <SkillsView />
    {:else if $viewState.current === "module-detail"}
      <ModuleDetailView />
    {:else if $viewState.current === "library"}
      <LibraryView />
    {:else if $viewState.current === "agents" || $viewState.current === "agent-detail"}
      <AgentsView />
    {:else if $viewState.current === "recordings"}
      <RecordingsView />
    {:else if $viewState.current === "run-logs"}
      <RunLogView />
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
    min-width: 0;
  }

  .mobile-topbar {
    display: none;
  }

  .nav-overlay {
    display: none;
  }

  @media (max-width: 768px) {
    .mobile-topbar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 16px;
      height: 52px;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      flex-shrink: 0;
      z-index: 10;
    }

    .hamburger-btn {
      width: 36px;
      height: 36px;
      padding: 6px;
      border: none;
      background: transparent;
      border-radius: var(--radius-md);
      color: var(--color-text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .hamburger-btn svg {
      width: 20px;
      height: 20px;
    }

    .hamburger-btn:hover {
      background: var(--color-border);
      color: var(--color-text);
    }

    .topbar-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--color-text);
    }

    .nav-overlay {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      z-index: 199;
    }
  }
</style>
