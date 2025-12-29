<script lang="ts">
  import { statusColors } from '../theme';

  interface Props {
    status: 'success' | 'failed' | 'cancelled' | 'running' | 'pending';
    size?: 'sm' | 'md' | 'lg';
  }
  let { status, size = 'md' }: Props = $props();

  const statusConfig = {
    success: { label: 'Success', ...statusColors.success },
    failed: { label: 'Failed', ...statusColors.failed },
    cancelled: { label: 'Cancelled', ...statusColors.cancelled },
    running: { label: 'Running', ...statusColors.running },
    pending: { label: 'Pending', ...statusColors.pending },
  };

  let config = $derived(statusConfig[status] || statusConfig.pending);
</script>

<span
  class="status-badge size-{size}"
  class:running={status === 'running'}
  style="--status-color: {config.color}; --status-bg: {config.bgColor}"
>
  {#if status === 'running'}
    <span class="pulse"></span>
  {/if}
  <span class="icon">
    {#if status === 'success'}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    {:else if status === 'failed'}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    {:else if status === 'cancelled'}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      </svg>
    {:else if status === 'running'}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <circle cx="12" cy="12" r="10" />
      </svg>
    {/if}
  </span>
  <span class="label">{config.label}</span>
</span>

<style>
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: var(--status-bg);
    color: var(--status-color);
    border-radius: 9999px;
    font-weight: 500;
    position: relative;
  }

  .size-sm {
    font-size: 0.7rem;
    padding: 2px 8px;
    gap: 4px;
  }

  .size-md {
    font-size: 0.8rem;
    padding: 4px 10px;
  }

  .size-lg {
    font-size: 0.9rem;
    padding: 6px 14px;
    gap: 8px;
  }

  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .size-sm .icon svg {
    width: 10px;
    height: 10px;
  }

  .size-md .icon svg {
    width: 12px;
    height: 12px;
  }

  .size-lg .icon svg {
    width: 14px;
    height: 14px;
  }

  .running .pulse {
    position: absolute;
    inset: 0;
    background: var(--status-color);
    border-radius: 9999px;
    opacity: 0;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0% {
      opacity: 0.4;
      transform: scale(1);
    }
    50% {
      opacity: 0;
      transform: scale(1.3);
    }
    100% {
      opacity: 0;
      transform: scale(1);
    }
  }

  .label {
    position: relative;
    z-index: 1;
  }

  .icon {
    position: relative;
    z-index: 1;
  }
</style>
