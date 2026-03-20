<script lang="ts">
  import { onMount, tick } from "svelte";
  import { getSettings, saveSettings, getContextAll, updatePersona, createRole, updateRole, deleteRole as apiDeleteRole, createTarget, updateTarget, deleteTarget as apiDeleteTarget, getProviderStatuses as apiGetProviderStatuses, setProviderConnector, applyConfig, readConfig } from "../api";
  import { settings as settingsStore, showToast } from "../stores";
  import { navigateBack } from "../router";
  import type { Settings, FullLlmConfig, UserContext, RoleContext, TargetContext, PersonaContext, ProviderStatus, ConnectorType, EntryPath } from "../types";
  import { isLlmContext, isEnvContext } from "../types";
  import ContextModal from "../components/ContextModal.svelte";
  import ContextTabs from "../components/ContextTabs.svelte";
  import PersonaEditor from "../components/PersonaEditor.svelte";
  import RoleTargetModal from "../components/RoleTargetModal.svelte";

  let isLoading = $state(true);
  let isSaving = $state(false);
  let isTesting = $state(false);
  let error = $state<string | null>(null);
  let saveSuccess = $state(false);
  let testResult = $state<{ success: boolean; message: string } | null>(null);
  let showApiKey = $state(false);

  // Top-level settings tab
  let settingsTab = $state<'context' | 'llm' | 'agents'>('context');

  // LLM config form state
  let provider = $state<string>('openai');
  let baseUrl = $state<string>('');
  let apiKey = $state<string>('');
  let model = $state<string>('');

  // User contexts state (inline tab)
  let userContexts = $state<UserContext[]>([]);

  // Inline context modal state
  let showModal = $state(false);
  let editingContext = $state<UserContext | null>(null);

  // Delete confirmation state (inline tab)
  let deletingId = $state<string | null>(null);

  // Connector UI state
  let expandedSetup = $state<string | null>(null);
  let connectorSaving = $state(false);

  // Provider integrations state
  let providerStatuses = $state<ProviderStatus[]>([]);

  // Context sub-tabs state
  let activeContextTab = $state<'persona' | 'roles' | 'targets' | 'integrations' | 'inline'>('persona');
  let persona = $state<PersonaContext>({ body: '' });
  let roles = $state<RoleContext[]>([]);
  let targets = $state<TargetContext[]>([]);
  let isSavingPersona = $state(false);

  // Role/Target modal state
  let showRoleTargetModal = $state(false);
  let roleTargetMode = $state<'role' | 'target'>('role');
  let editingRoleTarget = $state<RoleContext | TargetContext | null>(null);

  // Role/target delete confirmation
  let deletingFilename = $state<string | null>(null);

  // Entry paths state (Agents tab)
  let entryPaths = $state<EntryPath[]>([]);
  let expandedPath = $state<string | null>(null);
  let isApplying = $state(false);
  let newPathInput = $state('');

  // Scroll preservation
  let contentEl = $state<HTMLElement | null>(null);

  async function preserveScroll(fn: () => void | Promise<void>) {
    const scrollTop = contentEl?.scrollTop ?? 0;
    await fn();
    await tick();
    if (contentEl) contentEl.scrollTop = scrollTop;
  }

  const providers = [
    { id: 'openai', name: 'OpenAI', defaultUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
    { id: 'anthropic', name: 'Anthropic', defaultUrl: 'https://api.anthropic.com', defaultModel: 'claude-3-5-sonnet-latest' },
    { id: 'ollama', name: 'Ollama', defaultUrl: 'http://localhost:11434/v1', defaultModel: 'llama3.2' },
  ];

  // Derived state
  let llmContexts = $derived(userContexts.filter(isLlmContext));
  let envContexts = $derived(userContexts.filter(isEnvContext));

  let topTabs = $derived([
    { id: 'context', label: 'AI Context' },
    { id: 'llm', label: 'LLM Provider' },
    { id: 'agents', label: 'Agents', count: entryPaths.length },
  ]);

  // Filter out provider-managed targets (shown in Integrations tab instead)
  let siteTargets = $derived(targets.filter(t => !t.provider));

  let contextTabs = $derived([
    { id: 'persona', label: 'Persona' },
    { id: 'roles', label: 'Roles', count: roles.length },
    { id: 'targets', label: 'Targets', count: siteTargets.length },
    { id: 'integrations', label: 'Integrations', count: providerStatuses.filter(p => p.connected).length },
    { id: 'inline', label: 'Inline', count: userContexts.length },
  ]);

  async function loadAll() {
    isLoading = true;
    error = null;
    try {
      const [settings, context, providerData] = await Promise.all([getSettings(), getContextAll(), apiGetProviderStatuses()]);
      settingsStore.set(settings);
      if (settings.llm) {
        provider = settings.llm.provider || 'openai';
        baseUrl = settings.llm.base_url || '';
        apiKey = settings.llm.api_key || '';
        model = settings.llm.model || '';
      }
      userContexts = settings.user_contexts || [];
      entryPaths = settings.entry_paths || [];
      persona = context.persona;
      roles = context.roles;
      targets = context.targets;
      providerStatuses = providerData;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load settings";
      console.error("Failed to load:", e);
    } finally {
      isLoading = false;
    }
  }

  function handleProviderChange() {
    const p = providers.find(x => x.id === provider);
    if (p) {
      baseUrl = p.defaultUrl;
      model = p.defaultModel;
    }
  }

  async function handleTestConnection() {
    isTesting = true;
    testResult = null;

    try {
      if (!apiKey.trim()) {
        testResult = { success: false, message: 'API key is required' };
        return;
      }

      if (provider === 'openai' && !apiKey.startsWith('sk-')) {
        testResult = { success: false, message: 'OpenAI API keys should start with "sk-"' };
        return;
      }

      testResult = { success: true, message: 'Configuration looks valid' };
    } finally {
      isTesting = false;
      setTimeout(() => testResult = null, 4000);
    }
  }

  async function handleSave() {
    isSaving = true;
    error = null;
    saveSuccess = false;

    const llmConfig: FullLlmConfig = {
      provider: provider as 'openai' | 'anthropic' | 'ollama',
      base_url: baseUrl,
      api_key: apiKey,
      model: model,
    };

    try {
      const updated = await saveSettings({ llm: llmConfig, user_contexts: userContexts });
      settingsStore.set(updated);
      saveSuccess = true;
      setTimeout(() => saveSuccess = false, 3000);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save settings";
      console.error("Failed to save:", e);
    } finally {
      isSaving = false;
    }
  }

  // Persona handlers
  async function handleSavePersona(body: string) {
    isSavingPersona = true;
    error = null;
    try {
      persona = await updatePersona(body);
      saveSuccess = true;
      setTimeout(() => saveSuccess = false, 3000);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save persona";
    } finally {
      isSavingPersona = false;
    }
  }

  // Role/Target handlers
  function openAddRoleTarget(mode: 'role' | 'target') {
    roleTargetMode = mode;
    editingRoleTarget = null;
    showRoleTargetModal = true;
  }

  function openEditRoleTarget(item: RoleContext | TargetContext, mode: 'role' | 'target') {
    roleTargetMode = mode;
    editingRoleTarget = item;
    showRoleTargetModal = true;
  }

  async function handleRoleTargetSave(data: { name: string; match: string[]; body: string }) {
    error = null;
    try {
      if (roleTargetMode === 'role') {
        if (editingRoleTarget) {
          const updated = await updateRole((editingRoleTarget as RoleContext).filename, data);
          await preserveScroll(() => {
            roles = roles.map(r => r.filename === (editingRoleTarget as RoleContext).filename ? updated : r);
          });
        } else {
          const created = await createRole(data);
          await preserveScroll(() => {
            roles = [...roles, created].sort((a, b) => a.name.localeCompare(b.name));
          });
        }
      } else {
        if (editingRoleTarget) {
          const updated = await updateTarget((editingRoleTarget as TargetContext).filename, data);
          await preserveScroll(() => {
            targets = targets.map(t => t.filename === (editingRoleTarget as TargetContext).filename ? updated : t);
          });
        } else {
          const created = await createTarget(data);
          await preserveScroll(() => {
            targets = [...targets, created].sort((a, b) => a.name.localeCompare(b.name));
          });
        }
      }
      saveSuccess = true;
      setTimeout(() => saveSuccess = false, 3000);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save";
    }
  }

  // Toggle enabled state for roles/targets
  async function toggleRoleEnabled(role: RoleContext) {
    error = null;
    const newEnabled = role.enabled === false ? true : false;
    try {
      const updated = await updateRole(role.filename, {
        name: role.name,
        match: role.match,
        enabled: newEnabled,
        body: role.body,
      });
      await preserveScroll(() => {
        roles = roles.map(r => r.filename === role.filename ? updated : r);
      });
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to update role";
    }
  }

  async function toggleTargetEnabled(target: TargetContext) {
    error = null;
    const newEnabled = target.enabled === false ? true : false;
    try {
      const updated = await updateTarget(target.filename, {
        name: target.name,
        match: target.match,
        enabled: newEnabled,
        body: target.body,
      });
      await preserveScroll(() => {
        targets = targets.map(t => t.filename === target.filename ? updated : t);
      });
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to update target";
    }
  }

  function confirmDeleteRoleTarget(filename: string) {
    deletingFilename = filename;
  }

  function cancelDeleteRoleTarget() {
    deletingFilename = null;
  }

  async function executeDeleteRole(filename: string) {
    error = null;
    try {
      await apiDeleteRole(filename);
      await preserveScroll(() => {
        roles = roles.filter(r => r.filename !== filename);
      });
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to delete role";
    }
    deletingFilename = null;
  }

  async function executeDeleteTarget(filename: string) {
    error = null;
    try {
      await apiDeleteTarget(filename);
      await preserveScroll(() => {
        targets = targets.filter(t => t.filename !== filename);
      });
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to delete target";
    }
    deletingFilename = null;
  }

  // Inline context handlers
  function openAddModal() {
    editingContext = null;
    showModal = true;
  }

  function openEditModal(ctx: UserContext) {
    editingContext = ctx;
    showModal = true;
  }

  function handleModalSave(ctx: UserContext) {
    if (editingContext) {
      userContexts = userContexts.map(c => c.id === ctx.id ? ctx : c);
    } else {
      userContexts = [...userContexts, ctx];
    }
    handleSave();
  }

  function confirmDelete(id: string) {
    deletingId = id;
  }

  function cancelDelete() {
    deletingId = null;
  }

  function executeDelete(id: string) {
    userContexts = userContexts.filter(c => c.id !== id);
    deletingId = null;
    handleSave();
  }

  async function handleConnectorChange(providerId: string, connectorId: ConnectorType | null) {
    connectorSaving = true;
    error = null;
    try {
      await setProviderConnector(providerId, connectorId);
      providerStatuses = await apiGetProviderStatuses();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to set connector";
    } finally {
      connectorSaving = false;
    }
  }

  function toggleSetup(key: string) {
    expandedSetup = expandedSetup === key ? null : key;
  }

  function getProviderTypeLabel(type: string | string[]): string {
    if (Array.isArray(type)) return type.join(', ');
    return type;
  }

  // Entry path handlers (Agents tab)
  function addEntryPath() {
    const p = newPathInput.trim();
    if (!p) return;
    if (entryPaths.some(ep => ep.path === p)) {
      showToast('Path already exists', 'warning');
      return;
    }
    entryPaths = [...entryPaths, { path: p }];
    newPathInput = '';
    expandedPath = p;
  }

  function removeEntryPath(pathStr: string) {
    entryPaths = entryPaths.filter(ep => ep.path !== pathStr);
    if (expandedPath === pathStr) expandedPath = null;
  }

  function updateEntryPathField(pathStr: string, field: 'claude_md', value: string) {
    entryPaths = entryPaths.map(ep => ep.path === pathStr ? { ...ep, [field]: value } : ep);
  }

  function updateEntryPathMcpJson(pathStr: string, jsonStr: string) {
    try {
      const parsed = JSON.parse(jsonStr);
      entryPaths = entryPaths.map(ep => ep.path === pathStr ? { ...ep, mcp_json: parsed } : ep);
    } catch { /* invalid JSON, don't update */ }
  }

  async function handleLoadFromAgent(pathStr: string) {
    try {
      const result = await readConfig([pathStr]);
      if (result.ok && result.results.length > 0) {
        const r = result.results[0];
        entryPaths = entryPaths.map(ep => {
          if (ep.path !== pathStr) return ep;
          return { ...ep, mcp_json: r.mcp_json ?? ep.mcp_json, claude_md: r.claude_md ?? ep.claude_md };
        });
        showToast('Loaded config from agent', 'success');
      }
    } catch (e) {
      showToast(`Failed to read: ${e}`, 'error');
    }
  }

  async function handleSaveAndApply() {
    isApplying = true;
    try {
      // Save entry_paths to settings
      await saveSettings({ entry_paths: entryPaths });
      // Push to agent filesystem
      const result = await applyConfig({ entry_paths: entryPaths });
      if (result.ok) {
        const failed = result.results.filter(r => !r.ok);
        if (failed.length > 0) {
          showToast(`Applied with ${failed.length} error(s): ${failed.map(f => f.error).join(', ')}`, 'warning');
        } else {
          showToast('Config saved and applied', 'success');
        }
      }
    } catch (e) {
      showToast(`Failed to apply: ${e}`, 'error');
    } finally {
      isApplying = false;
    }
  }

  onMount(() => {
    loadAll();
  });
</script>

<div class="settings-view">
  <header>
    <button class="back-btn" onclick={navigateBack}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Back
    </button>
    <h1>Settings</h1>
  </header>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  {#if saveSuccess}
    <div class="success-banner">Settings saved successfully</div>
  {/if}

  <div class="content" bind:this={contentEl}>
    {#if isLoading}
      <div class="loading">Loading settings...</div>
    {:else}
      <div class="settings-panel">
        <!-- Top-level tabs -->
        <ContextTabs
          tabs={topTabs}
          activeTab={settingsTab}
          onTabChange={(id) => settingsTab = id as typeof settingsTab}
        />

        <!-- AI Context Tab -->
        {#if settingsTab === 'context'}
          <ContextTabs
            tabs={contextTabs}
            activeTab={activeContextTab}
            onTabChange={(id) => activeContextTab = id as typeof activeContextTab}
          />

          <!-- Persona Tab -->
          {#if activeContextTab === 'persona'}
            <PersonaEditor
              body={persona.body}
              isSaving={isSavingPersona}
              onSave={handleSavePersona}
            />
          {/if}

          <!-- Roles Tab -->
          {#if activeContextTab === 'roles'}
            <div class="tab-header">
              <button class="btn-add" onclick={() => openAddRoleTarget('role')}>+ Add Role</button>
            </div>
            {#if roles.length === 0}
              <div class="empty-state">
                <p>No roles configured</p>
                <span>Roles define behavior for @category tags (e.g., @sales, @support)</span>
              </div>
            {:else}
              <div class="context-list">
                {#each roles as role (role.filename)}
                  {#if deletingFilename === role.filename}
                    <div class="context-item deleting">
                      <p>Delete "{role.name}"?</p>
                      <div class="delete-actions">
                        <button class="btn-cancel-sm" onclick={cancelDeleteRoleTarget}>Cancel</button>
                        <button class="btn-delete-confirm" onclick={() => executeDeleteRole(role.filename)}>Delete</button>
                      </div>
                    </div>
                  {:else}
                    <div class="context-item" class:inactive={role.enabled === false}>
                      <div class="context-header">
                        <div class="context-meta">
                          <span class="item-name">{role.name}</span>
                          {#if role.filename.startsWith('_')}
                            <span class="tag system">system</span>
                          {/if}
                          {#each role.match as pattern}
                            <span class="tag match">{pattern}</span>
                          {/each}
                        </div>
                        <div class="context-controls">
                          <div class="item-actions">
                            <button class="btn-edit" onclick={() => openEditRoleTarget(role, 'role')}>Edit</button>
                            {#if !role.filename.startsWith('_')}
                              <button class="btn-delete" onclick={() => confirmDeleteRoleTarget(role.filename)}>×</button>
                            {/if}
                          </div>
                          <button
                            class="toggle-switch"
                            class:on={role.enabled !== false}
                            onclick={() => toggleRoleEnabled(role)}
                            title={role.enabled !== false ? 'Enabled' : 'Disabled'}
                          >
                            <span class="toggle-knob"></span>
                          </button>
                        </div>
                      </div>
                      <p class="context-text">{role.body}</p>
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          {/if}

          <!-- Targets Tab -->
          {#if activeContextTab === 'targets'}
            <div class="tab-header">
              <button class="btn-add" onclick={() => openAddRoleTarget('target')}>+ Add Target</button>
            </div>
            {#if siteTargets.length === 0}
              <div class="empty-state">
                <p>No targets configured</p>
                <span>Targets define behavior for specific domains or URL patterns</span>
              </div>
            {:else}
              <div class="context-list">
                {#each siteTargets as target (target.filename)}
                  {#if deletingFilename === target.filename}
                    <div class="context-item deleting">
                      <p>Delete "{target.name}"?</p>
                      <div class="delete-actions">
                        <button class="btn-cancel-sm" onclick={cancelDeleteRoleTarget}>Cancel</button>
                        <button class="btn-delete-confirm" onclick={() => executeDeleteTarget(target.filename)}>Delete</button>
                      </div>
                    </div>
                  {:else}
                    <div class="context-item" class:inactive={target.enabled === false}>
                      <div class="context-header">
                        <div class="context-meta">
                          <span class="item-name">{target.name}</span>
                          {#if target.filename.startsWith('_')}
                            <span class="tag system">system</span>
                          {/if}
                          {#each target.match as pattern}
                            <span class="tag match">{pattern}</span>
                          {/each}
                        </div>
                        <div class="context-controls">
                          <div class="item-actions">
                            <button class="btn-edit" onclick={() => openEditRoleTarget(target, 'target')}>Edit</button>
                            {#if !target.filename.startsWith('_')}
                              <button class="btn-delete" onclick={() => confirmDeleteRoleTarget(target.filename)}>×</button>
                            {/if}
                          </div>
                          <button
                            class="toggle-switch"
                            class:on={target.enabled !== false}
                            onclick={() => toggleTargetEnabled(target)}
                            title={target.enabled !== false ? 'Enabled' : 'Disabled'}
                          >
                            <span class="toggle-knob"></span>
                          </button>
                        </div>
                      </div>
                      <p class="context-text">{target.body}</p>
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          {/if}

          <!-- Integrations Tab -->
          {#if activeContextTab === 'integrations'}
            {#if providerStatuses.length === 0}
              <div class="empty-state">
                <p>No provider integrations available</p>
              </div>
            {:else}
              <div class="context-list">
                {#each providerStatuses as prov (prov.id)}
                  <div class="provider-card">
                    <div class="provider-header">
                      <div class="provider-info">
                        <span class="item-name">{prov.name}</span>
                        <span class="tag match">{getProviderTypeLabel(prov.type)} provider</span>
                        {#if prov.connected}
                          <span class="tag provider-connected">Connected</span>
                        {:else if prov.activeConnector}
                          <span class="tag provider-missing">Not available</span>
                        {:else}
                          <span class="tag provider-not-configured">Not connected</span>
                        {/if}
                      </div>
                    </div>

                    <div class="connector-list">
                      {#each prov.connectors as conn, i}
                        {@const status = prov.connectorStatuses[i]}
                        {@const isActive = status?.active ?? false}
                        {@const setupKey = `${prov.id}-${conn.id}`}
                        <div class="connector-row" class:active={isActive}>
                          <div class="connector-main">
                            <label class="connector-radio">
                              <input
                                type="radio"
                                name={`connector-${prov.id}`}
                                checked={isActive}
                                disabled={connectorSaving}
                                onchange={() => handleConnectorChange(prov.id, isActive ? null : conn.id)}
                              />
                              <span class="connector-name">{conn.name}</span>
                              {#if isActive}
                                <span class="tag connector-active">active</span>
                              {/if}
                            </label>
                            <span class="connector-level">{conn.featureLevel} features</span>
                          </div>

                          <div class="connector-status">
                            {#if status?.available}
                              <span class="req-met">Ready</span>
                            {:else if status?.error}
                              <span class="req-missing">{status.error}</span>
                            {/if}
                          </div>

                          <button
                            class="btn-setup-toggle"
                            onclick={() => toggleSetup(setupKey)}
                          >
                            {expandedSetup === setupKey ? 'Hide setup' : 'Setup'}
                          </button>

                          {#if expandedSetup === setupKey}
                            <div class="setup-instructions">
                              <p>{conn.setupInstructions}</p>
                              {#if conn.requiredEnvVars.length > 0}
                                <div class="env-requirements">
                                  {#each conn.requiredEnvVars as envVar}
                                    <code class="env-var-check">{envVar}</code>
                                  {/each}
                                </div>
                              {/if}
                            </div>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}

          <!-- Inline Tab -->
          {#if activeContextTab === 'inline'}
            <div class="tab-header">
              <button class="btn-add" onclick={openAddModal}>+ Add</button>
            </div>

            <div class="context-sections">
              <!-- LLM Contexts -->
              <div class="context-section">
                <h3>LLM Contexts</h3>
                {#if llmContexts.length === 0}
                  <div class="empty-state">
                    <p>No LLM contexts configured</p>
                    <span>Add custom AI instructions for specific industries or domains</span>
                  </div>
                {:else}
                  <div class="context-list">
                    {#each llmContexts as ctx (ctx.id)}
                      {#if deletingId === ctx.id}
                        <div class="context-item deleting">
                          <p>Delete this context?</p>
                          <div class="delete-actions">
                            <button class="btn-cancel-sm" onclick={cancelDelete}>Cancel</button>
                            <button class="btn-delete-confirm" onclick={() => executeDelete(ctx.id)}>Delete</button>
                          </div>
                        </div>
                      {:else}
                        <div class="context-item">
                          <div class="context-meta">
                            {#if ctx.industry}
                              <span class="tag industry">{ctx.industry}</span>
                            {/if}
                            {#if ctx.domain}
                              <span class="tag domain">{ctx.domain}</span>
                            {/if}
                            {#if !ctx.industry && !ctx.domain}
                              <span class="tag global">Global</span>
                            {/if}
                          </div>
                          <p class="context-text">{ctx.context}</p>
                          <div class="item-actions">
                            <button class="btn-edit" onclick={() => openEditModal(ctx)}>Edit</button>
                            <button class="btn-delete" onclick={() => confirmDelete(ctx.id)}>×</button>
                          </div>
                        </div>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>

              <!-- Environment Variables -->
              <div class="context-section">
                <h3>Environment Variables</h3>
                {#if envContexts.length === 0}
                  <div class="empty-state">
                    <p>No environment variables configured</p>
                    <span>Add variables accessible via {"{{env.name}}"}</span>
                  </div>
                {:else}
                  <div class="context-list">
                    {#each envContexts as ctx (ctx.id)}
                      {#if deletingId === ctx.id}
                        <div class="context-item env-item deleting">
                          <p>Delete this variable?</p>
                          <div class="delete-actions">
                            <button class="btn-cancel-sm" onclick={cancelDelete}>Cancel</button>
                            <button class="btn-delete-confirm" onclick={() => executeDelete(ctx.id)}>Delete</button>
                          </div>
                        </div>
                      {:else}
                        <div class="context-item env-item">
                          <code class="env-name">{ctx.name}</code>
                          <span class="env-value">{ctx.value}</span>
                          <div class="item-actions">
                            <button class="btn-edit" onclick={() => openEditModal(ctx)}>Edit</button>
                            <button class="btn-delete" onclick={() => confirmDelete(ctx.id)}>×</button>
                          </div>
                        </div>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        {/if}

        <!-- LLM Provider Tab -->
        {#if settingsTab === 'llm'}
          <div class="llm-content">
            <div class="llm-form-row">
              <div class="llm-form-col">
                <div class="form-section">
                  <div class="form-group">
                    <label for="provider">Provider</label>
                    <select id="provider" bind:value={provider} onchange={handleProviderChange}>
                      {#each providers as p}
                        <option value={p.id}>{p.name}</option>
                      {/each}
                    </select>
                  </div>

                  <div class="form-group">
                    <label for="base-url">Base URL</label>
                    <input
                      id="base-url"
                      type="text"
                      bind:value={baseUrl}
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>

                  <div class="form-group">
                    <label for="api-key">
                      API Key
                      <button class="toggle-visibility" onclick={() => showApiKey = !showApiKey}>
                        {showApiKey ? 'Hide' : 'Show'}
                      </button>
                    </label>
                    <input
                      id="api-key"
                      type={showApiKey ? 'text' : 'password'}
                      bind:value={apiKey}
                      placeholder="sk-..."
                    />
                  </div>

                  <div class="form-group">
                    <label for="model">Model</label>
                    <input
                      id="model"
                      type="text"
                      bind:value={model}
                      placeholder="gpt-4o"
                    />
                  </div>
                </div>

                <div class="actions">
                  <button class="btn-secondary" onclick={handleTestConnection} disabled={isTesting}>
                    {isTesting ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button class="btn-primary" onclick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>

              <div class="llm-status-col">
                <div class="status-section">
                  <div class="status-row">
                    <span class="status-label">LLM Configured</span>
                    <span class="status-value" class:yes={apiKey} class:no={!apiKey}>
                      {apiKey ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div class="status-row">
                    <span class="status-label">Provider</span>
                    <span class="status-value">{providers.find(p => p.id === provider)?.name || provider}</span>
                  </div>
                  <div class="status-row">
                    <span class="status-label">Model</span>
                    <span class="status-value">{model || 'Not set'}</span>
                  </div>
                </div>

                {#if testResult}
                  <div class="test-result" class:success={testResult.success} class:error={!testResult.success}>
                    {testResult.message}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/if}

        <!-- Agents Tab -->
        {#if settingsTab === 'agents'}
          <div class="agents-content">
            <div class="add-path-row">
              <input
                type="text"
                bind:value={newPathInput}
                placeholder="~/workspace/my-project"
                onkeydown={(e) => { if (e.key === 'Enter') addEntryPath(); }}
              />
              <button class="btn-secondary" onclick={addEntryPath}>Add Path</button>
            </div>

            {#if entryPaths.length === 0}
              <div class="empty-state">No entry paths configured. Add a path to configure .mcp.json and CLAUDE.md for agent workspaces.</div>
            {:else}
              <div class="entry-path-list">
                {#each entryPaths as ep (ep.path)}
                  <div class="entry-path-item" class:expanded={expandedPath === ep.path}>
                    <div class="entry-path-header">
                      <button class="expand-toggle" onclick={() => expandedPath = expandedPath === ep.path ? null : ep.path}>
                        <span class="chevron" class:open={expandedPath === ep.path}>&#9654;</span>
                        <code>{ep.path}</code>
                      </button>
                      <div class="entry-path-actions">
                        <button class="btn-ghost btn-sm" onclick={() => handleLoadFromAgent(ep.path)} title="Read current config from agent">Load</button>
                        <button class="btn-danger-ghost btn-sm" onclick={() => removeEntryPath(ep.path)} title="Remove entry path">&times;</button>
                      </div>
                    </div>

                    {#if expandedPath === ep.path}
                      <div class="entry-path-editors">
                        <div class="editor-section">
                          <!-- svelte-ignore a11y_label_has_associated_control -->
                          <label>.mcp.json</label>
                          <textarea
                            class="code-editor"
                            rows="10"
                            value={ep.mcp_json ? JSON.stringify(ep.mcp_json, null, 2) : '{}'}
                            oninput={(e) => updateEntryPathMcpJson(ep.path, e.currentTarget.value)}
                            spellcheck="false"
                          ></textarea>
                        </div>

                        <div class="editor-section">
                          <!-- svelte-ignore a11y_label_has_associated_control -->
                          <label>CLAUDE.md</label>
                          <textarea
                            class="code-editor claude-editor"
                            rows="14"
                            value={ep.claude_md ?? ''}
                            oninput={(e) => updateEntryPathField(ep.path, 'claude_md', e.currentTarget.value)}
                            placeholder="# Agent instructions for this workspace..."
                            spellcheck="false"
                          ></textarea>
                        </div>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>

              <div class="actions" style="margin-top: 16px;">
                <button class="btn-primary" onclick={handleSaveAndApply} disabled={isApplying}>
                  {isApplying ? 'Applying...' : 'Save & Apply'}
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<ContextModal
  isOpen={showModal}
  editingContext={editingContext}
  onClose={() => showModal = false}
  onSave={handleModalSave}
/>

<RoleTargetModal
  isOpen={showRoleTargetModal}
  mode={roleTargetMode}
  editing={editingRoleTarget}
  onClose={() => showRoleTargetModal = false}
  onSave={handleRoleTargetSave}
/>

<style>
  .settings-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #f5f5f5;
    color: #1a1a1a;
  }

  header {
    padding: 16px 24px;
    background: #fff;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: transparent;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    color: #666;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.15s ease;
  }

  .back-btn:hover {
    background: #f5f5f5;
    color: #1a1a1a;
  }

  .back-btn svg {
    width: 16px;
    height: 16px;
  }

  h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .error-banner {
    padding: 12px 24px;
    background: #fef2f2;
    color: #b91c1c;
    font-size: 0.85rem;
    border-bottom: 1px solid #fecaca;
  }

  .success-banner {
    padding: 12px 24px;
    background: #f0fdf4;
    color: #15803d;
    font-size: 0.85rem;
    border-bottom: 1px solid #bbf7d0;
  }

  .content {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
  }

  .loading {
    text-align: center;
    padding: 60px;
    color: #888;
  }

  .settings-panel {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    padding: 24px;
  }

  /* LLM Tab Layout */
  .llm-content {
    padding-top: 4px;
  }

  .llm-form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
  }

  @media (max-width: 700px) {
    .llm-form-row {
      grid-template-columns: 1fr;
    }
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 20px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-group label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.8rem;
    font-weight: 500;
    color: #666;
  }

  .toggle-visibility {
    padding: 2px 8px;
    background: transparent;
    border: 1px solid #ddd;
    border-radius: 4px;
    color: #888;
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toggle-visibility:hover {
    background: #f5f5f5;
    color: #1a1a1a;
  }

  .form-group input,
  .form-group select {
    padding: 10px 12px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.9rem;
    color: #1a1a1a;
    transition: border-color 0.15s ease;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: #2196f3;
  }

  .status-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    background: #fafafa;
    border-radius: 6px;
  }

  .status-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .status-label {
    font-size: 0.8rem;
    color: #888;
  }

  .status-value {
    font-size: 0.8rem;
    font-weight: 500;
    color: #1a1a1a;
  }

  .status-value.yes {
    color: #16a34a;
  }

  .status-value.no {
    color: #ea580c;
  }

  .test-result {
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 0.85rem;
    margin-top: 16px;
  }

  .test-result.success {
    background: #f0fdf4;
    color: #15803d;
  }

  .test-result.error {
    background: #fef2f2;
    color: #b91c1c;
  }

  .actions {
    display: flex;
    gap: 12px;
  }

  .btn-secondary {
    flex: 1;
    padding: 10px 16px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    color: #666;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #f5f5f5;
    color: #1a1a1a;
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    flex: 1;
    padding: 10px 16px;
    background: #2196f3;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    color: #fff;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1976d2;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Context area */
  .tab-header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 16px;
  }

  .btn-add {
    padding: 6px 14px;
    background: #f5f5f5;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    color: #666;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-add:hover {
    background: #e8e8e8;
    color: #1a1a1a;
  }

  .context-sections {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .context-section h3 {
    margin: 0 0 12px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .empty-state {
    padding: 20px;
    background: #fafafa;
    border-radius: 6px;
    text-align: center;
  }

  .empty-state p {
    margin: 0 0 4px;
    font-size: 0.85rem;
    color: #666;
  }

  .empty-state span {
    font-size: 0.75rem;
    color: #999;
  }

  .context-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .context-item {
    padding: 12px 14px;
    background: #fafafa;
    border: 1px solid #eee;
    border-radius: 6px;
    transition: all 0.15s ease;
  }

  .context-item:hover {
    border-color: #ddd;
  }

  .context-item.inactive {
    opacity: 0.5;
  }

  .context-item.inactive:hover {
    opacity: 0.7;
  }

  .context-item.deleting {
    background: #fef2f2;
    border-color: #fecaca;
    text-align: center;
    opacity: 1;
  }

  .context-item.deleting p {
    margin: 0 0 12px;
    font-size: 0.85rem;
    color: #b91c1c;
  }

  .delete-actions {
    display: flex;
    justify-content: center;
    gap: 8px;
  }

  .btn-cancel-sm {
    padding: 6px 12px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.8rem;
    color: #666;
    cursor: pointer;
  }

  .btn-cancel-sm:hover {
    background: #f5f5f5;
  }

  .btn-delete-confirm {
    padding: 6px 12px;
    background: #ef4444;
    border: none;
    border-radius: 4px;
    font-size: 0.8rem;
    color: #fff;
    cursor: pointer;
  }

  .btn-delete-confirm:hover {
    background: #dc2626;
  }

  .context-meta {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .item-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: #1a1a1a;
    margin-right: 4px;
  }

  /* Context item header layout */
  .context-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }

  .context-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  /* Toggle switch */
  .toggle-switch {
    position: relative;
    width: 36px;
    height: 20px;
    border-radius: 10px;
    border: none;
    background: #d1d5db;
    cursor: pointer;
    padding: 0;
    transition: background 0.2s ease;
    flex-shrink: 0;
  }

  .toggle-switch.on {
    background: #22c55e;
  }

  .toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }

  .toggle-switch.on .toggle-knob {
    transform: translateX(16px);
  }

  .toggle-switch:hover {
    filter: brightness(0.92);
  }

  .tag {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .tag.industry {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .tag.domain {
    background: #f3e8ff;
    color: #7c3aed;
  }

  .tag.global {
    background: #e5e7eb;
    color: #6b7280;
  }

  .tag.match {
    background: #f0f4f8;
    color: #475569;
  }

  .tag.system {
    background: #e5e7eb;
    color: #6b7280;
  }

  .context-text {
    margin: 0;
    font-size: 0.85rem;
    color: #444;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .item-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .context-item:hover .item-actions {
    opacity: 1;
  }

  .btn-edit {
    padding: 4px 10px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.75rem;
    color: #666;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-edit:hover {
    background: #f5f5f5;
    color: #1a1a1a;
  }

  .btn-delete {
    width: 24px;
    height: 24px;
    padding: 0;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
    color: #999;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .btn-delete:hover {
    background: #fef2f2;
    border-color: #fecaca;
    color: #ef4444;
  }

  /* Env Items */
  .env-item {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .env-item.deleting {
    flex-direction: column;
    align-items: stretch;
  }

  .env-name {
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
    font-size: 0.8rem;
    background: #e0f2fe;
    color: #0369a1;
    padding: 4px 8px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .env-value {
    flex: 1;
    font-size: 0.85rem;
    color: #666;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .env-item .item-actions {
    position: static;
    opacity: 0;
  }

  .env-item:hover .item-actions {
    opacity: 1;
  }

  /* Provider Integrations */
  .provider-card {
    padding: 16px;
    background: #fafafa;
    border: 1px solid #eee;
    border-radius: 8px;
    transition: all 0.15s ease;
  }

  .provider-header {
    margin-bottom: 12px;
  }

  .provider-info {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tag.provider-connected {
    background: #dcfce7;
    color: #15803d;
  }

  .tag.provider-missing {
    background: #fef3c7;
    color: #92400e;
  }

  .tag.provider-not-configured {
    background: #f3f4f6;
    color: #6b7280;
  }

  .connector-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .connector-row {
    padding: 10px 12px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    transition: all 0.15s ease;
  }

  .connector-row.active {
    border-color: #93c5fd;
    background: #eff6ff;
  }

  .connector-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .connector-radio {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
    color: #1a1a1a;
  }

  .connector-radio input[type="radio"] {
    accent-color: #2563eb;
    margin: 0;
  }

  .connector-name {
    font-weight: 500;
  }

  .tag.connector-active {
    background: #dbeafe;
    color: #1d4ed8;
    font-size: 0.65rem;
  }

  .connector-level {
    font-size: 0.75rem;
    color: #9ca3af;
    text-transform: capitalize;
  }

  .connector-status {
    margin-top: 4px;
    font-size: 0.75rem;
  }

  .req-met {
    color: #16a34a;
  }

  .req-missing {
    color: #92400e;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
    font-size: 0.72rem;
  }

  .btn-setup-toggle {
    margin-top: 6px;
    padding: 3px 10px;
    background: transparent;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    font-size: 0.72rem;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-setup-toggle:hover {
    background: #f9fafb;
    color: #374151;
    border-color: #d1d5db;
  }

  .setup-instructions {
    margin-top: 8px;
    padding: 10px 12px;
    background: #f9fafb;
    border-radius: 4px;
    font-size: 0.8rem;
    color: #4b5563;
    line-height: 1.5;
  }

  .setup-instructions p {
    margin: 0;
  }

  .env-requirements {
    margin-top: 8px;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .env-var-check {
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
    font-size: 0.72rem;
    background: #e0f2fe;
    color: #0369a1;
    padding: 2px 6px;
    border-radius: 3px;
  }

  /* Agents tab */
  .agents-content { padding: 16px 0; }

  .add-path-row {
    display: flex; gap: 8px; margin-bottom: 16px;
  }
  .add-path-row input {
    flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;
    font-size: 14px; font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
  }

  .empty-state {
    padding: 32px; text-align: center; color: #6b7280; font-size: 14px;
    background: #f9fafb; border: 1px dashed #d1d5db; border-radius: 8px;
  }

  .entry-path-list { display: flex; flex-direction: column; gap: 8px; }

  .entry-path-item {
    border: 1px solid #e5e7eb; border-radius: 8px; background: white; overflow: hidden;
  }
  .entry-path-item.expanded { border-color: #93c5fd; }

  .entry-path-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 14px;
  }

  .expand-toggle {
    display: flex; align-items: center; gap: 8px;
    background: none; border: none; cursor: pointer; font-size: 14px; color: #1a1a1a;
  }
  .expand-toggle code { font-size: 13px; }

  .chevron {
    font-size: 10px; transition: transform 0.15s; display: inline-block; color: #9ca3af;
  }
  .chevron.open { transform: rotate(90deg); }

  .entry-path-actions { display: flex; gap: 4px; }

  .btn-danger-ghost {
    background: none; border: none; cursor: pointer; color: #9ca3af;
    font-size: 18px; padding: 2px 6px; border-radius: 4px; line-height: 1;
  }
  .btn-danger-ghost:hover { color: #ef4444; background: #fef2f2; }

  .btn-ghost { background: none; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer; color: #6b7280; padding: 3px 8px; font-size: 12px; }
  .btn-ghost:hover { color: #1a1a1a; background: #f3f4f6; }

  .btn-sm { padding: 3px 8px; font-size: 12px; }

  .entry-path-editors { padding: 0 14px 14px; display: flex; flex-direction: column; gap: 12px; }

  .editor-section label {
    display: block; font-size: 12px; font-weight: 600; color: #6b7280;
    margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.3px;
  }

  .code-editor {
    width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace; font-size: 13px;
    line-height: 1.5; resize: vertical; background: #fafafa; color: #1a1a1a;
    tab-size: 2;
  }
  .code-editor:focus { outline: none; border-color: #3b82f6; background: white; }
  .claude-editor { min-height: 180px; }
</style>
