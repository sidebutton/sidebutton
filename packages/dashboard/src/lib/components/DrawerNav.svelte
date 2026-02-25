<script lang="ts">
  import { viewState, mcpStatus } from "../stores";
  import { navigateToDashboard, navigateToSkills, navigateToLibrary, navigateToAgents, navigateToRecordings, navigateToSettings } from "../router";
  import type { PageType } from "../types";

  function isActive(page: PageType): boolean {
    return $viewState.activePage === page;
  }
</script>

<nav class="drawer">
  <div class="drawer-header">
    <svg class="header-logo" viewBox="80 240 420 420">
      <path fill="#15C39A" d="M122.96,593.43l20.99-57.86c42.5,20.99,101.38,34.82,151.55,34.82,68.61,0,112.64-26.11,112.64-75.26,0-41.47-29.18-62.98-93.18-69.12-65.54-6.14-86.53-21.5-86.53-50.18,0-31.23,29.7-48.64,90.62-48.64,26.62,0,57.34,4.1,77.82,11.78v-20.99c-19.46-7.17-47.62-11.26-77.82-11.26-53.76,0-111.1,16.9-111.1,69.12,0,41.98,31.23,64,104.96,70.66,55.81,5.12,74.75,20.48,74.75,48.64,0,35.33-32.77,54.78-92.16,54.78-49.15,0-103.93-13.31-144.38-33.79l18.94-51.2c-27.14-18.94-40.96-48.64-40.96-84.48,0-95.23,91.13-129.53,189.95-129.53,50.18,0,103.93,9.73,146.94,26.62v136.7c22.02,19.46,33.79,47.1,33.79,79.36,0,98.81-96.25,132.61-199.17,132.61-68.09,0-134.65-12.8-177.66-32.77Z"/>
    </svg>
    <h1>SideButton</h1>
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
      class:active={isActive("skills")}
      onclick={navigateToSkills}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
      <span>Skills</span>
    </button>

    <button
      class="nav-item"
      class:active={isActive("library")}
      onclick={navigateToLibrary}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
      </svg>
      <span>Library</span>
    </button>

    <button
      class="nav-item"
      class:active={isActive("agents")}
      onclick={navigateToAgents}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.27A7 7 0 0 1 14 22h-4a7 7 0 0 1-6.73-3H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"></path>
        <circle cx="9" cy="14" r="1"></circle>
        <circle cx="15" cy="14" r="1"></circle>
      </svg>
      <span>Agents</span>
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

  .header-logo {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }

  .drawer-header h1 {
    font-size: 16px;
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
