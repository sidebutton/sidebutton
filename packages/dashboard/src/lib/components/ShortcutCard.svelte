<script lang="ts">
  import type { DashboardShortcut, Action } from "../types";
  import { CATEGORY_DOMAINS } from "../types";

  interface Props {
    shortcut: DashboardShortcut;
    action: Action | null;
    onrun: () => void;
    onedit: () => void;
    ondelete: () => void;
    onclone: () => void;
    onmoveup: () => void;
    onmovedown: () => void;
    isFirst: boolean;
    isLast: boolean;
  }

  let { shortcut, action, onrun, onedit, ondelete, onclone, onmoveup, onmovedown, isFirst, isLast }: Props = $props();

  let isHovered = $state(false);

  function handleDelete(event: MouseEvent) {
    event.stopPropagation();
    ondelete();
  }

  function handleClone(event: MouseEvent) {
    event.stopPropagation();
    onclone();
  }

  function handleEdit(event: MouseEvent) {
    event.stopPropagation();
    onedit();
  }

  function handleMoveUp(event: MouseEvent) {
    event.stopPropagation();
    onmoveup();
  }

  function handleMoveDown(event: MouseEvent) {
    event.stopPropagation();
    onmovedown();
  }

  // Get params preview (first 2 params)
  let paramsPreview = $derived(() => {
    const entries = Object.entries(shortcut.params);
    if (entries.length === 0) return null;
    return entries.slice(0, 2).map(([key, value]) => `${key}: ${value}`);
  });

  let hasMoreParams = $derived(Object.keys(shortcut.params).length > 2);

  // Get domain icon from action
  let domainIcon = $derived(() => {
    const domain = action?.category?.domain;
    if (domain && CATEGORY_DOMAINS[domain]) {
      return CATEGORY_DOMAINS[domain].icon;
    }
    return null;
  });
</script>

<div
  class="shortcut-card"
  class:disabled={!action}
  style="--accent-color: {shortcut.color}"
  onmouseenter={() => (isHovered = true)}
  onmouseleave={() => (isHovered = false)}
  role="group"
>
  <button class="card-content" onclick={onrun} disabled={!action}>
    <div class="card-header">
      <div class="header-left">
        {#if domainIcon()}
          <span class="domain-icon">{domainIcon()}</span>
        {/if}
        <div class="header-text">
          <h3 class="custom-name">{shortcut.custom_name}</h3>
          {#if action}
            <span class="action-title">{action.title}</span>
          {:else}
            <span class="action-missing">Action not found</span>
          {/if}
        </div>
      </div>
    </div>

    {#if paramsPreview()}
      <div class="params-preview">
        {#each paramsPreview() as param}
          <span class="param">{param}</span>
        {/each}
        {#if hasMoreParams}
          <span class="param more">+{Object.keys(shortcut.params).length - 2} more</span>
        {/if}
      </div>
    {/if}
  </button>

  {#if isHovered}
    <div class="card-actions" role="toolbar">
      <button class="action-btn" title="Edit" onclick={handleEdit}>✎</button>
      <button class="action-btn" title="Clone" onclick={handleClone}>⧉</button>
      <button class="action-btn" title="Move up" onclick={handleMoveUp} disabled={isFirst}>↑</button>
      <button class="action-btn" title="Move down" onclick={handleMoveDown} disabled={isLast}>↓</button>
      <button class="action-btn delete" title="Delete" onclick={handleDelete}>×</button>
    </div>
  {/if}
</div>

<style>
  .shortcut-card {
    --accent-color: var(--color-accent);
    position: relative;
    display: flex;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-left-width: 6px;
    border-left-style: solid;
    border-left-color: var(--accent-color);
    border-radius: 0 12px 12px 0;
    transition: all 0.2s;
    width: 100%;
  }

  .shortcut-card:hover {
    border-top-color: var(--color-border-strong);
    border-right-color: var(--color-border-strong);
    border-bottom-color: var(--color-border-strong);
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }

  .shortcut-card.disabled {
    opacity: 0.6;
  }

  .card-content {
    flex: 1;
    padding: 16px;
    min-width: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .card-content:disabled {
    cursor: not-allowed;
  }

  .card-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .header-left {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .domain-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-color);
    color: white;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .header-text {
    flex: 1;
    min-width: 0;
  }

  .custom-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .action-title {
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .action-missing {
    font-size: 12px;
    color: var(--color-warning);
    font-style: italic;
  }

  .params-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }

  .param {
    font-size: 11px;
    color: var(--color-text-secondary);
    background: var(--color-surface);
    padding: 2px 8px;
    border-radius: 4px;
    max-width: 150px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .param.more {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .card-actions {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
    display: flex;
    gap: 4px;
    background: var(--color-card);
    padding: 4px;
    border-radius: 6px;
    box-shadow: var(--shadow-md);
  }

  .action-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    color: var(--color-text-secondary);
    transition: all 0.15s;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--color-surface);
    color: var(--color-text);
  }

  .action-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .action-btn.delete:hover:not(:disabled) {
    background: var(--color-error-light);
    color: #991B1B;
  }

  .action-btn {
    font-size: 16px;
    line-height: 1;
  }
</style>
