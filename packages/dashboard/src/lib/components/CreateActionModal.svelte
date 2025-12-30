<script lang="ts">
  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="overlay" onclick={handleOverlayClick} role="dialog" aria-modal="true">
    <div class="modal">
      <div class="modal-header">
        <h2>Create Action</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="info-card">
          <div class="card-title">
            <span class="icon">📋</span>
            Copy from Workflows
          </div>
          <ol class="steps">
            <li>Go to the <strong>Workflows</strong> page</li>
            <li>Find a workflow you want to use</li>
            <li>Click on it to open details</li>
            <li>Click <strong>"Copy to Actions"</strong> button</li>
          </ol>
        </div>

        <div class="info-card">
          <div class="card-title">
            <span class="icon">🔴</span>
            Record Browser Actions
          </div>
          <ol class="steps">
            <li>Open Chrome with the <strong>SideButton extension</strong></li>
            <li>Click the extension icon in toolbar</li>
            <li>Click <strong>"Start Recording"</strong></li>
            <li>Perform actions in the browser</li>
            <li>Click <strong>"Stop Recording"</strong></li>
            <li>Go to <strong>Recordings</strong> page and convert to action</li>
          </ol>
        </div>
      </div>

      <div class="modal-footer">
        <button class="close-action" onclick={onClose}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: #fff;
    border-radius: 12px;
    max-width: 480px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid #e0e0e0;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    padding: 6px;
    background: #f0f0f0;
    border: none;
    border-radius: 6px;
    color: #666;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: #e0e0e0;
    color: #1a1a1a;
  }

  .close-btn svg {
    width: 100%;
    height: 100%;
  }

  .modal-body {
    padding: 24px;
  }

  .info-card {
    background: #f9fafb;
    border-radius: 8px;
    padding: 16px 20px;
    margin-bottom: 16px;
  }

  .info-card:last-child {
    margin-bottom: 0;
  }

  .card-title {
    font-weight: 600;
    font-size: 1rem;
    color: #1a1a1a;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .icon {
    font-size: 1.1rem;
  }

  .steps {
    margin: 0;
    padding-left: 20px;
    font-size: 0.9rem;
    color: #4b5563;
    line-height: 1.8;
  }

  .steps li {
    margin-bottom: 4px;
  }

  .steps li:last-child {
    margin-bottom: 0;
  }

  .steps strong {
    color: #1a1a1a;
  }

  .modal-footer {
    padding: 16px 24px;
    border-top: 1px solid #e0e0e0;
    display: flex;
    justify-content: flex-end;
  }

  .close-action {
    padding: 10px 20px;
    background: #f0f0f0;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    color: #1a1a1a;
    cursor: pointer;
  }

  .close-action:hover {
    background: #e0e0e0;
  }
</style>
