<script lang="ts">
  import type { CategoryLevel, CategoryDomain } from '../types';
  import { CATEGORY_LEVELS, CATEGORY_DOMAINS } from '../types';

  interface Props {
    level?: CategoryLevel;
    domain?: CategoryDomain;
    showDomain?: boolean;
    size?: 'sm' | 'md';
  }
  let { level = 'task', domain = undefined, showDomain = false, size = 'sm' }: Props = $props();

  let levelInfo = $derived(CATEGORY_LEVELS[level]);
  let domainInfo = $derived(domain ? CATEGORY_DOMAINS[domain] : null);
</script>

<span
  class="category-badge {size}"
  style="--badge-color: {levelInfo.color}; --badge-bg: {levelInfo.bgColor}"
  title="{levelInfo.label}: {levelInfo.description}"
>
  {levelInfo.badge}
</span>

{#if showDomain && domainInfo}
  <span class="domain-text" title="{domainInfo.description}">
    · {domainInfo.label}
  </span>
{/if}

<style>
  .category-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    border-radius: 4px;
    color: var(--badge-color);
    background: var(--badge-bg);
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  }

  .category-badge.sm {
    font-size: 10px;
    padding: 2px 6px;
    min-width: 24px;
  }

  .category-badge.md {
    font-size: 12px;
    padding: 4px 8px;
    min-width: 32px;
  }

  .domain-text {
    margin-left: 6px;
    font-size: 11px;
    color: var(--color-text-muted);
    font-weight: 400;
  }
</style>
