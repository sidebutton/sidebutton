<script lang="ts">
  interface Props {
    body: string;
    isSaving: boolean;
    onSave: (body: string) => void;
  }

  let { body, isSaving, onSave }: Props = $props();

  let editBody = $state('');
  let isDirty = $derived(editBody !== body);

  $effect(() => {
    editBody = body;
  });
</script>

<div class="persona-editor">
  <div class="editor-header">
    <span class="label">Your persona — injected into every LLM call</span>
    <span class="char-count">{editBody.length} chars</span>
  </div>
  <textarea
    class="persona-textarea"
    bind:value={editBody}
    placeholder="Describe who you are, your communication style, and preferences..."
    spellcheck="false"
  ></textarea>
  <div class="editor-footer">
    <button
      class="btn-save"
      disabled={!isDirty || isSaving}
      onclick={() => onSave(editBody)}
    >
      {isSaving ? 'Saving...' : 'Save Persona'}
    </button>
  </div>
</div>

<style>
  .persona-editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .label {
    font-size: 0.8rem;
    color: #888;
  }

  .char-count {
    font-size: 0.75rem;
    color: #aaa;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
  }

  .persona-textarea {
    width: 100%;
    min-height: 300px;
    padding: 14px;
    background: #fafafa;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
    font-size: 0.85rem;
    line-height: 1.6;
    color: #1a1a1a;
    resize: vertical;
    transition: border-color 0.15s ease;
    box-sizing: border-box;
  }

  .persona-textarea:focus {
    outline: none;
    border-color: #2196f3;
    background: #fff;
  }

  .editor-footer {
    display: flex;
    justify-content: flex-end;
  }

  .btn-save {
    padding: 8px 20px;
    background: #2196f3;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
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
