<script lang="ts">
  import type { WorkflowStats } from "../types";

  interface Props {
    stats: WorkflowStats | null;
    lastVerified?: string;
  }

  let { stats, lastVerified }: Props = $props();

  function formatFailRate(s: WorkflowStats): string {
    if (s.total_runs === 0) return "0%";
    const rate = Math.round((s.failed_count / s.total_runs) * 100);
    return `${rate}%`;
  }

  function formatRelativeTime(date: string | undefined): string {
    if (!date) return "Never";
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.slice(0, 10);
  }

  let hasStats = $derived(stats && stats.total_runs > 0);
</script>

{#if hasStats && stats}
  <div class="stats-bar">
    <div class="stat-item">
      <span class="stat-value">{stats.total_runs}</span>
      <span class="stat-label">Total Runs</span>
    </div>
    <div class="stat-divider"></div>
    <div class="stat-item success">
      <span class="stat-value">{stats.success_count}</span>
      <span class="stat-label">Successful</span>
    </div>
    <div class="stat-divider"></div>
    <div class="stat-item" class:error={stats.failed_count > 0}>
      <span class="stat-value">{formatFailRate(stats)}</span>
      <span class="stat-label">Fail Rate</span>
    </div>
    <div class="stat-divider"></div>
    <div class="stat-item">
      <span class="stat-value">{formatRelativeTime(lastVerified)}</span>
      <span class="stat-label">Last Verified</span>
    </div>
  </div>
{/if}

<style>
  .stats-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 16px 24px;
    margin-bottom: 20px;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 32px;
    gap: 4px;
  }

  .stat-item.success .stat-value {
    color: var(--color-success);
  }

  .stat-item.error .stat-value {
    color: var(--color-error);
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-divider {
    width: 1px;
    height: 40px;
    background: var(--color-border);
  }
</style>
