<script lang="ts">
  import { onMount } from "svelte";
  import { getAction, runWorkflow, deleteAction, publishAction, updateAction, getSettings, saveSettings, getWorkflowStats } from "../api";
  import {
    viewState,
    navigateBack,
    navigateToActions,
    navigateToExecution,
    showToast,
  } from "../stores";
  import type { Action, DashboardShortcut, CategoryLevel, CategoryDomain, WorkflowStats } from "../types";
  import DetailViewHero from "../components/DetailViewHero.svelte";
  import DetailViewStatsBar from "../components/DetailViewStatsBar.svelte";
  import DetailViewSteps from "../components/DetailViewSteps.svelte";
  import CollapsibleSection from "../components/CollapsibleSection.svelte";
  import StepIcon from "../components/StepIcon.svelte";
  import ParamsModal from "../components/ParamsModal.svelte";
  import { formatStepDetails, getStepEditableFields } from "../utils/stepFormatters";
  import AddShortcutModal from "../components/AddShortcutModal.svelte";

  let action = $state<Action | null>(null);
  let stats = $state<WorkflowStats | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let showParamsModal = $state(false);
  let showDeleteConfirm = $state(false);
  let lastUsedParams = $state<Record<string, string>>({});
  let showRawConfig = $state(false);
  let isSaving = $state(false);

  // Shortcut modal state
  let showShortcutModal = $state(false);

  // Collapsible sections state
  let showParams = $state(true);
  let showDomains = $state(true);
  let showEmbed = $state(true);

  // Parameter editing state
  let isEditingParams = $state(false);
  let editParams = $state<Record<string, string>>({});
  let newParamName = $state("");
  let newParamType = $state("string");

  // Domain editing state
  let isEditingDomains = $state(false);
  let editDomains = $state<string[]>([]);
  let newDomain = $state("");

  // Embed editing state
  let isEditingEmbed = $state(false);
  let editEmbed = $state<{ selector: string; position: string; label?: string; url_pattern?: string } | null>(null);

  // Step editing state
  let editingStepIndex = $state<number | null>(null);
  let editStepFields = $state<Record<string, unknown>>({});

  async function loadAction() {
    const actionId = $viewState.selectedActionId;
    if (!actionId) return;

    isLoading = true;
    error = null;
    try {
      action = await getAction(actionId);
      // Load last used params from localStorage
      const stored = localStorage.getItem(`params_${actionId}`);
      if (stored) {
        lastUsedParams = JSON.parse(stored);
      }
      // Load stats
      try {
        stats = await getWorkflowStats(actionId);
      } catch {
        // Stats are optional
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load action";
      console.error("Failed to load action:", e);
    } finally {
      isLoading = false;
    }
  }

  function handleRunClick() {
    if (!action) return;
    const paramKeys = Object.keys(action.params || {});
    if (paramKeys.length > 0) {
      showParamsModal = true;
    } else {
      executeAction({});
    }
  }

  async function executeAction(params: Record<string, string>) {
    if (!action) return;

    // Save params for next time
    if (Object.keys(params).length > 0) {
      localStorage.setItem(`params_${action.id}`, JSON.stringify(params));
    }

    try {
      const result = await runWorkflow(action.id, params);
      showParamsModal = false;
      navigateToExecution(action.id, result.run_id);
    } catch (e) {
      console.error("Failed to run action:", e);
      error = e instanceof Error ? e.message : "Failed to run action";
    }
  }

  async function handleDelete() {
    if (!action) return;
    try {
      await deleteAction(action.id);
      navigateToActions();
    } catch (e) {
      console.error("Failed to delete:", e);
      error = e instanceof Error ? e.message : "Failed to delete action";
    }
  }

  async function handlePublish() {
    if (!action) return;
    try {
      await publishAction(action.id);
      error = null;
      showToast(`"${action.title}" published to Library`, "success");
    } catch (e) {
      console.error("Failed to publish:", e);
      showToast("Failed to publish action", "error");
    }
  }

  // Add to Dashboard
  function handleAddToDashboard() {
    showShortcutModal = true;
  }

  async function handleShortcutSave(shortcut: DashboardShortcut) {
    try {
      const settings = await getSettings();
      const shortcuts = settings.dashboard_shortcuts || [];
      shortcuts.push(shortcut);
      await saveSettings({ dashboard_shortcuts: shortcuts });
      showShortcutModal = false;
      showToast(`"${shortcut.custom_name}" added to Dashboard`, "success");
    } catch (e) {
      console.error("Failed to add shortcut:", e);
      showToast("Failed to add shortcut", "error");
    }
  }

  // Save action helper
  async function saveAction() {
    if (!action) return;
    isSaving = true;
    try {
      action = await updateAction(action.id, action);
      error = null;
    } catch (e) {
      console.error("Failed to save:", e);
      error = e instanceof Error ? e.message : "Failed to save action";
    } finally {
      isSaving = false;
    }
  }

  // Hero editing handlers
  async function handleTitleChange(newTitle: string) {
    if (!action) return;
    action.title = newTitle;
    await saveAction();
  }

  async function handleDescriptionChange(newDescription: string) {
    if (!action) return;
    action.description = newDescription || undefined;
    await saveAction();
  }

  async function handleCategoryChange(level: CategoryLevel, domain: CategoryDomain) {
    if (!action) return;
    action.category = { level, domain };
    await saveAction();
  }

  // Parameter editing
  function startEditParams() {
    if (!action) return;
    editParams = { ...(action.params || {}) };
    isEditingParams = true;
  }

  function addParam() {
    if (!newParamName.trim()) return;
    editParams[newParamName.trim()] = newParamType;
    newParamName = "";
    newParamType = "string";
  }

  function removeParam(name: string) {
    delete editParams[name];
    editParams = { ...editParams };
  }

  async function saveParams() {
    if (!action) return;
    action.params = { ...editParams };
    await saveAction();
    isEditingParams = false;
  }

  function cancelEditParams() {
    isEditingParams = false;
    editParams = {};
    newParamName = "";
  }

  // Domain editing
  function startEditDomains() {
    if (!action) return;
    editDomains = [...(action.policies?.allowed_domains || [])];
    isEditingDomains = true;
  }

  function addDomain() {
    if (!newDomain.trim()) return;
    if (!editDomains.includes(newDomain.trim())) {
      editDomains = [...editDomains, newDomain.trim()];
    }
    newDomain = "";
  }

  function removeDomain(domain: string) {
    editDomains = editDomains.filter(d => d !== domain);
  }

  async function saveDomains() {
    if (!action) return;
    action.policies = {
      ...action.policies,
      allowed_domains: editDomains.length > 0 ? editDomains : undefined,
    };
    await saveAction();
    isEditingDomains = false;
  }

  function cancelEditDomains() {
    isEditingDomains = false;
    editDomains = [];
    newDomain = "";
  }

  // Embed editing
  function startEditEmbed() {
    if (!action) return;
    editEmbed = action.embed ? { ...action.embed } : { selector: "", position: "after" };
    isEditingEmbed = true;
  }

  async function saveEmbed() {
    if (!action) return;
    if (editEmbed && editEmbed.selector.trim()) {
      action.embed = {
        selector: editEmbed.selector.trim(),
        position: editEmbed.position as "before" | "after" | "inside",
        label: editEmbed.label?.trim() || undefined,
        url_pattern: editEmbed.url_pattern?.trim() || undefined,
      };
    } else {
      action.embed = undefined;
    }
    await saveAction();
    isEditingEmbed = false;
  }

  function cancelEditEmbed() {
    isEditingEmbed = false;
    editEmbed = null;
  }

  function removeEmbed() {
    if (!action) return;
    action.embed = undefined;
    saveAction();
    isEditingEmbed = false;
  }

  // Step editing
  function startEditStep(index: number) {
    if (!action?.steps?.[index]) return;
    editStepFields = { ...action.steps[index] };
    editingStepIndex = index;
  }

  async function saveStep() {
    if (!action || editingStepIndex === null) return;
    action.steps[editingStepIndex] = { ...editStepFields } as Action["steps"][number];
    await saveAction();
    editingStepIndex = null;
    editStepFields = {};
  }

  function cancelEditStep() {
    editingStepIndex = null;
    editStepFields = {};
  }

  async function deleteStep(index: number) {
    if (!action) return;
    action.steps = action.steps.filter((_, i) => i !== index);
    await saveAction();
  }

  let hasParams = $derived(action?.params && Object.keys(action.params).length > 0);
  let hasDomains = $derived(action?.policies?.allowed_domains?.length ?? 0 > 0);
  let hasEmbed = $derived(!!action?.embed);

  onMount(() => {
    loadAction();
  });
</script>

<div class="detail-view">
  <header>
    <button class="back-btn" onclick={navigateBack}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Back
    </button>
    <div class="header-spacer"></div>
    <div class="header-actions">
      {#if showDeleteConfirm}
        <span class="confirm-text">Delete this action?</span>
        <button class="btn-danger" onclick={handleDelete}>Yes, Delete</button>
        <button class="btn-secondary" onclick={() => showDeleteConfirm = false}>Cancel</button>
      {:else}
        <button class="btn-secondary" onclick={handleAddToDashboard}>Add to Dashboard</button>
        <button class="btn-secondary" onclick={() => showDeleteConfirm = true}>Delete</button>
        <button class="btn-secondary" onclick={handlePublish}>Publish</button>
        <button class="btn-primary" onclick={handleRunClick}>Run</button>
      {/if}
    </div>
  </header>

  <div class="content">
    {#if isLoading}
      <div class="loading">Loading...</div>
    {:else if error}
      <div class="error">{error}</div>
    {:else if action}
      <DetailViewHero
        title={action.title}
        description={action.description}
        version={action.version}
        lastVerified={action.last_verified}
        category={action.category}
        parentId={action.parent_id}
        editable={true}
        isSaving={isSaving}
        ontitlechange={handleTitleChange}
        ondescriptionchange={handleDescriptionChange}
        oncategorychange={handleCategoryChange}
      />

      <DetailViewStatsBar stats={stats} lastVerified={action.last_verified} />

      <div class="action-content">
        <!-- Steps Section with Editing -->
        <section class="steps-section">
          <h2>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            Steps
            <span class="count-badge">{action.steps?.length ?? 0}</span>
          </h2>
          <div class="steps-list">
            {#each action.steps ?? [] as step, index}
              <div class="step-card" class:editing={editingStepIndex === index}>
                {#if editingStepIndex === index}
                  <div class="step-edit-form">
                    <div class="step-edit-header">
                      <span class="step-number">{index + 1}</span>
                      <StepIcon stepType={step.type} size={20} />
                      <span class="step-type">{step.type}</span>
                    </div>
                    <div class="step-edit-fields">
                      {#each getStepEditableFields(step.type).filter(f => f !== 'type') as field}
                        <div class="step-field-row">
                          <label>{field}:</label>
                          {#if typeof editStepFields[field] === 'object'}
                            <textarea
                              value={JSON.stringify(editStepFields[field], null, 2)}
                              oninput={(e) => {
                                try {
                                  editStepFields[field] = JSON.parse((e.target as HTMLTextAreaElement).value);
                                } catch {}
                              }}
                              rows="3"
                            ></textarea>
                          {:else}
                            <input
                              type="text"
                              value={editStepFields[field] ?? ''}
                              oninput={(e) => editStepFields[field] = (e.target as HTMLInputElement).value}
                            />
                          {/if}
                        </div>
                      {/each}
                    </div>
                    <div class="step-edit-buttons">
                      <button class="btn-save-small" onclick={saveStep} disabled={isSaving}>Save</button>
                      <button class="btn-cancel-small" onclick={cancelEditStep}>Cancel</button>
                    </div>
                  </div>
                {:else}
                  <div class="step-header">
                    <span class="step-number">{index + 1}</span>
                    <StepIcon stepType={step.type} size={20} />
                    <span class="step-type">{step.type}</span>
                    <div class="step-actions">
                      <button class="step-action-btn" onclick={() => startEditStep(index)} title="Edit">Edit</button>
                      <button class="step-action-btn danger" onclick={() => deleteStep(index)} title="Delete">Delete</button>
                    </div>
                  </div>
                  <div class="step-details">
                    {formatStepDetails(step)}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </section>

        <!-- Collapsible Sections with Editing -->
        <div class="collapsible-sections">
          <!-- Parameters Section -->
          <CollapsibleSection
            title="Parameters"
            count={hasParams ? Object.keys(action.params || {}).length : undefined}
            emptyLabel={hasParams ? undefined : "None"}
            bind:expanded={showParams}
            editable={!isEditingParams}
            onedit={startEditParams}
          >
            {#if isEditingParams}
              <div class="edit-block">
                <div class="params-edit-list">
                  {#each Object.entries(editParams) as [name, type]}
                    <div class="param-edit-item">
                      <span class="param-name">{name}</span>
                      <select bind:value={editParams[name]} class="param-type-select">
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                      </select>
                      <button class="btn-remove" onclick={() => removeParam(name)}>Remove</button>
                    </div>
                  {/each}
                </div>
                <div class="add-row">
                  <input type="text" bind:value={newParamName} placeholder="Parameter name" class="add-input" />
                  <select bind:value={newParamType} class="param-type-select">
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                  </select>
                  <button class="btn-add" onclick={addParam}>Add</button>
                </div>
                <div class="edit-buttons">
                  <button class="btn-save-small" onclick={saveParams} disabled={isSaving}>Save</button>
                  <button class="btn-cancel-small" onclick={cancelEditParams}>Cancel</button>
                </div>
              </div>
            {:else if hasParams}
              <div class="params-grid">
                {#each Object.entries(action.params || {}) as [name, type]}
                  <div class="param-card">
                    <span class="param-name">{name}</span>
                    <span class="param-type">{type}</span>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="empty-message">No parameters defined.</p>
            {/if}
          </CollapsibleSection>

          <!-- Allowed Domains Section -->
          <CollapsibleSection
            title="Allowed Domains"
            count={hasDomains ? action.policies?.allowed_domains?.length : undefined}
            emptyLabel={hasDomains ? undefined : "Any"}
            bind:expanded={showDomains}
            editable={!isEditingDomains}
            onedit={startEditDomains}
          >
            {#if isEditingDomains}
              <div class="edit-block">
                <div class="domains-edit-list">
                  {#each editDomains as domain}
                    <div class="domain-edit-item">
                      <span class="domain-tag">{domain}</span>
                      <button class="btn-remove" onclick={() => removeDomain(domain)}>Remove</button>
                    </div>
                  {/each}
                </div>
                <div class="add-row">
                  <input type="text" bind:value={newDomain} placeholder="example.com" class="add-input" />
                  <button class="btn-add" onclick={addDomain}>Add</button>
                </div>
                <div class="edit-buttons">
                  <button class="btn-save-small" onclick={saveDomains} disabled={isSaving}>Save</button>
                  <button class="btn-cancel-small" onclick={cancelEditDomains}>Cancel</button>
                </div>
              </div>
            {:else if hasDomains}
              <div class="domains-list">
                {#each action.policies?.allowed_domains ?? [] as domain}
                  <span class="domain-tag">{domain}</span>
                {/each}
              </div>
            {:else}
              <p class="empty-message">No domain restrictions.</p>
            {/if}
          </CollapsibleSection>

          <!-- Embedded Button Section -->
          <CollapsibleSection
            title="Embedded Button"
            configuredLabel={hasEmbed ? "Configured" : undefined}
            emptyLabel={hasEmbed ? undefined : "Not configured"}
            bind:expanded={showEmbed}
            editable={!isEditingEmbed}
            onedit={startEditEmbed}
          >
            {#if isEditingEmbed && editEmbed}
              <div class="edit-block embed-edit">
                <div class="embed-edit-row">
                  <label>Selector:</label>
                  <input type="text" bind:value={editEmbed.selector} placeholder=".button-class" />
                </div>
                <div class="embed-edit-row">
                  <label>Position:</label>
                  <select bind:value={editEmbed.position}>
                    <option value="before">Before</option>
                    <option value="after">After</option>
                    <option value="inside">Inside</option>
                  </select>
                </div>
                <div class="embed-edit-row">
                  <label>Label (optional):</label>
                  <input type="text" bind:value={editEmbed.label} placeholder="Run Action" />
                </div>
                <div class="embed-edit-row">
                  <label>URL Pattern (optional):</label>
                  <input type="text" bind:value={editEmbed.url_pattern} placeholder="*://example.com/*" />
                </div>
                <div class="edit-buttons">
                  <button class="btn-save-small" onclick={saveEmbed} disabled={isSaving}>Save</button>
                  <button class="btn-cancel-small" onclick={cancelEditEmbed}>Cancel</button>
                  {#if action.embed}
                    <button class="btn-danger-small" onclick={removeEmbed}>Remove</button>
                  {/if}
                </div>
              </div>
            {:else if action.embed}
              <div class="embed-info">
                <div class="embed-row">
                  <span class="embed-label">Selector</span>
                  <code class="embed-value">{action.embed.selector}</code>
                </div>
                <div class="embed-row">
                  <span class="embed-label">Position</span>
                  <span class="embed-value">{action.embed.position}</span>
                </div>
                {#if action.embed.label}
                  <div class="embed-row">
                    <span class="embed-label">Label</span>
                    <span class="embed-value">{action.embed.label}</span>
                  </div>
                {/if}
                {#if action.embed.url_pattern}
                  <div class="embed-row">
                    <span class="embed-label">URL Pattern</span>
                    <code class="embed-value">{action.embed.url_pattern}</code>
                  </div>
                {/if}
              </div>
            {:else}
              <p class="empty-message">No embedded button configured.</p>
            {/if}
          </CollapsibleSection>
        </div>

        <!-- Metadata Section -->
        <section class="section metadata-section">
          <h2>Metadata</h2>
          <div class="metadata-grid">
            <div class="metadata-item">
              <span class="metadata-label">ID</span>
              <code class="metadata-value">{action.id}</code>
            </div>
            <div class="metadata-item">
              <span class="metadata-label">File Path</span>
              <code class="metadata-value">actions/{action.id}.yaml</code>
            </div>
            {#if action.schema_version}
              <div class="metadata-item">
                <span class="metadata-label">Schema Version</span>
                <span class="metadata-value">{action.schema_version}</span>
              </div>
            {/if}
            {#if action.namespace}
              <div class="metadata-item">
                <span class="metadata-label">Namespace</span>
                <span class="metadata-value namespace-badge">{action.namespace}</span>
              </div>
            {/if}
            {#if action.parent_id}
              <div class="metadata-item">
                <span class="metadata-label">Forked From</span>
                <code class="metadata-value">{action.parent_id}</code>
              </div>
            {/if}
          </div>
        </section>

        <!-- Raw Config Section -->
        <section class="section">
          <button
            class="raw-config-toggle"
            class:expanded={showRawConfig}
            onclick={() => showRawConfig = !showRawConfig}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
            Raw Configuration
          </button>
          {#if showRawConfig}
            <div class="raw-config-content">
              <pre>{JSON.stringify(action, null, 2)}</pre>
            </div>
          {/if}
        </section>
      </div>
    {/if}
  </div>
</div>

<ParamsModal
  isOpen={showParamsModal}
  title="Run: {action?.title ?? ''}"
  params={action?.params ?? {}}
  {lastUsedParams}
  onRun={(params) => executeAction(params)}
  onCancel={() => showParamsModal = false}
/>

{#if showShortcutModal && action}
  <AddShortcutModal
    {action}
    existingShortcut={null}
    onsave={handleShortcutSave}
    oncancel={() => showShortcutModal = false}
  />
{/if}

<style>
  .detail-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #fafafa;
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
    gap: 8px;
    padding: 8px 16px;
    background: transparent;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    color: #666;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .back-btn:hover {
    background: #f0f0f0;
    color: #1a1a1a;
  }

  .back-btn svg {
    width: 16px;
    height: 16px;
  }

  .header-spacer {
    flex: 1;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .confirm-text {
    font-size: 0.9rem;
    color: #f57c00;
  }

  .btn-primary,
  .btn-secondary,
  .btn-danger {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 0.9rem;
    cursor: pointer;
    border: none;
    font-weight: 500;
  }

  .btn-primary {
    background: #4caf50;
    color: #fff;
  }

  .btn-primary:hover {
    background: #388e3c;
  }

  .btn-secondary {
    background: #f0f0f0;
    color: #666;
    border: 1px solid #e0e0e0;
  }

  .btn-secondary:hover {
    background: #e0e0e0;
    color: #1a1a1a;
  }

  .btn-danger {
    background: #ffebee;
    color: #c62828;
  }

  .btn-danger:hover {
    background: #ffcdd2;
  }

  .content {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
  }

  .loading,
  .error {
    text-align: center;
    padding: 40px;
    color: #666;
  }

  .error {
    color: #c62828;
  }

  .action-content {
    max-width: 900px;
  }

  .section {
    margin-bottom: 20px;
  }

  .section h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 16px;
    font-size: 0.95rem;
    font-weight: 600;
    color: #333;
  }

  /* Steps Section */
  .steps-section {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
  }

  .steps-section h2 svg {
    width: 18px;
    height: 18px;
    color: #666;
  }

  .count-badge {
    font-size: 0.75rem;
    padding: 2px 8px;
    background: #e3f2fd;
    color: #1976d2;
    border-radius: 10px;
    font-weight: 500;
  }

  .steps-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .step-card {
    background: #f8f9fa;
    border: 1px solid #e8e8e8;
    border-radius: 10px;
    padding: 14px 16px;
  }

  .step-card.editing {
    background: #fff;
    border-color: #2196f3;
  }

  .step-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  .step-number {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #e0e0e0;
    border-radius: 50%;
    font-size: 0.8rem;
    font-weight: 600;
    color: #555;
    flex-shrink: 0;
  }

  .step-type {
    font-family: ui-monospace, monospace;
    font-size: 0.9rem;
    font-weight: 500;
    color: #1a1a1a;
    flex: 1;
  }

  .step-details {
    margin-left: 38px;
    font-size: 0.85rem;
    color: #666;
    font-family: ui-monospace, monospace;
    word-break: break-word;
    line-height: 1.5;
  }

  .step-actions {
    display: flex;
    gap: 6px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .step-card:hover .step-actions {
    opacity: 1;
  }

  .step-action-btn {
    padding: 4px 10px;
    background: transparent;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    color: #666;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .step-action-btn:hover {
    background: #f0f0f0;
    color: #1a1a1a;
  }

  .step-action-btn.danger {
    color: #c62828;
  }

  .step-action-btn.danger:hover {
    background: #ffebee;
  }

  /* Step Edit Form */
  .step-edit-form {
    width: 100%;
  }

  .step-edit-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .step-edit-fields {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 12px;
  }

  .step-field-row {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .step-field-row label {
    min-width: 100px;
    font-size: 0.85rem;
    color: #666;
    padding-top: 8px;
  }

  .step-field-row input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .step-field-row textarea {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    font-size: 0.85rem;
    font-family: monospace;
    resize: vertical;
  }

  .step-edit-buttons {
    display: flex;
    gap: 8px;
  }

  /* Collapsible Sections */
  .collapsible-sections {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 20px;
  }

  .empty-message {
    color: #888;
    font-size: 0.9rem;
    margin: 0;
    font-style: italic;
  }

  /* Edit Block */
  .edit-block {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 16px;
  }

  .params-edit-list,
  .domains-edit-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
  }

  .param-edit-item,
  .domain-edit-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: #f8f9fa;
    border-radius: 6px;
  }

  .add-row {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  .add-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .param-type-select {
    padding: 8px 12px;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    font-size: 0.85rem;
    background: #fff;
  }

  .btn-add {
    padding: 8px 16px;
    background: #2196f3;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .btn-add:hover {
    background: #1976d2;
  }

  .btn-remove {
    padding: 4px 10px;
    background: transparent;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    color: #c62828;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .btn-remove:hover {
    background: #ffebee;
  }

  .edit-buttons {
    display: flex;
    gap: 8px;
  }

  .btn-save-small,
  .btn-cancel-small,
  .btn-danger-small {
    padding: 6px 14px;
    border-radius: 4px;
    font-size: 0.8rem;
    cursor: pointer;
    border: none;
  }

  .btn-save-small {
    background: #4caf50;
    color: #fff;
  }

  .btn-save-small:hover:not(:disabled) {
    background: #388e3c;
  }

  .btn-save-small:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-cancel-small {
    background: #f0f0f0;
    color: #666;
  }

  .btn-cancel-small:hover {
    background: #e0e0e0;
  }

  .btn-danger-small {
    background: #ffebee;
    color: #c62828;
  }

  .btn-danger-small:hover {
    background: #ffcdd2;
  }

  /* Params Grid */
  .params-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .param-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: #f8f9fa;
    border: 1px solid #e8e8e8;
    border-radius: 8px;
  }

  .param-name {
    font-weight: 500;
    color: #1a1a1a;
  }

  .param-type {
    font-size: 0.8rem;
    padding: 2px 8px;
    background: #e0e0e0;
    border-radius: 4px;
    color: #666;
    font-family: ui-monospace, monospace;
  }

  /* Domains List */
  .domains-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .domain-tag {
    padding: 6px 12px;
    background: #f8f9fa;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    font-size: 0.85rem;
    font-family: ui-monospace, monospace;
    color: #333;
  }

  /* Embed Edit */
  .embed-edit {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .embed-edit-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .embed-edit-row label {
    min-width: 120px;
    font-size: 0.85rem;
    color: #666;
  }

  .embed-edit-row input,
  .embed-edit-row select {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  /* Embed Info */
  .embed-info {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .embed-row {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .embed-label {
    font-size: 0.85rem;
    color: #666;
    min-width: 100px;
  }

  .embed-value {
    font-size: 0.85rem;
    color: #333;
  }

  code.embed-value {
    font-family: ui-monospace, monospace;
    padding: 4px 8px;
    background: #f5f5f5;
    border-radius: 4px;
    color: #7b1fa2;
  }

  /* Metadata Section */
  .metadata-section {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 20px;
  }

  .metadata-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  }

  .metadata-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    background: #f8f9fa;
    border-radius: 8px;
  }

  .metadata-label {
    font-size: 0.7rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .metadata-value {
    font-size: 0.85rem;
    color: #1a1a1a;
    word-break: break-all;
  }

  code.metadata-value {
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
  }

  .namespace-badge {
    display: inline-block;
    padding: 4px 10px;
    background: #e3f2fd;
    color: #1976d2;
    border-radius: 4px;
    font-weight: 500;
  }

  /* Raw Config */
  .raw-config-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    color: #666;
    cursor: pointer;
    font-size: 0.9rem;
    width: 100%;
    text-align: left;
  }

  .raw-config-toggle:hover {
    background: #f5f5f5;
    color: #1a1a1a;
  }

  .raw-config-toggle svg {
    width: 16px;
    height: 16px;
    transition: transform 0.2s;
  }

  .raw-config-toggle.expanded svg {
    transform: rotate(90deg);
  }

  .raw-config-content {
    margin-top: 12px;
    padding: 16px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    overflow-x: auto;
  }

  .raw-config-content pre {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
    line-height: 1.5;
    color: #333;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
