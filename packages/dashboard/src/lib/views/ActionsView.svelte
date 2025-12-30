<script lang="ts">
  import { onMount } from "svelte";
  import { listActions, getWorkflowStats, reloadAll } from "../api";
  import { actions, workflowStats, navigateToActionDetail } from "../stores";
  import type { Action, CategoryLevel, CategoryDomain, WorkflowStats } from "../types";
  import { domainColors } from "../theme";
  import CategoryBadge from "../components/CategoryBadge.svelte";
  import CategoryFilter from "../components/CategoryFilter.svelte";
  import SearchInput from "../components/SearchInput.svelte";
  import CreateActionModal from "../components/CreateActionModal.svelte";

  // Get domain color for an action
  function getDomainStyle(domain: CategoryDomain | undefined): string {
    if (!domain || !domainColors[domain]) return '';
    const c = domainColors[domain];
    return `border-left: 3px solid ${c.color}; background: linear-gradient(135deg, ${c.bgColor}40 0%, #fff 100%);`;
  }

  let filterLevel = $state<CategoryLevel | 'all'>('all');
  let searchQuery = $state('');
  let isLoading = $state(true);
  let showCreateModal = $state(false);

  // Filter actions based on category level and search query
  let filteredActions = $derived.by(() => {
    let result = filterLevel === 'all'
      ? $actions
      : $actions.filter(a => a.category?.level === filterLevel);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.category?.domain?.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      );
    }

    return result;
  });

  async function loadActions() {
    isLoading = true;
    try {
      const loaded = await listActions();
      actions.set(loaded);
      // Load stats for each action
      await loadAllStats(loaded);
    } catch (e) {
      console.error("Failed to load actions:", e);
    } finally {
      isLoading = false;
    }
  }

  async function loadAllStats(actionList: Action[]) {
    const stats: Record<string, WorkflowStats> = {};
    for (const a of actionList) {
      try {
        stats[a.id] = await getWorkflowStats(a.id);
      } catch {
        // Stats are optional
      }
    }
    workflowStats.set(stats);
  }

  async function handleReload() {
    try {
      await reloadAll();
      await loadActions();
    } catch (e) {
      console.error("Failed to reload:", e);
    }
  }

  function handleSearch(value: string) {
    searchQuery = value;
  }

  function getStats(actionId: string): WorkflowStats | null {
    return $workflowStats[actionId] || null;
  }

  function formatFailRate(stats: WorkflowStats): string {
    if (stats.total_runs === 0) return "";
    const failRate = Math.round((stats.failed_count / stats.total_runs) * 100);
    return failRate > 0 ? `${failRate}%` : "";
  }

  function formatLastVerified(date: string | undefined): string {
    if (!date) return "";
    const d = new Date(date);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.slice(5);
  }

  function getStepSummary(action: Action): string {
    if (!action.steps || action.steps.length === 0) return "No steps";
    const stepTypes = action.steps.map((s) => s.type.split(".")[0]);
    const unique = [...new Set(stepTypes)];
    return unique.slice(0, 3).join(", ");
  }

  function hasEmbed(action: Action): boolean {
    return !!action.embed || (action.policies?.allowed_domains?.length ?? 0) > 0;
  }

  function selectAction(action: Action) {
    navigateToActionDetail(action.id);
  }

  onMount(() => {
    loadActions();
  });
</script>

