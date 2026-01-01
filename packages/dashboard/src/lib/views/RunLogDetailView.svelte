<script lang="ts">
  import { onMount } from "svelte";
  import { getRunLog, deleteRunLog } from "../api";
  import { navigateBack, navigateToRunLogs, viewState } from "../stores";
  import type { RunLog, WorkflowEvent } from "../types";
  import StatusBadge from "../components/StatusBadge.svelte";

  let runLog = $state<RunLog | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let showDeleteConfirm = $state(false);

  async function loadRunLog() {
    if (!$viewState.selectedRunLogId) return;
    isLoading = true;
    error = null;
    try {
      runLog = await getRunLog($viewState.selectedRunLogId);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load run log";
      console.error("Failed to load:", e);
    } finally {
      isLoading = false;
    }
  }

  async function handleDelete() {
    if (!runLog) return;
    try {
      await deleteRunLog(runLog.metadata.id);
      navigateToRunLogs();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to delete";
      console.error("Failed to delete:", e);
    }
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }

  function formatTimestamp(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleString();
  }

  function getEventClass(type: string): string {
    switch (type) {
      case 'workflow_start':
        return 'event-run';
      case 'workflow_end':
        return 'event-end';
      case 'step_start':
        return 'event-step';
      case 'step_end':
        return 'event-step-end';
      case 'error':
        return 'event-error';
      case 'log':
        return 'event-log';
      default:
        return '';
    }
  }

  function formatEvent(event: WorkflowEvent): string {
    switch (event.type) {
      case 'workflow_start':
        return `Start: ${event.action_title} (${event.action_id})`;
      case 'workflow_end':
        return event.success
          ? `End: ${event.action_id} - Success`
          : `End: ${event.action_id} - Failed: ${event.message ?? 'Unknown'}`;
      case 'step_start':
        return `Step ${event.step_index + 1}: ${event.step_type}${event.step_details ? ` - ${event.step_details}` : ''}`;
      case 'step_end':
        return event.success
          ? `Step ${event.step_index + 1} done${event.result ? `: ${event.result}` : ''}`
          : `Step ${event.step_index + 1} failed: ${event.message ?? ''}`;
      case 'error':
        return `Error: ${event.message}`;
      case 'log':
        return `[${event.level.toUpperCase()}] ${event.message}`;
      default:
        return JSON.stringify(event);
    }
  }

  onMount(() => {
    loadRunLog();
  });
</script>

<div class="detail-view">
  <header>
    <button class="back-btn" onclick={navigateBack}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Back
    </button>
    <div class="header-spacer"></div>
    {#if runLog}
      <div class="header-actions">
        {#if showDeleteConfirm}
          <span class="confirm-text">Delete this log?</span>
          <button class="btn-danger" onclick={handleDelete}>Yes, Delete</button>
          <button class="btn-secondary" onclick={() => showDeleteConfirm = false}>Cancel</button>
        {:else}
          <button class="btn-secondary" onclick={() => showDeleteConfirm = true}>Delete</button>
        {/if}
      </div>
    {/if}
  </header>

  <div class="content">
    {#if isLoading}
      <div class="loading">Loading run log...</div>
    {:else if error}
      <div class="error">{error}</div>
    {:else if runLog}
      <div class="run-info">
        <div class="title-row">
          <h1>{runLog.metadata.workflow_title}</h1>
          <StatusBadge status={runLog.metadata.status} />
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <span class="label">Run ID</span>
            <span class="value mono">{runLog.metadata.id}</span>
          </div>
          <div class="meta-item">
            <span class="label">Workflow ID</span>
            <span class="value mono">{runLog.metadata.workflow_id}</span>
          </div>
          <div class="meta-item">
            <span class="label">Duration</span>
            <span class="value">{formatDuration(runLog.metadata.duration_ms)}</span>
          </div>
          <div class="meta-item">
            <span class="label">Events</span>
            <span class="value">{runLog.metadata.event_count}</span>
          </div>
          <div class="meta-item">
            <span class="label">Triggered By</span>
            <span class="value">{runLog.metadata.triggered_by ?? 'unknown'}</span>
          </div>
          <div class="meta-item">
            <span class="label">Timestamp</span>
            <span class="value">{formatTimestamp(runLog.metadata.timestamp)}</span>
          </div>
        </div>

        <!-- Parameters Section -->
        {#if runLog.params && Object.keys(runLog.params).length > 0}
          <section class="section">
            <h2>Parameters</h2>
            <div class="params-list">
              {#each Object.entries(runLog.params) as [key, value]}
                <div class="param-item">
                  <span class="param-name">{key}</span>
                  <span class="param-value">{value}</span>
                </div>
              {/each}
            </div>
          </section>
        {/if}

        <!-- Events Section -->
        <section class="section">
          <h2>Events ({runLog.events.length})</h2>
          <div class="events-container">
            {#each runLog.events as event, index}
              <div
                class="event-item {getEventClass(event.type)}"
                style="padding-left: {16 + (event.depth ?? 0) * 20}px"
              >
                <span class="event-index">{index + 1}</span>
                <span class="event-type">{event.type}</span>
                <span class="event-message">{formatEvent(event)}</span>
              </div>
            {/each}
          </div>
        </section>
      </div>
    {:else}
      <div class="not-found">Run log not found.</div>
    {/if}
  </div>
</div>

<style>
  .detail-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
    color: var(--color-text);
  }

  header {
    padding: 16px 24px;
    background: var(--color-card);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: 0.9rem;
  }

  .back-btn:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }

  .back-btn svg {
    width: 16px;
    height: 16px;
  }

  .header-spacer {
    flex: 1;
  }

  .header-actions {
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
    border: 1px solid var(--color-border);
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

  .content {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
  }

  .loading,
  .error,
  .not-found {
    text-align: center;
    padding: 40px;
    color: var(--color-text-secondary);
  }

  .error {
    color: var(--color-error);
  }

  .run-info {
    max-width: 900px;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .meta-item {
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 12px 16px;
  }

  .meta-item .label {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .meta-item .value {
    font-size: 0.95rem;
    color: var(--color-text);
  }

  .meta-item .value.mono {
    font-family: monospace;
    font-size: 0.85rem;
    word-break: break-all;
  }

  .section {
    margin-bottom: 24px;
  }

  .section h2 {
    margin: 0 0 12px;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .params-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .param-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: 6px;
  }

  .param-name {
    font-weight: 500;
    color: #8B5CF6;
  }

  .param-value {
    color: var(--color-text-secondary);
    font-family: monospace;
    font-size: 0.9rem;
  }

  .events-container {
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 16px;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
    font-size: 0.8rem;
  }

  .event-item {
    display: flex;
    gap: 12px;
    padding: 6px 16px;
    border-radius: 4px;
    line-height: 1.4;
  }

  .event-item:hover {
    background: var(--color-surface);
  }

  .event-index {
    color: var(--color-text-muted);
    min-width: 30px;
    text-align: right;
  }

  .event-type {
    min-width: 100px;
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .event-message {
    flex: 1;
    color: var(--color-text);
    word-break: break-word;
  }

  .event-run .event-type {
    color: var(--color-info);
  }

  .event-end .event-type {
    color: var(--color-success);
  }

  .event-step .event-type {
    color: var(--color-text-secondary);
  }

  .event-step-end .event-type {
    color: #8B5CF6;
  }

  .event-error .event-type,
  .event-error .event-message {
    color: var(--color-error);
  }

  .event-log .event-type {
    color: var(--color-warning);
  }
</style>
