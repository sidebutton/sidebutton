<script lang="ts">
  interface Tab {
    id: string;
    label: string;
    count?: number;
  }

  interface Props {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (id: string) => void;
  }

  let { tabs, activeTab, onTabChange }: Props = $props();
</script>

<div class="context-tabs">
  {#each tabs as tab (tab.id)}
    <button
      class="tab"
      class:active={activeTab === tab.id}
      onclick={() => onTabChange(tab.id)}
    >
      {tab.label}
      {#if tab.count !== undefined}
        <span class="count">{tab.count}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .context-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid #e0e0e0;
    margin-bottom: 20px;
  }

  .tab {
    flex: 1;
    padding: 10px 16px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: 0.8rem;
    font-weight: 500;
    color: #888;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .tab:hover {
    color: #555;
  }

  .tab.active {
    color: #2196f3;
    border-bottom-color: #2196f3;
  }

  .count {
    font-size: 0.7rem;
    background: #f0f0f0;
    color: #666;
    padding: 1px 6px;
    border-radius: 10px;
    min-width: 18px;
    text-align: center;
  }

  .tab.active .count {
    background: #e3f2fd;
    color: #1976d2;
  }
</style>
