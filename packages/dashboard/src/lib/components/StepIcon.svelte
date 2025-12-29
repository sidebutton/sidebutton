<script lang="ts">
  import { stepTypeColors, colors } from '../theme';

  interface Props {
    stepType: string;
    size?: number;
  }
  let { stepType, size = 16 }: Props = $props();

  // Map step type prefix to icon and color
  function getIconInfo(type: string): { icon: string; color: string } {
    const prefix = type.split('.')[0];
    const action = type.split('.')[1] || '';

    switch (prefix) {
      case 'browser':
        return { icon: 'globe', color: stepTypeColors.browser };
      case 'shell':
      case 'terminal':
        return { icon: 'terminal', color: stepTypeColors.terminal };
      case 'llm':
        return { icon: 'sparkles', color: stepTypeColors.llm };
      case 'control':
        if (action === 'if') return { icon: 'git-branch', color: stepTypeColors.control };
        if (action === 'retry') return { icon: 'refresh', color: stepTypeColors.control };
        if (action === 'stop') return { icon: 'stop', color: colors.error };
        return { icon: 'git-branch', color: stepTypeColors.control };
      case 'workflow':
        return { icon: 'play', color: stepTypeColors.workflow };
      case 'data':
        return { icon: 'database', color: stepTypeColors.data };
      default:
        return { icon: 'cog', color: stepTypeColors.default };
    }
  }

  let iconInfo = $derived(getIconInfo(stepType));
</script>

<span class="step-icon" style="--icon-color: {iconInfo.color}; --icon-size: {size}px">
  {#if iconInfo.icon === 'globe'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  {:else if iconInfo.icon === 'terminal'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  {:else if iconInfo.icon === 'sparkles'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 3v1m0 16v1m-9-9h1m16 0h1m-2.636-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  {:else if iconInfo.icon === 'git-branch'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  {:else if iconInfo.icon === 'refresh'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M1 4v6h6M23 20v-6h-6" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
    </svg>
  {:else if iconInfo.icon === 'stop'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    </svg>
  {:else if iconInfo.icon === 'play'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  {:else if iconInfo.icon === 'database'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  {:else}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  {/if}
</span>

<style>
  .step-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--icon-size);
    height: var(--icon-size);
    color: var(--icon-color);
  }

  .step-icon svg {
    width: 100%;
    height: 100%;
  }
</style>
