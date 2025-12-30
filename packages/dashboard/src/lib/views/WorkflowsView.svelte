<script lang="ts">
  import { onMount } from "svelte";
  import { listWorkflows, getWorkflowStats, reloadAll } from "../api";
  import { workflows, workflowStats, navigateToWorkflowDetail } from "../stores";
  import type { Action, CategoryLevel, WorkflowStats } from "../types";
  import CategoryFilter from "../components/CategoryFilter.svelte";
  import SearchInput from "../components/SearchInput.svelte";
  import WorkflowCard from "../components/WorkflowCard.svelte";

  type SortOption = 'name' | 'runs' | 'success' | 'recent';

  let filterLevel = $state<CategoryLevel | 'all'>('all');
  let searchQuery = $state('');
  let sortBy = $state<SortOption>('name');
  let isLoading = $state(true);
  let showSortDropdown = $state(false);

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'name', label: 'Name (A-Z)' },
    { value: 'runs', label: 'Most runs' },
    { value: 'success', label: 'Success rate' },
    { value: 'recent', label: 'Recently verified' },
  ];

  // Filter and sort workflows
  let filteredWorkflows = $derived.by(() => {
    // First filter by category level
    let result = filterLevel === 'all'
      ? $workflows
      : $workflows.filter(w => w.category?.level === filterLevel);

    // Then filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(w =>
        w.title.toLowerCase().includes(q) ||
        w.description?.toLowerCase().includes(q) ||
        w.category?.domain?.toLowerCase().includes(q) ||
        w.id.toLowerCase().includes(q)
      );
    }

    // Sort the results
    result = [...result].sort((a, b) => {
      const statsA = $workflowStats[a.id];
      const statsB = $workflowStats[b.id];

      switch (sortBy) {
        case 'name':
          return a.title.localeCompare(b.title);
        case 'runs':
          return (statsB?.total_runs ?? 0) - (statsA?.total_runs ?? 0);
        case 'success':
          const rateA = statsA?.total_runs ? (statsA.success_count / statsA.total_runs) : 0;
          const rateB = statsB?.total_runs ? (statsB.success_count / statsB.total_runs) : 0;
          return rateB - rateA;
        case 'recent':
          const dateA = a.last_verified ? new Date(a.last_verified).getTime() : 0;
          const dateB = b.last_verified ? new Date(b.last_verified).getTime() : 0;
          return dateB - dateA;
        default:
          return 0;
      }
    });

    return result;
  });

  async function loadWorkflows() {
    isLoading = true;
    try {
      const loaded = await listWorkflows();
      workflows.set(loaded);
      // Load stats for each workflow in parallel
      await loadAllStats(loaded);
    } catch (e) {
      console.error("Failed to load workflows:", e);
    } finally {
      isLoading = false;
    }
  }

  async function loadAllStats(workflowList: Action[]) {
    const statsPromises = workflowList.map(async (w) => {
      try {
        return { id: w.id, stats: await getWorkflowStats(w.id) };
      } catch {
        return { id: w.id, stats: null };
      }
    });

    const results = await Promise.all(statsPromises);
    const stats: Record<string, WorkflowStats> = {};
    for (const r of results) {
      if (r.stats) {
        stats[r.id] = r.stats;
      }
    }
    workflowStats.set(stats);
  }

  async function handleReload() {
    try {
      await reloadAll();
      await loadWorkflows();
    } catch (e) {
      console.error("Failed to reload:", e);
    }
  }

  function handleSearch(value: string) {
    searchQuery = value;
  }

  function getStats(workflowId: string): WorkflowStats | null {
    return $workflowStats[workflowId] || null;
  }

  function selectWorkflow(workflow: Action) {
    navigateToWorkflowDetail(workflow.id);
  }

  function handleSortChange(option: SortOption) {
    sortBy = option;
    showSortDropdown = false;
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.sort-dropdown-container')) {
      showSortDropdown = false;
    }
  }

  onMount(() => {
    loadWorkflows();
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<div class="workflows-view">
  <header>
    <div class="header-left">
      <h1>Library</h1>
      <span class="item-count">{$workflows.length}</span>
    </div>
    <div class="header-controls">
      <SearchInput
        placeholder="Search library..."
        onSearch={handleSearch}
      />
      <div class="sort-dropdown-container">
        <button
          class="sort-btn"
          onclick={() => showSortDropdown = !showSortDropdown}
          title="Sort workflows"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M6 12h12M9 18h6" />
          </svg>
          <span class="sort-label">{sortOptions.find(o => o.value === sortBy)?.label}</span>
          <svg class="chevron" class:open={showSortDropdown} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {#if showSortDropdown}
          <div class="sort-dropdown">
            {#each sortOptions as option}
              <button
                class="sort-option"
                class:active={sortBy === option.value}
                onclick={() => handleSortChange(option.value)}
              >
                {option.label}
                {#if sortBy === option.value}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <button class="reload-btn" onclick={handleReload} title="Reload">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 4v6h6M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      </button>
    </div>
  </header>

  <CategoryFilter selected={filterLevel} onChange={(level) => filterLevel = level} />

  <div class="workflows-container">
    {#if isLoading}
      <!-- Loading Skeletons -->
      <div class="workflow-list">
        {#each Array(6) as _}
          <WorkflowCard
            workflow={{ id: '', title: '', steps: [] } as Action}
            stats={null}
            loading={true}
            onclick={() => {}}
          />
        {/each}
      </div>
    {:else if $workflows.length === 0}
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h2>Library Empty</h2>
        <p>Publish your Actions to add them to the Library for reuse.</p>
      </div>
    {:else if filteredWorkflows.length === 0}
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
        <h2>No Matching Items</h2>
        <p>Try adjusting your search or filter.</p>
      </div>
    {:else}
      <div class="workflow-list">
        {#each filteredWorkflows as workflow (workflow.id)}
          <WorkflowCard
            {workflow}
            stats={getStats(workflow.id)}
            onclick={() => selectWorkflow(workflow)}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .workflows-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #fafafa;
    color: #1a1a1a;
  }

  header {
    padding: 20px 24px;
    background: #fff;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .item-count {
    background: #f0f0f0;
    color: #666;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 0.8rem;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .sort-dropdown-container {
    position: relative;
  }

  .sort-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #f0f0f0;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    color: #666;
    cursor: pointer;
    font-size: 0.85rem;
    min-width: 140px;
  }

  .sort-btn:hover {
    background: #e8e8e8;
    color: #1a1a1a;
  }

  .sort-btn svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .sort-btn .chevron {
    width: 14px;
    height: 14px;
    margin-left: auto;
    transition: transform 0.2s;
  }

  .sort-btn .chevron.open {
    transform: rotate(180deg);
  }

  .sort-label {
    flex: 1;
    text-align: left;
  }

  .sort-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 160px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 100;
    overflow: hidden;
  }

  .sort-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 14px;
    background: none;
    border: none;
    color: #333;
    font-size: 0.85rem;
    cursor: pointer;
    text-align: left;
  }

  .sort-option:hover {
    background: #f5f5f5;
  }

  .sort-option.active {
    background: #f0f7ff;
    color: #1976d2;
  }

  .sort-option svg {
    width: 16px;
    height: 16px;
    color: #1976d2;
  }

  .reload-btn {
    width: 36px;
    height: 36px;
    padding: 8px;
    background: #f0f0f0;
    border: none;
    border-radius: 8px;
    color: #666;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .reload-btn:hover {
    background: #e0e0e0;
    color: #1a1a1a;
  }

  .reload-btn svg {
    width: 18px;
    height: 18px;
  }

  .workflows-container {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: #666;
  }

  .empty-icon {
    width: 72px;
    height: 72px;
    margin-bottom: 20px;
    color: #ccc;
  }

  .empty-icon svg {
    width: 100%;
    height: 100%;
  }

  .empty-state h2 {
    margin: 0 0 8px;
    font-size: 1.2rem;
    font-weight: 600;
    color: #333;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.9rem;
    color: #888;
    text-align: center;
    max-width: 300px;
  }

  .workflow-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 20px;
  }
</style>
