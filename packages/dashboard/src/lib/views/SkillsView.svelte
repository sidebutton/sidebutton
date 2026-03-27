<script lang="ts">
  import { onMount } from "svelte";
  import {
    fetchSkillPacks, fetchSkillPackDetail, fetchSkillModules,
    listActions, createAction, updateAction, deleteAction,
    runWorkflow, getRoles, updateRole, reloadAll, uninstallSkillPack,
  } from "../api";
  import { skillPacks, actions, showToast, mcpStatus } from "../stores";
  import { navigateToLibrary, navigateToExecution, navigateToModuleDetail, navigateToRunLogs } from "../router";
  import type { InstalledPack, SkillPackDetail, SkillModule, RoleContext, Action } from "../types";

  let isLoading = $state(true);
  let packDetails = $state<Map<string, { detail: SkillPackDetail; modules: SkillModule[] }>>(new Map());
  let expandedPacks = $state<Set<string>>(new Set());
  let expandedModules = $state<Set<string>>(new Set());
  let userActions = $state<Action[]>([]);

  async function loadData() {
    isLoading = true;
    try {
      const [packs, loadedActions] = await Promise.all([
        fetchSkillPacks(),
        listActions(),
      ]);
      skillPacks.set(packs);
      userActions = loadedActions;

      // Load details for all packs
      const details = new Map<string, { detail: SkillPackDetail; modules: SkillModule[] }>();
      await Promise.all(packs.map(async (pack) => {
        try {
          const [detail, modules] = await Promise.all([
            fetchSkillPackDetail(pack.domain),
            fetchSkillModules(pack.domain),
          ]);
          details.set(pack.domain, { detail, modules });
        } catch (e) {
          console.error(`Failed to load details for ${pack.domain}:`, e);
        }
      }));
      packDetails = details;
    } catch (e) {
      console.error("Failed to load skills:", e);
    } finally {
      isLoading = false;
    }
  }

  function togglePack(domain: string) {
    const next = new Set(expandedPacks);
    if (next.has(domain)) next.delete(domain); else next.add(domain);
    expandedPacks = next;
  }

  function toggleModule(key: string) {
    const next = new Set(expandedModules);
    if (next.has(key)) next.delete(key); else next.add(key);
    expandedModules = next;
  }

  async function handleToggleRole(role: RoleContext) {
    try {
      await updateRole(role.filename, {
        name: role.name,
        match: role.match,
        enabled: !role.enabled,
        body: role.body,
      });
      showToast(`${role.name} ${role.enabled ? 'disabled' : 'enabled'}`, "success");
      await loadData();
    } catch (e) {
      showToast(`Failed to update role: ${e}`, "error");
    }
  }

  async function handleRunWorkflow(workflowId: string) {
    try {
      const result = await runWorkflow(workflowId, {});
      navigateToExecution(workflowId, result.run_id);
    } catch (e) {
      showToast(`Failed to run workflow: ${e}`, "error");
    }
  }

  async function handleDeleteAction(action: Action) {
    if (!confirm(`Delete "${action.title}"?`)) return;
    try {
      await deleteAction(action.id);
      showToast("Action deleted", "success");
      await loadData();
    } catch (e) {
      showToast(`Failed to delete: ${e}`, "error");
    }
  }

  async function handleReload() {
    try {
      await reloadAll();
      await loadData();
      showToast("Reloaded", "success");
    } catch (e) {
      showToast(`Reload failed: ${e}`, "error");
    }
  }

  function getPackToggleState(roles: RoleContext[]): 'on' | 'off' | 'partial' {
    if (roles.length === 0) return 'off';
    const enabledCount = roles.filter(r => r.enabled !== false).length;
    if (enabledCount === roles.length) return 'on';
    if (enabledCount === 0) return 'off';
    return 'partial';
  }

  async function handleTogglePack(domain: string) {
    const info = packDetails.get(domain);
    if (!info) return;
    const roles = info.detail.roles;
    if (roles.length === 0) return;
    const state = getPackToggleState(roles);
    const newEnabled = state === 'off'; // OFF → enable all, ON/PARTIAL → disable all
    try {
      await Promise.all(roles.map(role =>
        updateRole(role.filename, {
          name: role.name,
          match: role.match,
          enabled: newEnabled,
          body: role.body,
        })
      ));
      showToast(`All roles ${newEnabled ? 'enabled' : 'disabled'}`, "success");
      await loadData();
    } catch (e) {
      showToast(`Failed to toggle pack: ${e}`, "error");
    }
  }

  async function handleUninstall(domain: string, title: string) {
    if (!confirm(`Uninstall "${title}"? This will remove all modules, roles, and workflows from this skill pack.`)) return;
    try {
      await uninstallSkillPack(domain);
      showToast(`"${title}" uninstalled`, "success");
      await loadData();
    } catch (e) {
      showToast(`Failed to uninstall: ${e}`, "error");
    }
  }

  onMount(() => { loadData(); });
