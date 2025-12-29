<script lang="ts">
  import { onMount } from "svelte";
  import { listWorkflows, listActions, runWorkflow, getSettings, saveSettings } from "../api";
  import { navigateToExecution, mcpStatus, addLog, clearLogs, isRunning, settings as settingsStore, showToast } from "../stores";
  import type { Action as Workflow, DashboardShortcut, Settings } from "../types";
  import ShortcutCard from "../components/ShortcutCard.svelte";
  import AddShortcutModal from "../components/AddShortcutModal.svelte";
  import ParamsModal from "../components/ParamsModal.svelte";

  let workflows = $state<Workflow[]>([]);
  let actions = $state<Workflow[]>([]);
  let shortcuts = $state<DashboardShortcut[]>([]);
  let isLoading = $state(true);

  // Modal states
  let showAddShortcutModal = $state(false);
  let editingShortcut = $state<DashboardShortcut | null>(null);
  let selectedActionForShortcut = $state<Workflow | null>(null);

  // Params modal for running shortcuts
  let showParamsModal = $state(false);
  let paramsModalAction = $state<Workflow | null>(null);
  let paramsModalShortcut = $state<DashboardShortcut | null>(null);

  async function loadData() {
    try {
      const [loadedWorkflows, loadedActions, loadedSettings] = await Promise.all([
        listWorkflows(),
        listActions(),
        getSettings()
      ]);
      workflows = loadedWorkflows;
      actions = loadedActions;
      shortcuts = loadedSettings.dashboard_shortcuts || [];
      settingsStore.set(loadedSettings);
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      isLoading = false;
    }
  }

  // Get action by ID (for shortcut display)
  function getActionById(actionId: string): Workflow | null {
    return [...actions, ...workflows].find(a => a.id === actionId) || null;
  }

  // Save shortcuts to settings
  async function saveShortcuts(newShortcuts: DashboardShortcut[]) {
    try {
      const updated = await saveSettings({ dashboard_shortcuts: newShortcuts });
      shortcuts = updated.dashboard_shortcuts || [];
      settingsStore.set(updated);
    } catch (e) {
      console.error("Failed to save shortcuts:", e);
      showToast("Failed to save shortcuts", "error");
    }
  }

  // Shortcut CRUD operations
  function handleAddShortcut(shortcut: DashboardShortcut) {
    const newShortcuts = [...shortcuts];
    const existingIndex = newShortcuts.findIndex(s => s.id === shortcut.id);
    if (existingIndex >= 0) {
      newShortcuts[existingIndex] = shortcut;
    } else {
      shortcut.order = newShortcuts.length;
      newShortcuts.push(shortcut);
    }
    saveShortcuts(newShortcuts);
    showAddShortcutModal = false;
    editingShortcut = null;
    selectedActionForShortcut = null;
  }

  function handleEditShortcut(shortcut: DashboardShortcut) {
    editingShortcut = shortcut;
    selectedActionForShortcut = getActionById(shortcut.action_id);
    showAddShortcutModal = true;
  }

  function handleCloneShortcut(shortcut: DashboardShortcut) {
    const cloned: DashboardShortcut = {
      ...shortcut,
      id: `shortcut_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      custom_name: `${shortcut.custom_name} (copy)`,
      order: shortcuts.length,
    };
    saveShortcuts([...shortcuts, cloned]);
  }

  function handleDeleteShortcut(shortcut: DashboardShortcut) {
    if (confirm(`Delete shortcut "${shortcut.custom_name}"?`)) {
      const newShortcuts = shortcuts
        .filter(s => s.id !== shortcut.id)
        .map((s, i) => ({ ...s, order: i }));
      saveShortcuts(newShortcuts);
    }
  }

  function handleMoveShortcut(shortcut: DashboardShortcut, direction: "up" | "down") {
    const index = shortcuts.findIndex(s => s.id === shortcut.id);
    if (index < 0) return;

    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= shortcuts.length) return;

    const newShortcuts = [...shortcuts];
    [newShortcuts[index], newShortcuts[newIndex]] = [newShortcuts[newIndex], newShortcuts[index]];
    newShortcuts.forEach((s, i) => s.order = i);
    saveShortcuts(newShortcuts);
  }

  async function handleRunShortcut(shortcut: DashboardShortcut) {
    const action = getActionById(shortcut.action_id);
    if (!action) {
      addLog(`Action not found: ${shortcut.action_id}`, "error");
      return;
    }

    // Check if shortcut has all required params pre-filled
    const requiredParams = Object.keys(action.params || {});
    const hasAllParams = requiredParams.every(key => shortcut.params[key] !== undefined);

    if (!hasAllParams && requiredParams.length > 0) {
      // Show params modal with shortcut's pre-filled values
      paramsModalAction = action;
      paramsModalShortcut = shortcut;
      showParamsModal = true;
      return;
    }

    // Run directly with shortcut params
    await executeWorkflow(action, shortcut.params);
  }

  async function handleRunWorkflow(workflow: Workflow) {
    const hasBrowserSteps = workflow.steps?.some((s: { type: string }) =>
      typeof s.type === 'string' && s.type.startsWith("browser.")
    );

    if (hasBrowserSteps && !$mcpStatus.browser_connected) {
      addLog("Browser not connected. Please connect first.", "error");
      return;
    }

    // Check if workflow has params
    const paramKeys = Object.keys(workflow.params || {});
    if (paramKeys.length > 0) {
      paramsModalAction = workflow;
      paramsModalShortcut = null;
      showParamsModal = true;
      return;
    }

    await executeWorkflow(workflow, {});
  }

  async function executeWorkflow(workflow: Workflow, params: Record<string, string>) {
    isRunning.set(true);
    clearLogs();
    navigateToExecution(workflow.id);

    try {
      const result = await runWorkflow(workflow.id, params);
      addLog(`Workflow started: ${result.run_id}`, "info");
    } catch (e) {
      addLog(`Failed to run workflow: ${e}`, "error");
    } finally {
      isRunning.set(false);
    }
  }

  function handleParamsRun(params: Record<string, string>) {
    if (!paramsModalAction) return;
    executeWorkflow(paramsModalAction, params);
    showParamsModal = false;
    paramsModalAction = null;
    paramsModalShortcut = null;
  }

  function closeAddModal() {
    showAddShortcutModal = false;
    editingShortcut = null;
    selectedActionForShortcut = null;
  }

  // Sort shortcuts by order
  let sortedShortcuts = $derived(
    [...shortcuts].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  );

  onMount(() => {
    loadData();
  });
</script>

<div class="dashboard-view">
  <header>
    <h1>Dashboard</h1>
  </header>

  <div class="content">
    {#if isLoading}
      <div class="loading">Loading...</div>
    {:else}
      <!-- Shortcuts Section -->
      {#if sortedShortcuts.length > 0}
        <section class="section">
          <div class="section-header">
            <h2>Shortcuts</h2>
          </div>
          <div class="shortcuts-grid">
            {#each sortedShortcuts as shortcut, index (shortcut.id)}
              <ShortcutCard
                {shortcut}
                action={getActionById(shortcut.action_id)}
                onrun={() => handleRunShortcut(shortcut)}
                onedit={() => handleEditShortcut(shortcut)}
                ondelete={() => handleDeleteShortcut(shortcut)}
                onclone={() => handleCloneShortcut(shortcut)}
                onmoveup={() => handleMoveShortcut(shortcut, "up")}
                onmovedown={() => handleMoveShortcut(shortcut, "down")}
                isFirst={index === 0}
                isLast={index === sortedShortcuts.length - 1}
              />
            {/each}
          </div>
        </section>
      {/if}

      <!-- Empty state when no shortcuts -->
      {#if sortedShortcuts.length === 0}
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <polyline points="13 2 13 9 20 9" />
            </svg>
          </div>
          <h3>No Dashboard Shortcuts</h3>
          <p>Add shortcuts from Actions or Workflows to quickly run them with pre-configured parameters.</p>
          <p class="hint">Go to <strong>Actions</strong> or <strong>Workflows</strong>, open an item, and click "Add to Dashboard".</p>
        </div>
      {/if}
    {/if}
  </div>
</div>

<!-- Add/Edit Shortcut Modal -->
{#if showAddShortcutModal}
  <AddShortcutModal
    action={selectedActionForShortcut}
    existingShortcut={editingShortcut}
    onsave={handleAddShortcut}
    oncancel={closeAddModal}
  />
{/if}

<!-- Params Modal for running -->
{#if showParamsModal && paramsModalAction}
  <ParamsModal
    isOpen={showParamsModal}
    title="Run: {paramsModalAction.title}"
    params={paramsModalAction.params || {}}
    lastUsedParams={paramsModalShortcut?.params || {}}
    onRun={handleParamsRun}
    onCancel={() => { showParamsModal = false; paramsModalAction = null; paramsModalShortcut = null; }}
  />
{/if}

<style>
  .dashboard-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
  }

  header {
    padding: 20px 24px;
    background: var(--color-card);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  header h1 {
    font-size: 24px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
  }

  .content {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--color-text-secondary);
  }

  .section {
    margin-bottom: 32px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .section-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .shortcuts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px 24px;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    color: var(--color-text-secondary);
    text-align: center;
  }

  .empty-icon {
    width: 64px;
    height: 64px;
    margin-bottom: 20px;
    color: var(--color-text-muted);
    opacity: 0.5;
  }

  .empty-icon svg {
    width: 100%;
    height: 100%;
  }

  .empty-state h3 {
    margin: 0 0 12px;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
  }

  .empty-state p {
    margin: 0 0 8px;
    font-size: 14px;
    max-width: 400px;
  }

  .empty-state .hint {
    color: var(--color-text-muted);
    font-size: 13px;
  }
</style>
