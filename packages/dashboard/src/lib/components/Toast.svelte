<script lang="ts">
  import { toasts, removeToast, type Toast } from "../stores";

  function getIcon(type: Toast["type"]): string {
    switch (type) {
      case "success": return "check";
      case "error": return "x";
      case "warning": return "!";
      case "info": return "i";
    }
  }
</script>

<div class="toast-container">
  {#each $toasts as toast (toast.id)}
    <div class="toast toast-{toast.type}" role="alert">
      <span class="toast-icon">{getIcon(toast.type)}</span>
      <span class="toast-message">{toast.message}</span>
      <button class="toast-close" onclick={() => removeToast(toast.id)} aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 360px;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 8px;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    box-shadow: var(--shadow-lg);
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .toast-icon {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 12px;
    flex-shrink: 0;
  }

  .toast-success .toast-icon {
    background: var(--color-success-light);
    color: var(--color-success);
  }

  .toast-error .toast-icon {
    background: var(--color-error-light);
    color: var(--color-error);
  }

  .toast-warning .toast-icon {
    background: var(--color-warning-light);
    color: var(--color-warning);
  }

  .toast-info .toast-icon {
    background: var(--color-info-light);
    color: var(--color-info);
  }

  .toast-message {
    flex: 1;
    font-size: 14px;
    color: var(--color-text);
  }

  .toast-close {
    width: 20px;
    height: 20px;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .toast-close:hover {
    color: var(--color-text);
  }

  .toast-close svg {
    width: 100%;
    height: 100%;
  }
</style>