</script>

<div class="skills-view">
  <header>
    <h1>Skills</h1>
    <div class="header-actions">
      <button class="btn btn-secondary" onclick={() => navigateToLibrary()}>+ Install</button>
      <button class="btn btn-ghost" onclick={handleReload} aria-label="Reload skills">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
      </button>
    </div>
  </header>

  <div class="content">
    {#if isLoading}
      <div class="loading">Loading skills...</div>
    {:else}
      <!-- Installed Skill Packs -->
      {#each $skillPacks as pack (pack.domain)}
        {@const info = packDetails.get(pack.domain)}
        {@const isExpanded = expandedPacks.has(pack.domain)}
        {@const toggleState = info ? getPackToggleState(info.detail.roles) : 'on'}
        <div class="pack-card">
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div class="pack-header" role="button" tabindex="0" onclick={() => togglePack(pack.domain)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePack(pack.domain); } }}>
            <div class="pack-info">
              <span class="pack-icon">📦</span>
              <div>
                <h3>{pack.title || pack.name}</h3>
                <span class="pack-meta">
                  {pack.domain} · v{pack.version}
                  {#if info}
                    · {info.modules.length} modules · {info.detail.workflowCount} workflows · {info.detail.roles.length} roles
                  {/if}
                </span>
              </div>
            </div>
            <div class="pack-controls">
              <button
                class="toggle-badge {toggleState}"
                onclick={(e) => { e.stopPropagation(); handleTogglePack(pack.domain); }}
              >
                {toggleState === 'partial' ? 'PARTIAL' : toggleState.toUpperCase()}
              </button>
              <svg class="chevron" class:expanded={isExpanded} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </div>

          {#if isExpanded && info}
            <div class="pack-body">
              <div class="pack-section">
                <h4>Roles</h4>
                <div class="role-list">
                  {#each info.detail.roles as role (role.filename)}
                    <div class="role-item">
                      <span class="role-dot" class:enabled={role.enabled !== false}></span>
                      <span class="role-name">{role.name}</span>
                      <button
                        class="toggle-btn"
                        class:on={role.enabled !== false}
                        onclick={() => handleToggleRole(role)}
                      >
                        {role.enabled !== false ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  {/each}
                </div>
              </div>

              <div class="pack-section">
                <h4>Modules</h4>
                <div class="module-list">
                  {#each info.modules as mod (mod.name)}
                    {@const moduleKey = `${pack.domain}/${mod.name}`}
                    {@const isModExpanded = expandedModules.has(moduleKey)}
                    <div class="module-item">
                      <button class="module-header" onclick={() => toggleModule(moduleKey)}>
                        <svg class="chevron" class:expanded={isModExpanded} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                        <span class="module-name">{mod.displayName}</span>
                        <span class="module-count">{mod.workflowCount} workflow{mod.workflowCount !== 1 ? 's' : ''}</span>
                      </button>
                      {#if isModExpanded}
                        <div class="module-body">
                          {#if mod.hasSkillDoc}
                            <div class="module-skill-doc">_skill.md: {mod.displayName} — selectors, data model, states</div>
                          {/if}
                          <div class="workflow-list">
                            {#each mod.workflows as wf (wf.id)}
                              <div class="workflow-item">
                                <span class="wf-name">{wf.title}</span>
                                <button class="btn btn-sm" onclick={() => handleRunWorkflow(wf.id)}>▶</button>
                              </div>
                            {/each}
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>

              <div class="pack-actions">
                <button class="btn btn-ghost btn-sm" onclick={() => navigateToRunLogs()}>View Run Logs</button>
                <button class="btn btn-danger btn-sm" onclick={() => handleUninstall(pack.domain, pack.title || pack.name)}>Uninstall</button>
              </div>
            </div>
          {/if}
        </div>
      {/each}

      <!-- Built-in defaults notice -->
      {#if $skillPacks.length === 0}
        <div class="empty-card">
          <h3>No Skill Packs Installed</h3>
          <p>Install a skill pack from the Library to get domain-specific modules, workflows, and roles.</p>
          <button class="btn btn-primary" onclick={() => navigateToLibrary()}>Go to Library</button>
        </div>
      {/if}

      <!-- User Actions Section -->
      {#if userActions.length > 0}
        <div class="pack-card user-actions">
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div class="pack-header" role="button" tabindex="0" onclick={() => togglePack('_user_actions')} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePack('_user_actions'); } }}>
            <div class="pack-info">
              <span class="pack-icon">⚡</span>
              <div>
                <h3>User Actions</h3>
                <span class="pack-meta">Custom workflows from /actions directory · {userActions.length} actions</span>
              </div>
            </div>
            <div class="pack-controls">
              <svg class="chevron" class:expanded={expandedPacks.has('_user_actions')} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </div>

          {#if expandedPacks.has('_user_actions')}
            <div class="pack-body">
              <div class="workflow-list">
                {#each userActions as action (action.id)}
                  <div class="workflow-item">
                    <span class="wf-name">{action.title}</span>
                    <div class="wf-actions">
                      <button class="btn btn-sm" onclick={() => handleRunWorkflow(action.id)}>▶</button>
                      <button class="btn btn-sm btn-ghost" onclick={() => handleDeleteAction(action)}>🗑</button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .skills-view {
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

  header h1 { font-size: 24px; font-weight: 600; color: var(--color-text); margin: 0; }

  .header-actions { display: flex; gap: 8px; align-items: center; }

  .content { flex: 1; padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }

  .loading { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--color-text-secondary); }

  .pack-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-card);
    overflow: hidden;
  }

  .pack-header {
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    user-select: none;
  }
  .pack-header:hover { background: var(--color-surface); }

  .pack-info { display: flex; align-items: center; gap: 12px; }
  .pack-icon { font-size: 20px; }
  .pack-info h3 { margin: 0; font-size: 16px; font-weight: 600; color: var(--color-text); }
  .pack-meta { font-size: 13px; color: var(--color-text-secondary); }

  .pack-controls { display: flex; align-items: center; gap: 8px; }
  .toggle-badge {
    font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
    border: none; cursor: pointer; transition: all var(--transition-fast);
  }
  .toggle-badge.on { background: var(--color-success-light); color: var(--color-success); }
  .toggle-badge.off { background: var(--color-border); color: var(--color-text-muted); }
  .toggle-badge.partial { background: #fef3c7; color: #d97706; }

  .chevron { transition: transform 0.2s; }
  .chevron.expanded { transform: rotate(180deg); }

  .pack-body { padding: 0 20px 16px; border-top: 1px solid var(--color-border); }

  .pack-section { margin-top: 16px; }
  .pack-section h4 { margin: 0 0 8px; font-size: 12px; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }

  .role-list { display: flex; flex-direction: column; gap: 6px; }
  .role-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--radius-md); }
  .role-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-text-muted); flex-shrink: 0; }
  .role-dot.enabled { background: var(--color-success); }
  .role-name { flex: 1; font-size: 14px; color: var(--color-text); }

  .toggle-btn {
    font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 999px; border: none; cursor: pointer;
    background: var(--color-border); color: var(--color-text-secondary);
  }
  .toggle-btn.on { background: var(--color-success-light); color: var(--color-success); }

  .module-list { display: flex; flex-direction: column; gap: 2px; }
  .module-item { border-radius: var(--radius-md); }
  .module-header {
    width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px;
    border: none; background: transparent; cursor: pointer; text-align: left; font-size: 14px;
    border-radius: var(--radius-md);
  }
  .module-header:hover { background: var(--color-surface); }
  .module-name { flex: 1; font-weight: 500; color: var(--color-text); }
  .module-count { font-size: 12px; color: var(--color-text-muted); }

  .module-body { padding: 4px 0 8px 22px; }
  .module-skill-doc { font-size: 12px; color: var(--color-text-secondary); padding: 4px 8px; margin-bottom: 6px; background: var(--color-surface); border-radius: var(--radius-md); }

  .workflow-list { display: flex; flex-direction: column; gap: 4px; }
  .workflow-item {
    display: flex; align-items: center; justify-content: space-between; padding: 6px 8px;
    border-radius: var(--radius-md); font-size: 13px;
  }
  .workflow-item:hover { background: var(--color-surface); }
  .wf-name { color: var(--color-text); }
  .wf-actions { display: flex; gap: 4px; }

  .pack-actions { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--color-border); display: flex; gap: 8px; }

  .empty-card {
    padding: 48px 24px; text-align: center; background: var(--color-card);
    border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  }
  .empty-card h3 { margin: 0 0 8px; font-size: 18px; font-weight: 600; color: var(--color-text); }
  .empty-card p { margin: 0 0 16px; font-size: 14px; color: var(--color-text-secondary); }

  .btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px;
    border: none; border-radius: var(--radius-md); cursor: pointer; font-size: 14px; font-weight: 500;
    transition: all var(--transition-fast);
  }
  .btn-primary { background: var(--color-primary); color: white; }
  .btn-primary:hover { opacity: 0.9; }
  .btn-secondary { background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); }
  .btn-secondary:hover { background: var(--color-border); }
  .btn-ghost { background: transparent; color: var(--color-text-secondary); }
  .btn-ghost:hover { color: var(--color-text); background: var(--color-surface); }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .btn-danger { background: transparent; color: var(--color-error, #ef4444); border: 1px solid var(--color-error, #ef4444); }
  .btn-danger:hover { background: var(--color-error, #ef4444); color: white; }

  @media (max-width: 768px) {
    header {
      flex-wrap: wrap;
      padding: 14px 16px;
      gap: 10px;
    }

    .header-actions {
      width: 100%;
    }

    .content {
      padding: 16px;
    }

    .pack-header {
      flex-wrap: wrap;
      gap: 8px;
    }
  }
</style>
