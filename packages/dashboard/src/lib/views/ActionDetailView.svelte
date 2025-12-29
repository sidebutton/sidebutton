<script lang="ts">
  import { onMount } from "svelte";
  import { getAction, runWorkflow, deleteAction, publishAction, updateAction, getSettings, saveSettings } from "../api";
  import {
    viewState,
    navigateBack,
    navigateToActions,
    navigateToExecution,
    showToast,
  } from "../stores";
  import type { Action, DashboardShortcut, CategoryLevel, CategoryDomain } from "../types";
  import { CATEGORY_LEVELS, CATEGORY_DOMAINS } from "../types";
  import CategoryBadge from "../components/CategoryBadge.svelte";
  import StepIcon from "../components/StepIcon.svelte";
  import ParamsModal from "../components/ParamsModal.svelte";
  import AddShortcutModal from "../components/AddShortcutModal.svelte";

  let action = $state<Action | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let showParamsModal = $state(false);
  let showDeleteConfirm = $state(false);
  let lastUsedParams = $state<Record<string, string>>({});
  let showRawConfig = $state(false);
  let isSaving = $state(false);

  // Shortcut modal state
  let showShortcutModal = $state(false);

  // Editing state
  let isEditingTitle = $state(false);
  let isEditingDescription = $state(false);
  let editTitle = $state("");
  let editDescription = $state("");

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

  // Category editing state
  let isEditingCategory = $state(false);
  let editCategoryLevel = $state<CategoryLevel>("task");
  let editCategoryDomain = $state<CategoryDomain>("personal");

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
      showToast(`"${action.title}" published to Workflows`, "success");
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

  // Title/Description editing
  function startEditTitle() {
    if (!action) return;
    editTitle = action.title;
    isEditingTitle = true;
  }

  async function saveTitle() {
    if (!action || !editTitle.trim()) return;
    action.title = editTitle.trim();
    await saveAction();
    isEditingTitle = false;
  }

  function cancelEditTitle() {
    isEditingTitle = false;
    editTitle = "";
  }

  function startEditDescription() {
    if (!action) return;
    editDescription = action.description || "";
    isEditingDescription = true;
  }

  async function saveDescription() {
    if (!action) return;
    action.description = editDescription.trim() || undefined;
    await saveAction();
    isEditingDescription = false;
  }

  function cancelEditDescription() {
    isEditingDescription = false;
    editDescription = "";
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

  // Category editing
  function startEditCategory() {
    if (!action) return;
    editCategoryLevel = action.category?.level || "task";
    editCategoryDomain = action.category?.domain || "personal";
    isEditingCategory = true;
  }

  async function saveCategory() {
    if (!action) return;
    action.category = {
      level: editCategoryLevel,
      domain: editCategoryDomain,
    };
    await saveAction();
    isEditingCategory = false;
  }

  function cancelEditCategory() {
    isEditingCategory = false;
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
    if (!action || !confirm("Delete this step?")) return;
    action.steps = action.steps.filter((_, i) => i !== index);
    await saveAction();
  }

  function formatStepDetails(step: { type: string; [key: string]: unknown }): string {
    switch (step.type) {
      case "browser.navigate":
        return step.url as string || "";
      case "browser.click":
      case "browser.type":
      case "browser.wait":
      case "browser.extract":
      case "browser.hover":
        return step.selector as string || "";
      case "shell.run":
        return step.cmd as string || "";
      case "workflow.call":
        return step.workflow as string || "";
      case "llm.generate":
        return (step.prompt as string)?.slice(0, 50) + "..." || "";
      default:
        return "";
    }
  }

  function getStepEditableFields(stepType: string): string[] {
    const commonFields = ["type"];
    switch (stepType) {
      case "browser.navigate":
        return [...commonFields, "url"];
      case "browser.click":
        return [...commonFields, "selector", "timeout"];
      case "browser.type":
        return [...commonFields, "selector", "text", "timeout"];
      case "browser.wait":
        return [...commonFields, "selector", "timeout"];
      case "browser.extract":
        return [...commonFields, "selector", "attribute", "as"];
      case "browser.extractAll":
        return [...commonFields, "selector", "attribute", "as"];
      case "browser.hover":
        return [...commonFields, "selector"];
      case "browser.scroll":
        return [...commonFields, "selector", "direction", "amount"];
      case "browser.exists":
        return [...commonFields, "selector", "as"];
      case "browser.key":
        return [...commonFields, "key"];
      case "shell.run":
        return [...commonFields, "cmd", "cwd"];
      case "terminal.open":
        return [...commonFields, "cwd"];
      case "terminal.run":
        return [...commonFields, "cmd"];
      case "workflow.call":
        return [...commonFields, "workflow", "params"];
      case "llm.generate":
        return [...commonFields, "prompt", "as"];
      case "llm.classify":
        return [...commonFields, "prompt", "options", "as"];
      case "control.if":
        return [...commonFields, "condition", "then", "else"];
      case "control.retry":
        return [...commonFields, "max_attempts", "steps"];
      case "control.stop":
        return [...commonFields, "message"];
      case "data.first":
        return [...commonFields, "from", "as"];
      default:
        return commonFields;
    }
  }

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
      <div class="loading">Loading action...</div>
    {:else if error}
      <div class="error">{error}</div>
    {:else if action}
      <div class="action-info">
        <!-- Title Row with Edit -->
        <div class="title-row">
          {#if isEditingTitle}
            <div class="edit-inline">
              <input type="text" bind:value={editTitle} class="edit-input title-input" />
              <button class="btn-save-small" onclick={saveTitle} disabled={isSaving}>Save</button>
              <button class="btn-cancel-small" onclick={cancelEditTitle}>Cancel</button>
            </div>
          {:else}
            <h1 onclick={startEditTitle} class="editable" title="Click to edit">{action.title}</h1>
          {/if}
          <div class="badges">
            {#if action.version}
              <span class="version-badge">v{action.version}</span>
            {/if}
            {#if action.last_verified}
              <span class="verified-badge" title="Verified: {action.last_verified}">Verified</span>
            {/if}
            {#if action.parent_id}
              <span class="forked-badge" title="Forked from: {action.parent_id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="18" r="3" />
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="18" cy="6" r="3" />
                  <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" />
                  <path d="M12 12v3" />
                </svg>
                Forked
              </span>
            {/if}
          </div>
        </div>

        <!-- Description with Edit -->
        {#if isEditingDescription}
          <div class="edit-inline description-edit">
            <textarea bind:value={editDescription} class="edit-textarea" rows="2" placeholder="Add a description..."></textarea>
            <div class="edit-buttons">
              <button class="btn-save-small" onclick={saveDescription} disabled={isSaving}>Save</button>
              <button class="btn-cancel-small" onclick={cancelEditDescription}>Cancel</button>
            </div>
          </div>
        {:else if action.description}
          <p class="description editable" onclick={startEditDescription} title="Click to edit">{action.description}</p>
        {:else}
          <p class="description placeholder editable" onclick={startEditDescription}>Click to add description...</p>
        {/if}

        <!-- Category with Edit -->
        <div class="meta-row">
          {#if isEditingCategory}
            <div class="edit-inline category-edit">
              <select bind:value={editCategoryLevel} class="edit-select">
                {#each Object.entries(CATEGORY_LEVELS) as [key, info]}
                  <option value={key}>{info.label}</option>
                {/each}
              </select>
              <select bind:value={editCategoryDomain} class="edit-select">
                {#each Object.entries(CATEGORY_DOMAINS) as [key, info]}
                  <option value={key}>{info.label}</option>
                {/each}
              </select>
              <button class="btn-save-small" onclick={saveCategory} disabled={isSaving}>Save</button>
              <button class="btn-cancel-small" onclick={cancelEditCategory}>Cancel</button>
            </div>
          {:else}
            <div class="editable" onclick={startEditCategory} title="Click to edit">
              {#if action.category}
                <CategoryBadge level={action.category.level} domain={action.category.domain} />
              {:else}
                <span class="placeholder">Click to set category...</span>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Metadata Info -->
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

        <!-- Parameters Section with Editing -->
        <section class="section">
          <div class="section-header-row">
            <h2>Parameters</h2>
            {#if !isEditingParams}
              <button class="btn-edit" onclick={startEditParams}>Edit</button>
            {/if}
          </div>
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
              <div class="add-param-row">
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
          {:else if action.params && Object.keys(action.params).length > 0}
            <div class="params-list">
              {#each Object.entries(action.params) as [name, type]}
                <div class="param-item">
                  <span class="param-name">{name}</span>
                  <span class="param-type">{type}</span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="empty-section">No parameters defined</div>
          {/if}
        </section>

        <!-- Allowed Domains Section with Editing -->
        <section class="section">
          <div class="section-header-row">
            <h2>Allowed Domains</h2>
            {#if !isEditingDomains}
              <button class="btn-edit" onclick={startEditDomains}>Edit</button>
            {/if}
          </div>
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
              <div class="add-domain-row">
                <input type="text" bind:value={newDomain} placeholder="example.com" class="add-input" />
                <button class="btn-add" onclick={addDomain}>Add</button>
              </div>
              <div class="edit-buttons">
                <button class="btn-save-small" onclick={saveDomains} disabled={isSaving}>Save</button>
                <button class="btn-cancel-small" onclick={cancelEditDomains}>Cancel</button>
              </div>
            </div>
          {:else if action.policies?.allowed_domains?.length}
            <div class="domains-list">
              {#each action.policies.allowed_domains as domain}
                <span class="domain-tag">{domain}</span>
              {/each}
            </div>
          {:else}
            <div class="empty-section">No domain restrictions</div>
          {/if}
        </section>

        <!-- Embed Config Section with Editing -->
        <section class="section">
          <div class="section-header-row">
            <h2>Embedded Button</h2>
            {#if !isEditingEmbed}
              <button class="btn-edit" onclick={startEditEmbed}>{action.embed ? 'Edit' : 'Add'}</button>
            {/if}
          </div>
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
                  <button class="btn-danger-small" onclick={removeEmbed}>Remove Embed</button>
                {/if}
              </div>
            </div>
          {:else if action.embed}
            <div class="embed-info">
              <div class="embed-row">
                <span class="label">Selector:</span>
                <code>{action.embed.selector}</code>
              </div>
              <div class="embed-row">
                <span class="label">Position:</span>
                <span>{action.embed.position}</span>
              </div>
              {#if action.embed.label}
                <div class="embed-row">
                  <span class="label">Label:</span>
                  <span>{action.embed.label}</span>
                </div>
              {/if}
              {#if action.embed.url_pattern}
                <div class="embed-row">
                  <span class="label">URL Pattern:</span>
                  <code>{action.embed.url_pattern}</code>
                </div>
              {/if}
            </div>
          {:else}
            <div class="empty-section">No embedded button configured</div>
          {/if}
        </section>

        <!-- Steps Section with Editing -->
        <section class="section">
          <h2>Steps ({action.steps?.length ?? 0})</h2>
          <div class="steps-list">
            {#each action.steps ?? [] as step, index}
              <div class="step-item" class:editing={editingStepIndex === index}>
                {#if editingStepIndex === index}
                  <div class="step-edit-form">
                    <div class="step-edit-header">
                      <span class="step-number">{index + 1}</span>
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
                  <span class="step-number">{index + 1}</span>
                  <StepIcon stepType={step.type} size={18} />
                  <span class="step-type">{step.type}</span>
                  <span class="step-details">{formatStepDetails(step)}</span>
                  <div class="step-actions">
                    <button class="step-action-btn" onclick={() => startEditStep(index)} title="Edit">Edit</button>
                    <button class="step-action-btn danger" onclick={() => deleteStep(index)} title="Delete">Delete</button>
                  </div>
                {/if}
              </div>
            {/each}
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

  .action-info {
    max-width: 800px;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .editable {
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.15s;
  }

  .editable:hover {
    background: #f0f0f0;
  }

  h1.editable {
    padding: 4px 8px;
    margin: -4px -8px;
  }

  .badges {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .version-badge,
  .verified-badge,
  .forked-badge {
    font-size: 0.75rem;
    padding: 4px 10px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .version-badge {
    background: #f0f0f0;
    color: #666;
  }

  .verified-badge {
    background: #e8f5e9;
    color: #388e3c;
  }

  .forked-badge {
    background: #f3e5f5;
    color: #7b1fa2;
  }

  .forked-badge svg {
    width: 14px;
    height: 14px;
  }

  .description {
    margin: 0 0 16px;
    color: #666;
    font-size: 0.95rem;
    line-height: 1.5;
    padding: 4px 8px;
    margin-left: -8px;
  }

  .description.placeholder {
    color: #999;
    font-style: italic;
  }

  .meta-row {
    margin-bottom: 24px;
  }

  .section {
    margin-bottom: 24px;
  }

  .section h2 {
    margin: 0 0 12px;
    font-size: 0.9rem;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .section-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .section-header-row h2 {
    margin: 0;
  }

  .btn-edit {
    padding: 4px 12px;
    background: transparent;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    color: #666;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .btn-edit:hover {
    background: #f0f0f0;
    color: #1a1a1a;
  }

  .edit-inline {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .description-edit {
    flex-direction: column;
    align-items: stretch;
    margin-bottom: 16px;
  }

  .category-edit {
    gap: 8px;
  }

  .edit-input {
    padding: 8px 12px;
    border: 1px solid #2196f3;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .title-input {
    font-size: 1.5rem;
    font-weight: 600;
    min-width: 300px;
  }

  .edit-textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #2196f3;
    border-radius: 6px;
    font-size: 0.95rem;
    font-family: inherit;
    resize: vertical;
  }

  .edit-select {
    padding: 8px 12px;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    font-size: 0.85rem;
    background: #fff;
  }

  .edit-buttons {
    display: flex;
    gap: 8px;
    margin-top: 8px;
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

  .add-param-row,
  .add-domain-row {
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

  .params-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .param-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
  }

  .param-name {
    font-weight: 500;
    color: #1a1a1a;
  }

  .param-type {
    font-size: 0.8rem;
    padding: 2px 8px;
    background: #f0f0f0;
    border-radius: 4px;
    color: #666;
    font-family: monospace;
  }

  .domains-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .domain-tag {
    padding: 6px 12px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    font-size: 0.85rem;
    font-family: monospace;
    color: #333;
  }

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

  .embed-info {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 14px;
  }

  .embed-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 0;
  }

  .embed-row .label {
    font-size: 0.85rem;
    color: #666;
    min-width: 100px;
  }

  .embed-row code {
    font-size: 0.85rem;
    padding: 4px 8px;
    background: #f5f5f5;
    border-radius: 4px;
    color: #7b1fa2;
  }

  .empty-section {
    color: #999;
    font-size: 0.9rem;
    font-style: italic;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 6px;
  }

  .placeholder {
    color: #999;
    font-style: italic;
  }

  .steps-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .step-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    position: relative;
  }

  .step-item.editing {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .step-number {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f0f0f0;
    border-radius: 50%;
    font-size: 0.75rem;
    color: #666;
    flex-shrink: 0;
  }

  .step-type {
    font-family: monospace;
    font-size: 0.85rem;
    color: #1a1a1a;
    min-width: 140px;
  }

  .step-details {
    flex: 1;
    font-size: 0.8rem;
    color: #888;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .step-actions {
    display: flex;
    gap: 6px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .step-item:hover .step-actions {
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
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
  }

  .metadata-label {
    font-size: 0.75rem;
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
    font-family: monospace;
    background: #f5f5f5;
    padding: 4px 8px;
    border-radius: 4px;
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

  .raw-config-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
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
    font-family: monospace;
    font-size: 0.8rem;
    line-height: 1.5;
    color: #333;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
