<script lang="ts">
  import { viewState, navigateToDashboard, navigateToActions, navigateToWorkflows, navigateToRecordings, navigateToRunLogs, navigateToSettings, mcpStatus } from "../stores";
  import type { PageType } from "../types";

  function isActive(page: PageType): boolean {
    return $viewState.activePage === page;
  }
</script>

<nav class="drawer">
  <div class="drawer-header">
    <h1>Assistant</h1>
    <span class="header-status-dot" class:connected={$mcpStatus.browser_connected}></span>
  </div>

  <div class="nav-items">
    <button
      class="nav-item"
      class:active={isActive("dashboard")}
      onclick={navigateToDashboard}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
        <rect x="3" y="14" width="7" height="7"></rect>
      </svg>
      <span>Dashboard</span>
    </button>

    <button
      class="nav-item"
      class:active={isActive("actions")}
      onclick={navigateToActions}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      <span>Actions</span>
    </button>

    <button
      class="nav-item"
      class:active={isActive("workflows")}
      onclick={navigateToWorkflows}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      </svg>
      <span>Library</span>
    </button>

    <button
      class="nav-item"
      class:active={isActive("recordings")}
      onclick={navigateToRecordings}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="23 7 16 12 23 17 23 7"></polygon>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
      </svg>
      <span>Recordings</span>
    </button>

    <button
      class="nav-item"
      class:active={isActive("run-logs")}
      onclick={navigateToRunLogs}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
      </svg>
      <span>Run Log</span>
    </button>
  </div>

  <div class="drawer-footer">
    <div class="browser-status" class:connected={$mcpStatus.browser_connected}>
      <span class="status-dot"></span>
      <span class="status-text">
        {$mcpStatus.browser_connected ? "Browser Connected" : "Browser Disconnected"}
      </span>
    </div>

    <button class="nav-item settings" onclick={navigateToSettings}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
      <span>Settings</span>
    </button>
  </div>
</nav>

<style>
  .drawer {
    width: 200px;
    height: 100vh;
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .drawer-header {
    padding: 20px 16px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .drawer-header h1 {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
  }

  .header-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-warning);
    flex-shrink: 0;
  }

  .header-status-dot.connected {
    background: var(--color-success);
  }

  .nav-items {
    flex: 1;
    padding: 12px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: none;
    background: transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    color: var(--color-text-secondary);
    font-size: 14px;
    font-weight: 500;
    text-align: left;
    width: 100%;
  }

  .nav-item:hover {
    background: var(--color-border);
    color: var(--color-text);
  }

  .nav-item.active {
    background: var(--color-primary);
    color: white;
  }

  .nav-item svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .drawer-footer {
    padding: 12px 8px;
    border-top: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .nav-item.settings {
    color: var(--color-text-muted);
  }

  .nav-item.settings:hover {
    background: var(--color-border);
    color: var(--color-text);
  }

  .browser-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    font-size: 12px;
    color: var(--color-warning);
    background: var(--color-warning-light);
    border-radius: var(--radius-md);
  }

  .browser-status.connected {
    color: var(--color-success);
    background: var(--color-success-light);
  }

  .browser-status .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-warning);
    flex-shrink: 0;
  }

  .browser-status.connected .status-dot {
    background: var(--color-success);
  }

  .browser-status .status-text {
    font-weight: 500;
  }
</style>
