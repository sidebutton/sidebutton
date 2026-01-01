<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { listRunLogs, getRunningWorkflows, clearRunLogs } from "../api";
  import { runningWorkflows, navigateToRunLogDetail, navigateToRunningExecution } from "../stores";
  import { initWebSocket, dashboardWs } from "../websocket";
  import type { RunLogMetadata, RunningWorkflow } from "../types";
  import StatusBadge from "../components/StatusBadge.svelte";

  // Track last running workflow count to detect completions
  let lastRunningCount = 0;
  let unsubscribe: (() => void) | null = null;

  let runs = $state<RunLogMetadata[]>([]);
  let isLoading = $state(true);
  let showClearConfirm = $state(false);

  async function loadRuns() {
    try {
      runs = await listRunLogs(50);
    } catch (e) {
      console.error("Failed to load runs:", e);
    } finally {
      isLoading = false;
    }
  }

  async function loadRunningWorkflows() {
    try {
      const running = await getRunningWorkflows();
      runningWorkflows.set(running);
    } catch (e) {
      console.error("Failed to load running:", e);
    }
  }

  async function handleClearAll() {
    try {
      await clearRunLogs();
      runs = [];
      showClearConfirm = false;
    } catch (e) {
      console.error("Failed to clear:", e);
    }
  }

  async function handleReload() {
    isLoading = true;
    await loadRuns();
    await loadRunningWorkflows();
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }

  function formatTimestamp(ts: string): string {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  function selectRun(run: RunLogMetadata) {
    navigateToRunLogDetail(run.id);
  }

  function selectRunning(running: RunningWorkflow) {
    navigateToRunningExecution(running.run_id, running.workflow_id);
  }

  onMount(() => {
    initWebSocket();
    loadRuns();
    loadRunningWorkflows();

    // Subscribe to WebSocket events to auto-refresh when workflows complete
    unsubscribe = dashboardWs.onEvent((message) => {
      if (message.type === 'running-workflows-changed') {
        const data = message.data as { workflows: RunningWorkflow[] };
        const currentCount = data.workflows.length;

        // If a workflow just completed (count decreased), refresh the run logs
        if (currentCount < lastRunningCount) {
          // Small delay to allow run log to be written to disk
          setTimeout(() => loadRuns(), 500);
        }
        lastRunningCount = currentCount;
      }
    });
  });

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  let hasRunning = $derived(($runningWorkflows ?? []).length > 0);

  // KPI calculations
  function getTimePeriod(timestamp: string): { isToday: boolean; isThisWeek: boolean; isThisMonth: boolean } {
    const date = new Date(timestamp);
    const now = new Date();

    const isToday = date.toDateString() === now.toDateString();

    // This week: same week number and year
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const isThisWeek = date >= startOfWeek;

    // This month: same month and year
    const isThisMonth = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();

    return { isToday, isThisWeek, isThisMonth };
  }

  let kpis = $derived.by(() => {
    let todayMs = 0, weekMs = 0, monthMs = 0, totalMs = 0;
    let todayRuns = 0, successCount = 0;

    for (const r of runs) {
      const period = getTimePeriod(r.timestamp);
      totalMs += r.duration_ms;
      if (period.isToday) { todayMs += r.duration_ms; todayRuns++; }
      if (period.isThisWeek) weekMs += r.duration_ms;
      if (period.isThisMonth) monthMs += r.duration_ms;
      if (r.status === 'success') successCount++;
    }

    return {
      totalRuns: runs.length,
      todayRuns,
      todayMs,
      weekMs,
      monthMs,
      totalMs,
      successRate: runs.length > 0 ? Math.round((successCount / runs.length) * 100) : 0
    };
  });

  function formatTimeSaved(ms: number): string {
    if (ms < 1000) return '0s';
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) {
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
</script>

<div class="run-log-view">
  <header>
    <div class="header-left">
      <h1>Run Logs</h1>
      <span class="item-count">{runs.length}</span>
    </div>
    <div class="header-controls">
      {#if runs.length > 0}
        {#if showClearConfirm}
          <span class="confirm-text">Clear all logs?</span>
          <button class="btn-danger" onclick={handleClearAll}>Yes, Clear</button>
          <button class="btn-secondary" onclick={() => showClearConfirm = false}>Cancel</button>
        {:else}
          <button class="btn-secondary" onclick={() => showClearConfirm = true}>
            Clear All
          </button>
        {/if}
      {/if}
      <button class="reload-btn" onclick={handleReload} title="Reload">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 4v6h6M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      </button>
    </div>
  </header>

  <!-- KPI Stats Bar -->
  {#if runs.length > 0}
    <div class="kpi-bar">
      <div class="kpi-hero">
        <div class="kpi-hero-value">{formatTimeSaved(kpis.todayMs)}</div>
        <div class="kpi-hero-label">Time Saved Today</div>
      </div>
      <div class="kpi-time-breakdown">
        <div class="kpi-time-row">
          <span class="kpi-time-label">This Week</span>
          <span class="kpi-time-value">{formatTimeSaved(kpis.weekMs)}</span>
        </div>
        <div class="kpi-time-row">
          <span class="kpi-time-label">This Month</span>
          <span class="kpi-time-value">{formatTimeSaved(kpis.monthMs)}</span>
        </div>
        <div class="kpi-time-row kpi-time-total">
          <span class="kpi-time-label">All Time</span>
          <span class="kpi-time-value">{formatTimeSaved(kpis.totalMs)}</span>
        </div>
      </div>
      <div class="kpi-divider"></div>
      <div class="kpi-stats">
        <div class="kpi-stat">
          <div class="kpi-stat-value">{kpis.todayRuns}</div>
          <div class="kpi-stat-label">Runs Today</div>
        </div>
        <div class="kpi-stat">
          <div class="kpi-stat-value">{kpis.successRate}%</div>
          <div class="kpi-stat-label">Success Rate</div>
        </div>
      </div>
    </div>
  {/if}

  <div class="content">
    <!-- Running Section -->
    {#if hasRunning}
      <section class="running-section">
        <h2>
          <span class="pulse"></span>
          Currently Running ({$runningWorkflows.length})
        </h2>
        <div class="running-list">
          {#each $runningWorkflows as running (running.run_id)}
            <button class="running-card" onclick={() => selectRunning(running)}>
              <div class="running-header">
                <span class="title">{running.workflow_title}</span>
                <StatusBadge status="running" size="sm" />
              </div>
              <div class="running-meta">
                <span class="run-id">{running.run_id}</span>
                <span class="started">Started {formatTimestamp(running.started_at)}</span>
              </div>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- History Section -->
    <section class="history-section">
      {#if hasRunning}
        <h2>History</h2>
      {/if}

      {#if isLoading}
        <div class="loading-state">
          <p>Loading run logs...</p>
        </div>
      {:else if runs.length === 0}
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h3>No Run History</h3>
          <p>Workflow executions will appear here.</p>
        </div>
      {:else}
        <div class="run-list">
          {#each runs as run (run.id)}
            <button class="run-card" onclick={() => selectRun(run)}>
              <div class="run-header">
                <span class="title">{run.workflow_title}</span>
                <StatusBadge status={run.status} size="sm" />
              </div>
              <div class="run-meta">
                <span class="run-id">{run.id}</span>
                <span class="duration">{formatDuration(run.duration_ms)}</span>
                <span class="timestamp">{formatTimestamp(run.timestamp)}</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  .run-log-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
    color: var(--color-text);
  }

  header {
    padding: 20px 24px;
    background: var(--color-card);
    border-bottom: 1px solid var(--color-border);
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
    background: var(--color-surface);
    color: var(--color-text-secondary);
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 0.8rem;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .confirm-text {
    font-size: 0.9rem;
    color: var(--color-warning);
  }

  .btn-secondary,
  .btn-danger {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 0.85rem;
    cursor: pointer;
    border: none;
  }

  .btn-secondary {
    background: var(--color-surface);
    color: var(--color-text-secondary);
  }

  .btn-secondary:hover {
    background: var(--color-border);
    color: var(--color-text);
  }

  .btn-danger {
    background: var(--color-error-light);
    color: #991B1B;
  }

  .btn-danger:hover {
    background: #FECACA;
  }

  .reload-btn {
    width: 36px;
    height: 36px;
    padding: 8px;
    background: var(--color-surface);
    border: none;
    border-radius: 8px;
    color: var(--color-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .reload-btn:hover {
    background: var(--color-border);
    color: var(--color-text);
  }

  .reload-btn svg {
    width: 18px;
    height: 18px;
  }

  /* KPI Stats Bar */
  .kpi-bar {
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 20px 24px;
    background: var(--color-card);
    border-bottom: 1px solid var(--color-border);
  }

  .kpi-hero {
    display: flex;
    flex-direction: column;
  }

  .kpi-hero-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--color-success);
    line-height: 1.1;
  }

  .kpi-hero-label {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-top: 4px;
  }

  .kpi-time-breakdown {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 20px;
    border-left: 2px solid var(--color-border);
  }

  .kpi-time-row {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.85rem;
  }

  .kpi-time-label {
    color: var(--color-text-secondary);
    min-width: 70px;
  }

  .kpi-time-value {
    font-weight: 600;
    color: var(--color-text);
  }

  .kpi-time-total {
    padding-top: 4px;
    border-top: 1px solid var(--color-border);
    margin-top: 2px;
  }

  .kpi-time-total .kpi-time-value {
    color: var(--color-text-secondary);
  }

  .kpi-divider {
    width: 1px;
    height: 48px;
    background: var(--color-border);
    margin-left: auto;
  }

  .kpi-stats {
    display: flex;
    gap: 32px;
  }

  .kpi-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 80px;
  }

  .kpi-stat-value {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-text);
    line-height: 1.2;
  }

  .kpi-stat-label {
    font-size: 0.7rem;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-top: 2px;
  }

  .content {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
  }

  section h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 16px;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .running-section {
    margin-bottom: 32px;
  }

  .running-section h2 {
    color: var(--color-info);
  }

  .pulse {
    width: 8px;
    height: 8px;
    background: var(--color-info);
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(1.2);
    }
  }

  .running-list,
  .run-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .running-card,
  .run-card {
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 14px 18px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
  }

  .running-card {
    border-color: var(--color-info);
    background: var(--color-info-light);
  }

  .running-card:hover {
    border-color: var(--color-info);
    background: #BFDBFE;
  }

  .run-card:hover {
    border-color: var(--color-border-strong);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
  }

  .running-header,
  .run-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .title {
    font-weight: 500;
    color: var(--color-text);
    font-size: 0.95rem;
  }

  .running-meta,
  .run-meta {
    display: flex;
    gap: 16px;
    font-size: 0.8rem;
    color: var(--color-text-secondary);
  }

  .run-id {
    font-family: monospace;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .loading-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: var(--color-text-secondary);
  }

  .empty-icon {
    width: 48px;
    height: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  .empty-icon svg {
    width: 100%;
    height: 100%;
  }

  .empty-state h3 {
    margin: 0 0 8px;
    font-size: 1.1rem;
    color: var(--color-text);
  }

  .empty-state p {
    margin: 0;
    font-size: 0.9rem;
  }
</style>
