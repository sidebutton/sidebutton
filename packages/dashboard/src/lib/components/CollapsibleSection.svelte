<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    count?: number;
    emptyLabel?: string;
    configuredLabel?: string;
    expanded?: boolean;
    editable?: boolean;
    onedit?: () => void;
    children: Snippet;
  }

  let {
    title,
    count,
    emptyLabel,
    configuredLabel,
    expanded = $bindable(true),
    editable = false,
    onedit,
    children,
  }: Props = $props();

  function toggle() {
    expanded = !expanded;
  }

  function handleEdit(e: MouseEvent) {
    e.stopPropagation();
    onedit?.();
  }

  let showCount = $derived(count !== undefined && count > 0);
  let showConfigured = $derived(configuredLabel && !emptyLabel);
</script>

<section class="section collapsible" class:collapsed={!expanded}>
  <button class="section-toggle" onclick={toggle}>
    <svg class="toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
    <h2>
      {title}
      {#if showCount}
        <span class="count-badge">{count}</span>
      {:else if configuredLabel}
        <span class="configured-label">{configuredLabel}</span>
      {:else if emptyLabel}
        <span class="empty-label">{emptyLabel}</span>
      {/if}
    </h2>
    {#if editable}
      <button class="btn-edit" onclick={handleEdit}>Edit</button>
    {/if}
  </button>
  {#if expanded}
    <div class="section-content">
      {@render children()}
    </div>
  {/if}
</section>

<style>
  .section.collapsible {
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .section-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 16px 20px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .section-toggle:hover {
    background: var(--color-surface);
  }

  .section-toggle h2 {
    margin: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .toggle-icon {
    width: 16px;
    height: 16px;
    color: var(--color-text-muted);
    transition: transform 0.2s;
    flex-shrink: 0;
  }

  .section.collapsible:not(.collapsed) .toggle-icon {
    transform: rotate(90deg);
  }

  .count-badge {
    font-size: 0.75rem;
    padding: 2px 8px;
    background: var(--color-info-light);
    color: var(--color-info);
    border-radius: 10px;
    font-weight: 500;
  }

  .empty-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-weight: 400;
  }

  .configured-label {
    font-size: 0.75rem;
    padding: 2px 8px;
    background: var(--color-success-light);
    color: #166534;
    border-radius: 10px;
    font-weight: 500;
  }

  .btn-edit {
    padding: 4px 12px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-secondary);
    font-size: 0.8rem;
    cursor: pointer;
    flex-shrink: 0;
  }

  .btn-edit:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }

  .section-content {
    padding: 0 20px 20px 46px;
  }
</style>
