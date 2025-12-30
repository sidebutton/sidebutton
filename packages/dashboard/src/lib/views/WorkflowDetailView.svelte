<script lang="ts">
  import { onMount } from "svelte";
  import { getWorkflow, runWorkflow, copyWorkflowToActions, getWorkflowStats } from "../api";
  import {
    viewState,
    navigateBack,
    navigateToWorkflowExecution,
    navigateToActionDetail,
  } from "../stores";
  import type { Action, WorkflowStats } from "../types";
  import DetailViewHero from "../components/DetailViewHero.svelte";
  import DetailViewStatsBar from "../components/DetailViewStatsBar.svelte";
  import DetailViewSteps from "../components/DetailViewSteps.svelte";
  import CollapsibleSection from "../components/CollapsibleSection.svelte";
  import ParamsModal from "../components/ParamsModal.svelte";

  let workflow = $state<Action | null>(null);
  let stats = $state<WorkflowStats | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let showParamsModal = $state(false);
  let lastUsedParams = $state<Record<string, string>>({});
  let showRawConfig = $state(false);

  // Collapsible sections state
  let showParams = $state(true);
  let showDomains = $state(true);
  let showEmbed = $state(true);

  async function loadWorkflow() {
    const workflowId = $viewState.selectedWorkflowId;
    if (!workflowId) return;

    isLoading = true;
    error = null;
    try {
      workflow = await getWorkflow(workflowId);
      // Load last used params from localStorage
      const stored = localStorage.getItem(`params_${workflowId}`);
      if (stored) {
        lastUsedParams = JSON.parse(stored);
      }
      // Load stats
      try {
        stats = await getWorkflowStats(workflowId);
      } catch {
        // Stats are optional
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load workflow";
      console.error("Failed to load workflow:", e);
    } finally {
      isLoading = false;
    }
  }

  function handleRunClick() {
    if (!workflow) return;
    const paramKeys = Object.keys(workflow.params || {});
    if (paramKeys.length > 0) {
      showParamsModal = true;
    } else {
      executeWorkflow({});
    }
  }

  async function executeWorkflow(params: Record<string, string>) {
    if (!workflow) return;

    // Save params for next time
    if (Object.keys(params).length > 0) {
      localStorage.setItem(`params_${workflow.id}`, JSON.stringify(params));
    }

    try {
      const result = await runWorkflow(workflow.id, params);
      showParamsModal = false;
      navigateToWorkflowExecution(workflow.id, result.run_id);
    } catch (e) {
      console.error("Failed to run workflow:", e);
      error = e instanceof Error ? e.message : "Failed to run workflow";
    }
  }

  async function handleCopyToActions() {
    if (!workflow) return;
    try {
      const action = await copyWorkflowToActions(workflow.id);
      navigateToActionDetail(action.id);
    } catch (e) {
      console.error("Failed to copy:", e);
      error = e instanceof Error ? e.message : "Failed to copy to actions";
    }
  }

  let hasParams = $derived(workflow?.params && Object.keys(workflow.params).length > 0);
  let hasDomains = $derived(workflow?.policies?.allowed_domains?.length ?? 0 > 0);
  let hasEmbed = $derived(!!workflow?.embed);

  onMount(() => {
    loadWorkflow();
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
      <button class="btn-secondary" onclick={handleCopyToActions}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        Copy to My Actions
      </button>
      <button class="btn-primary" onclick={handleRunClick}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        Run
      </button>
    </div>
  </header>

  <div class="content">
    {#if isLoading}
      <div class="loading">Loading...</div>
    {:else if error}
      <div class="error">{error}</div>
    {:else if workflow}
      <DetailViewHero
        title={workflow.title}
        description={workflow.description}
        version={workflow.version}
        lastVerified={workflow.last_verified}
        category={workflow.category}
        parentId={workflow.parent_id}
        editable={false}
      />

      <DetailViewStatsBar stats={stats} lastVerified={workflow.last_verified} />

      <div class="workflow-content">
        <DetailViewSteps steps={workflow.steps ?? []} editable={false} />

        <!-- Collapsible Sections -->
        <div class="collapsible-sections">
          <CollapsibleSection
            title="Parameters"
            count={hasParams ? Object.keys(workflow.params || {}).length : undefined}
            emptyLabel={hasParams ? undefined : "None"}
            bind:expanded={showParams}
          >
            {#if hasParams}
              <div class="params-grid">
                {#each Object.entries(workflow.params || {}) as [name, type]}
                  <div class="param-card">
                    <span class="param-name">{name}</span>
                    <span class="param-type">{type}</span>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="empty-message">This workflow has no parameters.</p>
            {/if}
          </CollapsibleSection>

          <CollapsibleSection
            title="Allowed Domains"
            count={hasDomains ? workflow.policies?.allowed_domains?.length : undefined}
            emptyLabel={hasDomains ? undefined : "Any"}
            bind:expanded={showDomains}
          >
            {#if hasDomains}
              <div class="domains-list">
                {#each workflow.policies?.allowed_domains ?? [] as domain}
                  <span class="domain-tag">{domain}</span>
                {/each}
              </div>
            {:else}
              <p class="empty-message">This workflow can run on any domain.</p>
            {/if}
          </CollapsibleSection>

          <CollapsibleSection
            title="Embedded Button"
            configuredLabel={hasEmbed ? "Configured" : undefined}
            emptyLabel={hasEmbed ? undefined : "Not configured"}
            bind:expanded={showEmbed}
          >
            {#if workflow.embed}
              <div class="embed-info">
                <div class="embed-row">
                  <span class="embed-label">Selector</span>
                  <code class="embed-value">{workflow.embed.selector}</code>
                </div>
                <div class="embed-row">
                  <span class="embed-label">Position</span>
                  <span class="embed-value">{workflow.embed.position}</span>
                </div>
                {#if workflow.embed.label}
                  <div class="embed-row">
                    <span class="embed-label">Label</span>
                    <span class="embed-value">{workflow.embed.label}</span>
                  </div>
                {/if}
                {#if workflow.embed.url_pattern}
                  <div class="embed-row">
                    <span class="embed-label">URL Pattern</span>
                    <code class="embed-value">{workflow.embed.url_pattern}</code>
                  </div>
                {/if}
              </div>
            {:else}
              <p class="empty-message">No embedded button configured for this workflow.</p>
            {/if}
          </CollapsibleSection>
        </div>

        <!-- Metadata Section -->
        <section class="section metadata-section">
          <h2>Metadata</h2>
          <div class="metadata-grid">
            <div class="metadata-item">
              <span class="metadata-label">ID</span>
              <code class="metadata-value">{workflow.id}</code>
            </div>
            <div class="metadata-item">
              <span class="metadata-label">File Path</span>
              <code class="metadata-value">workflows/{workflow.id}.yaml</code>
            </div>
            {#if workflow.schema_version}
              <div class="metadata-item">
                <span class="metadata-label">Schema Version</span>
                <span class="metadata-value">{workflow.schema_version}</span>
              </div>
            {/if}
            {#if workflow.namespace}
              <div class="metadata-item">
                <span class="metadata-label">Namespace</span>
                <span class="metadata-value namespace-badge">{workflow.namespace}</span>
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
              <pre>{JSON.stringify(workflow, null, 2)}</pre>
            </div>
          {/if}
        </section>
      </div>
    {/if}
  </div>
</div>

<ParamsModal
  isOpen={showParamsModal}
  title="Run: {workflow?.title ?? ''}"
  params={workflow?.params ?? {}}
  {lastUsedParams}
  onRun={(params) => executeWorkflow(params)}
  onCancel={() => showParamsModal = false}
/>

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
    gap: 12px;
  }

  .btn-primary,
  .btn-secondary {
    display: flex;
    align-items: center;
    gap: 8px;
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

  .btn-primary svg,
  .btn-secondary svg {
    width: 16px;
    height: 16px;
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

  .workflow-content {
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
