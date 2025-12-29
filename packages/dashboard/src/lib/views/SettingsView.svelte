<script lang="ts">
  import { onMount } from "svelte";
  import { getSettings, saveSettings } from "../api";
  import { navigateBack, settings as settingsStore } from "../stores";
  import type { Settings, FullLlmConfig, UserContext } from "../types";
  import { isLlmContext, isEnvContext } from "../types";
  import ContextModal from "../components/ContextModal.svelte";

  let isLoading = $state(true);
  let isSaving = $state(false);
  let isTesting = $state(false);
  let error = $state<string | null>(null);
  let saveSuccess = $state(false);
  let testResult = $state<{ success: boolean; message: string } | null>(null);
  let showApiKey = $state(false);

  // LLM config form state
  let provider = $state<string>('openai');
  let baseUrl = $state<string>('');
  let apiKey = $state<string>('');
  let model = $state<string>('');

  // User contexts state
  let userContexts = $state<UserContext[]>([]);

  // Modal state
  let showModal = $state(false);
  let editingContext = $state<UserContext | null>(null);

  // Delete confirmation state
  let deletingId = $state<string | null>(null);

  const providers = [
    { id: 'openai', name: 'OpenAI', defaultUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
    { id: 'anthropic', name: 'Anthropic', defaultUrl: 'https://api.anthropic.com', defaultModel: 'claude-3-5-sonnet-latest' },
    { id: 'ollama', name: 'Ollama', defaultUrl: 'http://localhost:11434/v1', defaultModel: 'llama3.2' },
  ];

  // Derived state for filtering contexts
  let llmContexts = $derived(userContexts.filter(isLlmContext));
  let envContexts = $derived(userContexts.filter(isEnvContext));

  async function loadSettings() {
    isLoading = true;
    error = null;
    try {
      const loaded = await getSettings();
      settingsStore.set(loaded);
      // Populate form
      if (loaded.llm) {
        provider = loaded.llm.provider || 'openai';
        baseUrl = loaded.llm.base_url || '';
        apiKey = loaded.llm.api_key || '';
        model = loaded.llm.model || '';
      }
      userContexts = loaded.user_contexts || [];
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
      // Simple validation - check if API key format looks correct
      if (!apiKey.trim()) {
        testResult = { success: false, message: 'API key is required' };
        return;
      }

      if (provider === 'openai' && !apiKey.startsWith('sk-')) {
        testResult = { success: false, message: 'OpenAI API keys should start with "sk-"' };
        return;
      }

      // For now, just validate format - actual connection test would need server endpoint
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
      // Update existing
      userContexts = userContexts.map(c => c.id === ctx.id ? ctx : c);
    } else {
      // Add new
      userContexts = [...userContexts, ctx];
    }
    // Auto-save contexts
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

  onMount(() => {
    loadSettings();
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

  <div class="content">
    {#if isLoading}
      <div class="loading">Loading settings...</div>
    {:else}
      <div class="settings-columns">
        <!-- Left Column: LLM Provider -->
        <section class="settings-card llm-card">
          <h2>LLM Provider</h2>

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

          <div class="actions">
            <button class="btn-secondary" onclick={handleTestConnection} disabled={isTesting}>
              {isTesting ? 'Testing...' : 'Test Connection'}
            </button>
            <button class="btn-primary" onclick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </section>

        <!-- Right Column: User Context -->
        <section class="settings-card context-card">
          <div class="card-header">
            <h2>User Context</h2>
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
        </section>
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

  .settings-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    max-width: 1100px;
  }

  @media (max-width: 900px) {
    .settings-columns {
      grid-template-columns: 1fr;
    }
  }

  .settings-card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    padding: 24px;
  }

  .settings-card h2 {
    margin: 0 0 20px;
    font-size: 1rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  /* LLM Card */
  .llm-card {
    display: flex;
    flex-direction: column;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 20px;
    padding-bottom: 20px;
    border-bottom: 1px solid #eee;
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
    margin-bottom: 20px;
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
    margin-bottom: 16px;
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
    margin-top: auto;
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

  /* Context Card */
  .context-card {
    display: flex;
    flex-direction: column;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .card-header h2 {
    margin: 0;
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
    flex: 1;
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
    position: relative;
    padding: 12px 14px;
    background: #fafafa;
    border: 1px solid #eee;
    border-radius: 6px;
    transition: all 0.15s ease;
  }

  .context-item:hover {
    border-color: #ddd;
  }

  .context-item.deleting {
    background: #fef2f2;
    border-color: #fecaca;
    text-align: center;
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

  .context-text {
    margin: 0;
    font-size: 0.85rem;
    color: #444;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    padding-right: 60px;
  }

  .item-actions {
    position: absolute;
    top: 10px;
    right: 10px;
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
</style>