<div class="actions-view">
  <header>
    <div class="header-left">
      <h1>My Actions</h1>
      <span class="item-count">{$actions.length}</span>
    </div>
    <div class="header-controls">
      <SearchInput
        placeholder="Search actions..."
        onSearch={handleSearch}
      />
      <button class="reload-btn" onclick={handleReload} title="Reload">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 4v6h6M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      </button>
      <button class="create-btn" onclick={() => showCreateModal = true}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Create Action
      </button>
    </div>
  </header>

  <CategoryFilter selected={filterLevel} onChange={(level) => filterLevel = level} />

  <div class="actions-container">
    {#if isLoading}
      <div class="loading-state">
        <p>Loading actions...</p>
      </div>
    {:else if $actions.length === 0}
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </div>
        <h2>No Actions Yet</h2>
        <p>Create your first action by recording browser interactions or start from scratch.</p>
      </div>
    {:else if filteredActions.length === 0}
      <div class="empty-state">
        <h2>No Matching Actions</h2>
        <p>Try adjusting your search or filter.</p>
      </div>
    {:else}
      <div class="action-list">
        {#each filteredActions as action (action.id)}
          {@const stats = getStats(action.id)}
          <button class="action-card" style={getDomainStyle(action.category?.domain)} onclick={() => selectAction(action)}>
            <div class="card-header">
              <h3>{action.title}</h3>
              <div class="badges">
                {#if action.version}
                  <span class="version-badge">v{action.version}</span>
                {/if}
                {#if hasEmbed(action)}
                  <span class="embed-badge" title="Embeddable">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="9" y1="3" x2="9" y2="21" />
                    </svg>
                  </span>
                {/if}
                {#if action.parent_id}
                  <span class="forked-badge" title="Forked from: {action.parent_id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="18" r="3" />
                      <circle cx="6" cy="6" r="3" />
                      <circle cx="18" cy="6" r="3" />
                      <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" />
                      <path d="M12 12v3" />
                    </svg>
                  </span>
                {/if}
              </div>
            </div>

            {#if action.description}
              <p class="description">{action.description}</p>
            {/if}

            <div class="card-meta">
              <div class="meta-left">
                {#if action.category}
                  <CategoryBadge
                    level={action.category.level}
                    domain={action.category.domain}
                  />
                {/if}
                <span class="step-count">{action.steps?.length ?? 0} steps</span>
                <span class="step-summary">{getStepSummary(action)}</span>
              </div>

              <div class="meta-right">
                {#if stats && stats.total_runs > 0}
                  <span class="stat runs">{stats.total_runs} runs</span>
                  <span class="stat success">{stats.success_count} ok</span>
                  {#if stats.failed_count > 0}
                    <span class="stat fail">{formatFailRate(stats)} fail</span>
                  {/if}
                {/if}
                {#if action.last_verified}
                  <span class="verified" title="Last verified: {action.last_verified}">
                    {formatLastVerified(action.last_verified)}
                  </span>
                {/if}
              </div>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<CreateActionModal open={showCreateModal} onClose={() => showCreateModal = false} />

<style>
  .actions-view {
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

  .create-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: #6366f1;
    border: none;
    border-radius: 8px;
    color: #fff;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .create-btn:hover {
    background: #4f46e5;
  }

  .create-btn svg {
    width: 16px;
    height: 16px;
  }

  .actions-container {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
  }

  .loading-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: #666;
  }

  .empty-icon {
    width: 64px;
    height: 64px;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  .empty-icon svg {
    width: 100%;
    height: 100%;
  }

  .empty-state h2 {
    margin: 0 0 8px;
    font-size: 1.2rem;
    color: #333;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.9rem;
    text-align: center;
    max-width: 300px;
  }

  .action-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }

  .action-card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 16px 20px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
  }

  .action-card:hover {
    border-color: #bdbdbd;
    background: #f5f5f5;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }

  .card-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  .badges {
    display: flex;
    gap: 8px;
  }

  .version-badge {
    font-size: 0.7rem;
    padding: 2px 8px;
    background: #f0f0f0;
    border-radius: 4px;
    color: #666;
  }

  .embed-badge,
  .forked-badge {
    width: 20px;
    height: 20px;
  }

  .embed-badge {
    color: #4caf50;
  }

  .forked-badge {
    color: #9c27b0;
  }

  .embed-badge svg,
  .forked-badge svg {
    width: 100%;
    height: 100%;
  }

  .description {
    margin: 0 0 12px;
    font-size: 0.85rem;
    color: #666;
    line-height: 1.4;
  }

  .card-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }

  .meta-left,
  .meta-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .step-count {
    font-size: 0.8rem;
    color: #666;
  }

  .step-summary {
    font-size: 0.75rem;
    color: #888;
    font-family: monospace;
  }

  .stat {
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .stat.runs {
    background: #e3f2fd;
    color: #1976d2;
  }

  .stat.success {
    background: #e8f5e9;
    color: #388e3c;
  }

  .stat.fail {
    background: #ffebee;
    color: #d32f2f;
  }

  .verified {
    font-size: 0.7rem;
    color: #888;
  }
</style>
