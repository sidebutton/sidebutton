<script lang="ts">
  import { onMount } from "svelte";
  import { listWorkflows, listActions, runWorkflow, getSettings, saveSettings, fetchSkillPacks, fetchSkillModules } from "../api";
  import { mcpStatus, addLog, clearLogs, isRunning, settings as settingsStore, showToast, skillPacks, activeSkillPack, skillModules } from "../stores";
  import { navigateToExecution, navigateToModuleDetail, navigateToLibrary } from "../router";
  import type { Action as Workflow, DashboardShortcut, Settings, InstalledPack, SkillModule } from "../types";
  import ShortcutCard from "../components/ShortcutCard.svelte";
  import AddShortcutModal from "../components/AddShortcutModal.svelte";
  import ParamsModal from "../components/ParamsModal.svelte";
  import ContextSummaryWidget from "../components/ContextSummaryWidget.svelte";

  let workflows = $state<Workflow[]>([]);
  let actions = $state<Workflow[]>([]);
  let shortcuts = $state<DashboardShortcut[]>([]);
  let modules = $state<SkillModule[]>([]);
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
      const [loadedWorkflows, loadedActions, loadedSettings, packs] = await Promise.all([
        listWorkflows(),
        listActions(),
        getSettings(),
        fetchSkillPacks(),
      ]);
      workflows = loadedWorkflows;
      actions = loadedActions;
      shortcuts = loadedSettings.dashboard_shortcuts || [];
      settingsStore.set(loadedSettings);
      skillPacks.set(packs);

      // Load modules for active skill pack
      if (packs.length > 0) {
        try {
          const mods = await fetchSkillModules(packs[0].domain);
          modules = mods;
          skillModules.set(mods);
        } catch { modules = []; }
      }
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
      paramsModalAction = action;
      paramsModalShortcut = shortcut;
      showParamsModal = true;
      return;
    }

    await executeWorkflow(action, shortcut.params);
  }

  async function handleRunModuleWorkflow(workflowId: string) {
    try {
      const result = await runWorkflow(workflowId, {});
      navigateToExecution(workflowId, result.run_id);
    } catch (e) {
      showToast(`Failed to run: ${e}`, "error");
    }
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
      <ContextSummaryWidget />

      <!-- Active Skill Pack Banner -->
      {#if $activeSkillPack}
        <div class="skill-pack-banner">
          <div class="banner-info">
            <span class="banner-icon">📦</span>
            <div>
              <h2>{$activeSkillPack.title || $activeSkillPack.name}</h2>
              <span class="banner-meta">{$activeSkillPack.domain} · v{$activeSkillPack.version} · {modules.length} modules</span>
            </div>
          </div>
        </div>

        <!-- Module Cards Grid -->
        {#if modules.length > 0}
          <section class="section">
            <div class="section-header">
              <h2>Modules</h2>
            </div>
            <div class="modules-grid">
              {#each modules as mod (mod.name)}
                <button class="module-card" onclick={() => navigateToModuleDetail($activeSkillPack!.domain, mod.path)}>
                  <div class="module-card-header">
                    <span class="module-card-name">{mod.displayName}</span>
                  </div>
                  <span class="module-card-count">{mod.workflowCount} workflow{mod.workflowCount !== 1 ? 's' : ''}</span>
                  {#if mod.workflows.length > 0}
                    <div class="module-card-action">
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <span class="run-btn" role="button" tabindex="0" onclick={(e) => { e.stopPropagation(); handleRunModuleWorkflow(mod.workflows[0].id); }} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); handleRunModuleWorkflow(mod.workflows[0].id); } }}>
                        ▶ Run
                      </span>
                    </div>
                  {/if}
                </button>
              {/each}
            </div>
          </section>
        {/if}
      {:else}
        <!-- No skill pack prompt -->
        <div class="no-pack-banner">
          <p>Install a skill pack from the Library to see modules here.</p>
          <button class="btn btn-primary" onclick={() => navigateToLibrary()}>Go to Library</button>
        </div>
      {/if}

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

      <!-- Empty state when no shortcuts and no skill pack -->
      {#if sortedShortcuts.length === 0 && !$activeSkillPack}
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <polyline points="13 2 13 9 20 9" />
            </svg>
          </div>
          <h3>No Dashboard Shortcuts</h3>
          <p>Add shortcuts from Skills or install a skill pack to get started.</p>
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

  /* Skill Pack Banner */
  .skill-pack-banner {
    padding: 16px 20px;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    margin-bottom: 24px;
  }

  .banner-info { display: flex; align-items: center; gap: 12px; }
  .banner-icon { font-size: 24px; }
  .banner-info h2 { margin: 0; font-size: 18px; font-weight: 600; color: var(--color-text); }
  .banner-meta { font-size: 13px; color: var(--color-text-secondary); }

  /* No skill pack */
  .no-pack-banner {
    padding: 32px 24px;
    background: var(--color-card);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-lg);
    text-align: center;
    margin-bottom: 24px;
  }
  .no-pack-banner p { margin: 0 0 12px; font-size: 14px; color: var(--color-text-secondary); }

  /* Module Cards */
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
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .modules-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }

  .module-card {
    display: flex;
    flex-direction: column;
    padding: 16px;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
  }
  .module-card:hover { border-color: var(--color-primary); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }

  .module-card-header { margin-bottom: 6px; }
  .module-card-name { font-size: 15px; font-weight: 600; color: var(--color-text); }
  .module-card-count { font-size: 13px; color: var(--color-text-secondary); margin-bottom: 10px; }

  .module-card-action { margin-top: auto; }
  .run-btn {
    padding: 4px 12px; font-size: 12px; font-weight: 500; border: 1px solid var(--color-border);
    border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text);
    cursor: pointer; transition: all var(--transition-fast);
  }
  .run-btn:hover { background: var(--color-primary); color: white; border-color: var(--color-primary); }

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

  .empty-icon svg { width: 100%; height: 100%; }

  .empty-state h3 { margin: 0 0 12px; font-size: 18px; font-weight: 600; color: var(--color-text); }
  .empty-state p { margin: 0 0 8px; font-size: 14px; max-width: 400px; }

  .btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px;
    border: none; border-radius: var(--radius-md); cursor: pointer; font-size: 14px; font-weight: 500;
  }
  .btn-primary { background: var(--color-primary); color: white; }
  .btn-primary:hover { opacity: 0.9; }
</style>
