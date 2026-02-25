<script lang="ts">
  import type { RoleContext, TargetContext } from '../types';

  interface Props {
    isOpen: boolean;
    mode: 'role' | 'target';
    editing: RoleContext | TargetContext | null;
    onClose: () => void;
    onSave: (data: { name: string; match: string[]; body: string }) => void;
  }

  let { isOpen, mode, editing = null, onClose, onSave }: Props = $props();

  let name = $state('');
  let matchStr = $state('');
  let body = $state('');

  $effect(() => {
    if (editing) {
      name = editing.name || '';
      matchStr = editing.match?.join(', ') || '';
      body = editing.body || '';
    } else {
      name = '';
      matchStr = '';
      body = '';
    }
  });

  function handleSave() {
    if (!name.trim()) return;
    const match = matchStr.split(',').map(s => s.trim()).filter(Boolean);
    if (match.length === 0) return;

    onSave({
      name: name.trim(),
      match,
      body: body.trim(),
    });
    onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal-backdrop" onclick={handleBackdropClick} role="dialog" aria-modal="true" tabindex="-1">
    <div class="modal">
      <header class="modal-header">
        <h2>{editing ? 'Edit' : 'Add'} {mode === 'role' ? 'Role' : 'Target'}</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div class="modal-body">
        <div class="form-group">
          <label for="rt-name">Name</label>
          <input id="rt-name" type="text" bind:value={name} placeholder={mode === 'role' ? 'e.g., Sales' : 'e.g., LinkedIn'} />
        </div>

        <div class="form-group">
          <label for="rt-match">Match Patterns</label>
          <input
            id="rt-match"
            type="text"
            bind:value={matchStr}
            placeholder={mode === 'role' ? '@sales, @outreach' : 'linkedin.com, linkedin_*'}
          />
          <span class="hint">
            {mode === 'role' ? 'Comma-separated @category tags' : 'Comma-separated domains or glob patterns'}
          </span>
        </div>

        <div class="form-group">
          <label for="rt-body">Context Instructions (Markdown)</label>
          <textarea
            id="rt-body"
            bind:value={body}
            placeholder="Instructions that apply when this {mode} is active..."
            spellcheck="false"
          ></textarea>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="btn-cancel" onclick={onClose}>Cancel</button>
        <button class="btn-save" onclick={handleSave} disabled={!name.trim() || !matchStr.trim()}>
          {editing ? 'Update' : 'Add'} {mode === 'role' ? 'Role' : 'Target'}
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
    max-width: 520px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    animation: slideUp 0.2s ease-out;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
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

  .form-group input[type="text"],
  .form-group textarea {
    padding: 10px 12px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 0.9rem;
    color: #1a1a1a;
    transition: border-color 0.15s ease;
  }

  .form-group input[type="text"]:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #2196f3;
  }

  .form-group textarea {
    resize: vertical;
    min-height: 200px;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
    font-size: 0.85rem;
    line-height: 1.5;
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

  .btn-save:hover:not(:disabled) {
    background: #1976d2;
  }

  .btn-save:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
