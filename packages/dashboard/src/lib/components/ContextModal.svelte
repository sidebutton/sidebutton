<script lang="ts">
  import type { UserContext } from "../types";

  interface Props {
    isOpen: boolean;
    editingContext?: UserContext | null;
    onClose: () => void;
    onSave: (context: UserContext) => void;
  }

  let { isOpen, editingContext = null, onClose, onSave }: Props = $props();

  let contextType = $state<'llm' | 'env'>('llm');
  let industry = $state('');
  let domain = $state('');
  let context = $state('');
  let envName = $state('');
  let envValue = $state('');

  const industries = [
    'Engineering',
    'Sales',
    'Support',
    'Marketing',
    'Finance',
    'HR',
    'Operations',
    'Research',
    'Personal'
  ];

  $effect(() => {
    if (editingContext) {
      if (editingContext.type === 'llm') {
        contextType = 'llm';
        industry = editingContext.industry || '';
        domain = editingContext.domain || '';
        context = editingContext.context || '';
        envName = '';
        envValue = '';
      } else {
        contextType = 'env';
        envName = editingContext.name || '';
        envValue = editingContext.value || '';
        industry = '';
        domain = '';
        context = '';
      }
    } else {
      resetForm();
    }
  });

  function resetForm() {
    contextType = 'llm';
    industry = '';
    domain = '';
    context = '';
    envName = '';
    envValue = '';
  }

  function handleSave() {
    const id = editingContext?.id || crypto.randomUUID();

    if (contextType === 'llm') {
      if (!context.trim()) return;
      onSave({
        type: 'llm',
        id,
        industry: industry.trim() || undefined,
        domain: domain.trim() || undefined,
        context: context.trim(),
      });
    } else {
      if (!envName.trim() || !envValue.trim()) return;
      onSave({
        type: 'env',
        id,
        name: envName.trim(),
        value: envValue.trim(),
      });
    }

    resetForm();
    onClose();
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }
</script>

{#if isOpen}
  <div class="modal-backdrop" onclick={handleBackdropClick} role="dialog" aria-modal="true">
    <div class="modal">
      <header class="modal-header">
        <h2>{editingContext ? 'Edit' : 'Add'} Context</h2>
        <button class="close-btn" onclick={handleClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div class="modal-body">
        {#if !editingContext}
          <div class="type-selector">
            <button
              class="type-btn"
              class:active={contextType === 'llm'}
              onclick={() => contextType = 'llm'}
            >
              <span class="type-icon">AI</span>
              LLM Context
            </button>
            <button
              class="type-btn"
              class:active={contextType === 'env'}
              onclick={() => contextType = 'env'}
            >
              <span class="type-icon">$</span>
              Environment Variable
            </button>
          </div>
        {/if}

        <div class="form-content">
          {#if contextType === 'llm'}
            <div class="form-group">
              <label for="industry">Industry</label>
              <select id="industry" bind:value={industry}>
                <option value="">Select industry (optional)</option>
                {#each industries as ind}
                  <option value={ind}>{ind}</option>
                {/each}
              </select>
            </div>

            <div class="form-group">
              <label for="domain">Domain</label>
              <input
                id="domain"
                type="text"
                bind:value={domain}
                placeholder="e.g., linkedin.com, github.com"
              />
              <span class="hint">Optional: Limit context to specific domains</span>
            </div>

            <div class="form-group">
              <label for="context">Context Instructions</label>
              <textarea
                id="context"
                bind:value={context}
                placeholder="Custom instructions for the AI when this context applies..."
                rows="4"
              ></textarea>
            </div>
          {:else}
            <div class="form-group">
              <label for="env-name">Variable Name</label>
              <input
                id="env-name"
                type="text"
                bind:value={envName}
                placeholder="e.g., github_base_path"
              />
              <span class="hint">Access via {"{{env.name}}"} in workflows</span>
            </div>

            <div class="form-group">
              <label for="env-value">Value</label>
              <input
                id="env-value"
                type="text"
                bind:value={envValue}
                placeholder="e.g., /Users/me/Documents/GitHub"
              />
            </div>
          {/if}
        </div>
      </div>

      <footer class="modal-footer">
        <button class="btn-cancel" onclick={handleClose}>Cancel</button>
        <button class="btn-save" onclick={handleSave}>
          {editingContext ? 'Update' : 'Add'} {contextType === 'llm' ? 'Context' : 'Variable'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal {
    background: #fff;
    border-radius: 12px;
    width: 90%;
    max-width: 480px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    animation: slideUp 0.2s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid #e8e8e8;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #888;
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    background: #f0f0f0;
    color: #1a1a1a;
  }

  .close-btn svg {
    width: 18px;
    height: 18px;
  }

  .modal-body {
    padding: 24px;
    overflow-y: auto;
  }

  .type-selector {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 24px;
  }

  .type-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    background: #f8f8f8;
    border: 2px solid transparent;
    border-radius: 10px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    color: #666;
    transition: all 0.15s ease;
  }

  .type-btn:hover {
    background: #f0f0f0;
    color: #1a1a1a;
  }

  .type-btn.active {
    background: #e8f4fc;
    border-color: #2196f3;
    color: #1976d2;
  }

  .type-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #e0e0e0;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 700;
    font-family: monospace;
  }

  .type-btn.active .type-icon {
    background: #2196f3;
    color: #fff;
  }

  .form-content {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-group label {
    font-size: 0.85rem;
    font-weight: 500;
    color: #444;
  }

  .form-group input,
  .form-group select,
  .form-group textarea {
    padding: 10px 12px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 0.9rem;
    color: #1a1a1a;
    transition: border-color 0.15s ease;
  }

  .form-group input:focus,
  .form-group select:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #2196f3;
  }

  .form-group textarea {
    resize: vertical;
    min-height: 100px;
    font-family: inherit;
    line-height: 1.5;
  }

  .form-group select {
    cursor: pointer;
  }

  .hint {
    font-size: 0.75rem;
    color: #888;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid #e8e8e8;
    background: #fafafa;
  }

  .btn-cancel {
    padding: 10px 20px;
    background: transparent;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    color: #666;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-cancel:hover {
    background: #f0f0f0;
    color: #1a1a1a;
  }

  .btn-save {
    padding: 10px 20px;
    background: #2196f3;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    color: #fff;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-save:hover {
    background: #1976d2;
  }
</style>
