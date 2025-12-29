<script lang="ts">
  import type { ParamType } from '../types';

  interface Props {
    isOpen?: boolean;
    title?: string;
    params?: Record<string, ParamType>;
    lastUsedParams?: Record<string, string>;
    onRun?: (params: Record<string, string>) => void;
    onCancel?: () => void;
  }
  let { isOpen = false, title = 'Run Workflow', params = {}, lastUsedParams = {}, onRun = () => {}, onCancel = () => {} }: Props = $props();

  let paramValues = $state<Record<string, string>>({});

  function getDefaultValue(type: ParamType): string {
    switch (type) {
      case 'boolean':
        return 'false';
      case 'number':
        return '0';
      default:
        return '';
    }
  }

  // Initialize param values when modal opens
  $effect(() => {
    if (isOpen) {
      const newValues: Record<string, string> = {};
      for (const [key, type] of Object.entries(params)) {
        newValues[key] = lastUsedParams[key] ?? getDefaultValue(type);
      }
      paramValues = newValues;
    }
  });

  function handleSubmit() {
    onRun({ ...paramValues });
  }

  function handleCancel() {
    onCancel();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleCancel();
    } else if (event.key === 'Enter' && event.metaKey) {
      handleSubmit();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      handleCancel();
    }
  }

  let paramEntries = $derived(Object.entries(params));
  let hasParams = $derived(paramEntries.length > 0);
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={handleBackdropClick}>
    <div class="modal">
      <div class="modal-header">
        <h2>{title}</h2>
        <button class="close-btn" onclick={handleCancel}>&times;</button>
      </div>

      <div class="modal-body">
        {#if hasParams}
          <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            {#each paramEntries as [key, type]}
              <div class="form-group">
                <label for={key}>
                  {key}
                  <span class="type-badge">{type}</span>
                </label>
                {#if type === 'boolean'}
                  <select id={key} bind:value={paramValues[key]}>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                {:else}
                  <input
                    id={key}
                    type={type === 'number' ? 'number' : 'text'}
                    bind:value={paramValues[key]}
                    placeholder={`Enter ${key}`}
                  />
                {/if}
              </div>
            {/each}
          </form>
        {:else}
          <p class="no-params">This workflow has no parameters.</p>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick={handleCancel}>Cancel</button>
        <button class="btn-primary" onclick={handleSubmit}>
          Run
        </button>
      </div>

      <div class="hint">
        Press <kbd>Cmd+Enter</kbd> to run, <kbd>Esc</kbd> to cancel
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    width: 90%;
    max-width: 480px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid #e0e0e0;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.1rem;
    color: #1a1a1a;
  }

  .close-btn {
    background: none;
    border: none;
    color: #888;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: #1a1a1a;
  }

  .modal-body {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    color: #333;
    font-size: 0.9rem;
  }

  .type-badge {
    font-size: 0.7rem;
    padding: 2px 6px;
    background: #f0f0f0;
    border-radius: 4px;
    color: #666;
  }

  .form-group input,
  .form-group select {
    width: 100%;
    padding: 10px 12px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    color: #1a1a1a;
    font-size: 0.95rem;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: #2196f3;
    box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
  }

  .no-params {
    color: #666;
    text-align: center;
    padding: 20px;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 20px;
    border-top: 1px solid #e0e0e0;
    background: #f8f9fa;
  }

  .btn-primary,
  .btn-secondary {
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
    border: none;
  }

  .btn-primary {
    background: #2196f3;
    color: #fff;
  }

  .btn-primary:hover {
    background: #1976d2;
  }

  .btn-secondary {
    background: #fff;
    color: #666;
    border: 1px solid #e0e0e0;
  }

  .btn-secondary:hover {
    background: #f0f0f0;
  }

  .hint {
    text-align: center;
    padding: 8px;
    font-size: 0.75rem;
    color: #888;
    border-top: 1px solid #e9ecef;
  }

  kbd {
    background: #f0f0f0;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: monospace;
    border: 1px solid #e0e0e0;
  }
</style>
