<script lang="ts">
  import { onMount } from "svelte";
  import { fetchContextSummary } from "../api";
  import { contextSummary } from "../stores";
  import { navigateToSettings, navigateToSkills } from "../router";
  import type { ContextSummary } from "../types";

  let summary = $state<ContextSummary | null>(null);
  let isLoading = $state(true);

  async function load() {
    try {
      const data = await fetchContextSummary();
      summary = data;
      contextSummary.set(data);
    } catch (e) {
      console.error("Failed to load context summary:", e);
    } finally {
      isLoading = false;
    }
  }

  onMount(() => { load(); });
</script>

{#if !isLoading && summary}
  <div class="context-widget">
    <div class="widget-stats">
      <button class="stat-item" onclick={() => navigateToSettings()}>
        <span class="stat-value">{summary.activeRoles}<span class="stat-total">/{summary.totalRoles}</span></span>
        <span class="stat-label">Roles active</span>
      </button>
      <div class="stat-divider"></div>
      <button class="stat-item" onclick={() => navigateToSettings()}>
        <span class="stat-value">{summary.matchedTargets}<span class="stat-total">/{summary.totalTargets}</span></span>
        <span class="stat-label">Targets matched</span>
      </button>
      <div class="stat-divider"></div>
      <button class="stat-item" onclick={() => navigateToSkills()}>
        <span class="stat-value">{summary.installedPacks}</span>
        <span class="stat-label">Skill pack{summary.installedPacks !== 1 ? 's' : ''}</span>
      </button>
      {#if summary.persona}
        <div class="stat-divider"></div>
        <button class="stat-item persona" onclick={() => navigateToSettings()}>
          <span class="stat-value persona-name">{summary.persona.name}</span>
          <span class="stat-label">Persona</span>
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .context-widget {
    padding: 14px 20px;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    margin-bottom: 16px;
  }

  .widget-stats {
    display: flex;
    align-items: center;
    gap: 0;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 4px 16px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
    flex: 1;
    min-width: 0;
  }
  .stat-item:hover { background: var(--color-surface); }

  .stat-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--color-text);
    line-height: 1.2;
  }

  .stat-total {
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .stat-label {
    font-size: 12px;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .stat-divider {
    width: 1px;
    height: 32px;
    background: var(--color-border);
    flex-shrink: 0;
  }

  .persona-name {
    font-size: 14px;
    font-weight: 600;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
