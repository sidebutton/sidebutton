<script lang="ts">
  import type { Action, WorkflowStats, CategoryDomain } from '../types';
  import { domainColors } from '../theme';
  import CategoryBadge from './CategoryBadge.svelte';
  import StepIcon from './StepIcon.svelte';

  interface Props {
    workflow: Action;
    stats: WorkflowStats | null;
    loading?: boolean;
    onclick: () => void;
  }
  let { workflow, stats, loading = false, onclick }: Props = $props();

  // Domain accent styling
  function getDomainStyle(domain: CategoryDomain | undefined): { borderColor: string; bgGradient: string } {
    if (!domain || !domainColors[domain]) {
      return { borderColor: '#e0e0e0', bgGradient: 'none' };
    }
    const c = domainColors[domain];
    return {
      borderColor: c.color,
      bgGradient: `linear-gradient(135deg, ${c.bgColor}40 0%, #fff 100%)`
    };
  }

  // Get first N step types for preview
  function getPreviewSteps(w: Action, max: number = 4): string[] {
    if (!w.steps || w.steps.length === 0) return [];
    return w.steps.slice(0, max).map(s => s.type);
  }

  // Format fail rate
  function formatFailRate(s: WorkflowStats): string {
    if (s.total_runs === 0) return '0%';
    const rate = Math.round((s.failed_count / s.total_runs) * 100);
    return `${rate}%`;
  }

  // Format relative time
  function formatRelativeTime(date: string | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return '1d';
    if (diffDays < 7) return `${diffDays}d`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`;
    return `${Math.floor(diffDays / 365)}y`;
  }

  // Check if has embed or domain restrictions
  function hasEmbed(w: Action): boolean {
    return !!w.embed || (w.policies?.allowed_domains?.length ?? 0) > 0;
  }

  let domainStyle = $derived(getDomainStyle(workflow.category?.domain));
  let previewSteps = $derived(getPreviewSteps(workflow));
  let stepCount = $derived(workflow.steps?.length ?? 0);
</script>

{#if loading}
  <!-- Skeleton State -->
  <div class="workflow-card skeleton">
    <div class="card-header">
      <div class="skeleton-title"></div>
      <div class="skeleton-badges">
        <div class="skeleton-badge"></div>
      </div>
    </div>
    <p class="description skeleton-description">
      <span class="skeleton-line"></span>
      <span class="skeleton-line short"></span>
    </p>
    <div class="card-meta">
      <div class="meta-left">
        <div class="skeleton-category"></div>
      </div>
      <div class="meta-right">
        <div class="skeleton-icons"></div>
        <div class="skeleton-step-count"></div>
      </div>
    </div>
    <div class="card-footer">
      <div class="stat-item">
        <span class="skeleton-stat-value"></span>
        <span class="skeleton-stat-label"></span>
      </div>
      <div class="stat-item">
        <span class="skeleton-stat-value"></span>
        <span class="skeleton-stat-label"></span>
      </div>
      <div class="stat-item">
        <span class="skeleton-stat-value"></span>
        <span class="skeleton-stat-label"></span>
      </div>
      <div class="stat-item">
        <span class="skeleton-stat-value"></span>
        <span class="skeleton-stat-label"></span>
      </div>
    </div>
  </div>
{:else}
  <!-- Actual Card -->
  <button
    class="workflow-card"
    style="--border-accent: {domainStyle.borderColor}; --bg-gradient: {domainStyle.bgGradient}"
    onclick={onclick}
  >
    <!-- Header: Title + Badges -->
    <div class="card-header">
      <h3 class="title">{workflow.title}</h3>
      <div class="badges">
        {#if workflow.version}
          <span class="version-badge">v{workflow.version}</span>
        {/if}
        {#if hasEmbed(workflow)}
          <span class="embed-badge" title="Embeddable">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </span>
        {/if}
      </div>
    </div>

    <!-- Description -->
    {#if workflow.description}
      <p class="description">{workflow.description}</p>
    {:else}
      <p class="description empty">No description</p>
    {/if}

    <!-- Meta: Category + Step Icons + Count -->
    <div class="card-meta">
      <div class="meta-left">
        {#if workflow.category}
          <CategoryBadge
            level={workflow.category.level}
            domain={workflow.category.domain}
            showDomain={true}
          />
        {/if}
      </div>
      <div class="meta-right">
        <div class="step-preview">
          {#each previewSteps as stepType}
            <StepIcon {stepType} size={14} />
          {/each}
          {#if stepCount > 4}
            <span class="more-steps">+{stepCount - 4}</span>
          {/if}
        </div>
        <span class="step-count">{stepCount} steps</span>
      </div>
    </div>

    <!-- Stats Footer -->
    {#if stats && stats.total_runs > 0}
      <div class="card-footer">
        <div class="stat-item">
          <span class="stat-value runs">{stats.total_runs}</span>
          <span class="stat-label">Runs</span>
        </div>
        <div class="stat-item">
          <span class="stat-value success">{stats.success_count}</span>
          <span class="stat-label">Success</span>
        </div>
        <div class="stat-item">
          <span class="stat-value fail" class:hidden={stats.failed_count === 0}>{formatFailRate(stats)}</span>
          <span class="stat-label" class:hidden={stats.failed_count === 0}>Failed</span>
          {#if stats.failed_count === 0}
            <span class="stat-value success">100%</span>
            <span class="stat-label">Rate</span>
          {/if}
        </div>
        <div class="stat-item">
          <span class="stat-value muted">{formatRelativeTime(workflow.last_verified)}</span>
          <span class="stat-label">Verified</span>
        </div>
      </div>
    {:else}
      <div class="card-footer empty">
        <span class="no-runs">No runs yet</span>
        {#if workflow.last_verified}
          <span class="verified-date">Verified {formatRelativeTime(workflow.last_verified)}</span>
        {/if}
      </div>
    {/if}
  </button>
{/if}

<style>
  .workflow-card {
    background: var(--bg-gradient, var(--color-card));
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--border-accent, var(--color-border));
    border-radius: 12px;
    padding: 16px 20px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
  }

  .workflow-card:hover {
    border-color: var(--border-accent, var(--color-border-strong));
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }

  .workflow-card:active {
    transform: translateY(0);
  }

  /* Header */
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text);
    line-height: 1.3;
    flex: 1;
  }

  .badges {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .version-badge {
    font-size: 0.7rem;
    padding: 2px 8px;
    background: var(--color-surface);
    border-radius: 4px;
    color: var(--color-text-secondary);
    font-family: ui-monospace, monospace;
  }

  .embed-badge {
    width: 18px;
    height: 18px;
    color: var(--color-success);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .embed-badge svg {
    width: 100%;
    height: 100%;
  }

  /* Description */
  .description {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .description.empty {
    color: var(--color-text-muted);
    font-style: italic;
  }

  /* Meta */
  .card-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding-top: 4px;
  }

  .meta-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .meta-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .step-preview {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .more-steps {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    margin-left: 2px;
  }

  .step-count {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
  }

  /* Stats Footer */
  .card-footer {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    border-top: 1px solid var(--color-border);
    padding-top: 12px;
    margin-top: 4px;
  }

  .card-footer.empty {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .stat-value {
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .stat-value.runs { color: var(--color-info); }
  .stat-value.success { color: var(--color-success); }
  .stat-value.fail { color: var(--color-error); }
  .stat-value.muted { color: var(--color-text-secondary); }

  .stat-label {
    font-size: 0.65rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .hidden {
    display: none;
  }

  .no-runs {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    font-style: italic;
  }

  .verified-date {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  /* Skeleton State - min-height ensures exact match with real card */
  .workflow-card.skeleton {
    cursor: default;
    pointer-events: none;
    background: var(--color-card);
    border-left-color: var(--color-border);
    min-height: 180px;
  }

  /* Match real title height: font-size 1rem * line-height 1.3 = ~21px */
  .skeleton-title {
    height: 21px;
    width: 70%;
    background: linear-gradient(90deg, var(--color-surface) 25%, var(--color-border) 50%, var(--color-surface) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }

  .skeleton-badges {
    display: flex;
    gap: 6px;
  }

  .skeleton-badge {
    height: 18px;
    width: 40px;
    background: linear-gradient(90deg, var(--color-surface) 25%, var(--color-border) 50%, var(--color-surface) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }

  /* Match real description: 0.85rem * 1.4 line-height * 2 lines = ~38px */
  .skeleton-description {
    display: flex;
    flex-direction: column;
    gap: 8px;
    -webkit-line-clamp: unset;
    overflow: visible;
    min-height: 38px;
  }

  .skeleton-line {
    display: block;
    height: 15px;
    width: 100%;
    background: linear-gradient(90deg, var(--color-surface) 25%, var(--color-border) 50%, var(--color-surface) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }

  .skeleton-line.short {
    width: 60%;
  }

  /* Match CategoryBadge height */
  .skeleton-category {
    height: 22px;
    width: 110px;
    background: linear-gradient(90deg, var(--color-surface) 25%, var(--color-border) 50%, var(--color-surface) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }

  .skeleton-icons {
    height: 14px;
    width: 60px;
    background: linear-gradient(90deg, var(--color-surface) 25%, var(--color-border) 50%, var(--color-surface) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }

  .skeleton-step-count {
    height: 14px;
    width: 50px;
    background: linear-gradient(90deg, var(--color-surface) 25%, var(--color-border) 50%, var(--color-surface) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }

  /* Match stat-value: 0.95rem * 1.2 line-height = ~19px */
  .skeleton-stat-value {
    display: block;
    height: 19px;
    width: 32px;
    background: linear-gradient(90deg, var(--color-surface) 25%, var(--color-border) 50%, var(--color-surface) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }

  .skeleton-stat-label {
    display: block;
    height: 10px;
    width: 40px;
    background: linear-gradient(90deg, var(--color-surface) 25%, var(--color-border) 50%, var(--color-surface) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 3px;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
