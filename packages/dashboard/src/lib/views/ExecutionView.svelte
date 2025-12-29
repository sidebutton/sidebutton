<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { stopWorkflow, getWorkflow } from "../api";
  import {
    viewState,
    logs,
    isRunning,
    currentRunId,
    navigateBack,
    navigateToWorkflowDetail,
    navigateToActionDetail,
  } from "../stores";
  import { initWebSocket } from "../websocket";
  import type { Action } from "../types";

  let workflow = $state<Action | null>(null);
  let logContainer: HTMLDivElement | null = null;
  let error = $state<string | null>(null);

  // Auto-scroll to bottom when new logs arrive
  $effect(() => {
    if ($logs.length > 0 && logContainer) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  });

  async function loadWorkflow() {
    const workflowId = $viewState.selectedWorkflowId || $viewState.selectedActionId;
    if (!workflowId) return;

    try {
      workflow = await getWorkflow(workflowId);
    } catch (e) {
      console.error("Failed to load workflow:", e);
    }
  }

  async function handleStop() {
    const runId = $currentRunId;
    if (!runId) return;

    try {
      await stopWorkflow(runId);
      isRunning.set(false);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to stop workflow";
      console.error("Failed to stop:", e);
    }
  }

  function handleBack() {
    if ($viewState.selectedWorkflowId) {
      navigateToWorkflowDetail($viewState.selectedWorkflowId);
    } else if ($viewState.selectedActionId) {
      navigateToActionDetail($viewState.selectedActionId);
    } else {
      navigateBack();
    }
  }

  function handleDone() {
    navigateBack();
  }

  function getLogClass(type: string): string {
    switch (type) {
      case 'run':
        return 'log-run';
      case 'success':
        return 'log-success';
      case 'error':
        return 'log-error';
      case 'step':
        return 'log-step';
      case 'result':
        return 'log-result';
      case 'warn':
        return 'log-warn';
      default:
        return '';
    }
  }

  onMount(() => {
    loadWorkflow();
    initWebSocket();
  });
</script>

<div class="execution-view">
  <header>
    <button class="back-btn" onclick={handleBack} disabled={$isRunning}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Back
    </button>

    <div class="header-info">
      {#if workflow}
        <h1>{workflow.title}</h1>
      {:else}
        <h1>Execution</h1>
      {/if}

      {#if $isRunning}
        <span class="status running">
          <span class="pulse"></span>
          Running
        </span>
      {:else}
        <span class="status completed">Completed</span>
      {/if}
    </div>

    <div class="header-actions">
      {#if $isRunning}
        <button class="btn-stop" onclick={handleStop}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          </svg>
          Stop
        </button>
      {:else}
        <button class="btn-primary" onclick={handleDone}>
          Done
        </button>
      {/if}
    </div>
  </header>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  <div class="content">
    <div class="log-header">
      <span class="log-count">{$logs.length} events</span>
      {#if $currentRunId}
        <span class="run-id">Run: {$currentRunId}</span>
      {/if}
    </div>

    <div class="log-container" bind:this={logContainer}>
      {#if $logs.length === 0}
        <div class="empty-state">
          <div class="spinner"></div>
          <p>Waiting for execution events...</p>
        </div>
      {:else}
        {#each $logs as log, index (index)}
          <div
            class="log-entry {getLogClass(log.type)}"
            style="padding-left: {16 + (log.depth ?? 0) * 20}px"
          >
            <span class="log-time">{log.timestamp}</span>
            <span class="log-type">{log.type}</span>
            <span class="log-message">{log.message}</span>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .execution-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #fafafa;
    color: #1a1a1a;
  }

  header {
    padding: 16px 24px;
    background: #fff;
    border-bottom: 1px solid #e0e0e0;
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
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    color: #666;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .back-btn:hover:not(:disabled) {
    background: #f0f0f0;
    color: #1a1a1a;
  }

  .back-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .back-btn svg {
    width: 16px;
    height: 16px;
  }

  .header-info {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .header-info h1 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .status.running {
    background: #e3f2fd;
    color: #1976d2;
  }

  .status.completed {
    background: #e8f5e9;
    color: #388e3c;
  }

  .pulse {
    width: 8px;
    height: 8px;
    background: #1976d2;
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

  .header-actions {
    display: flex;
    gap: 12px;
  }

  .btn-stop {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: #ffebee;
    border: none;
    border-radius: 8px;
    color: #c62828;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .btn-stop:hover {
    background: #ffcdd2;
  }

  .btn-stop svg {
    width: 16px;
    height: 16px;
  }

  .btn-primary {
    padding: 10px 20px;
    background: #2196f3;
    border: none;
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .btn-primary:hover {
    background: #1976d2;
  }

  .error-banner {
    padding: 12px 24px;
    background: #ffebee;
    color: #c62828;
    font-size: 0.9rem;
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 24px;
    overflow: hidden;
  }

  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .log-count {
    font-size: 0.85rem;
    color: #666;
  }

  .run-id {
    font-size: 0.75rem;
    font-family: monospace;
    color: #888;
  }

  .log-container {
    flex: 1;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 16px;
    overflow-y: auto;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
    font-size: 0.85rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #666;
    gap: 16px;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #e0e0e0;
    border-top-color: #2196f3;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .log-entry {
    display: flex;
    gap: 12px;
    padding: 6px 16px;
    border-radius: 4px;
    line-height: 1.4;
  }

  .log-entry:hover {
    background: #f5f5f5;
  }

  .log-time {
    color: #888;
    min-width: 80px;
    flex-shrink: 0;
  }

  .log-type {
    min-width: 60px;
    flex-shrink: 0;
    font-weight: 500;
  }

  .log-message {
    flex: 1;
    color: #333;
    word-break: break-word;
  }

  /* Log type colors */
  .log-run .log-type {
    color: #1976d2;
  }

  .log-success .log-type {
    color: #388e3c;
  }

  .log-success .log-message {
    color: #388e3c;
  }

  .log-error .log-type {
    color: #c62828;
  }

  .log-error .log-message {
    color: #c62828;
  }

  .log-step .log-type {
    color: #666;
  }

  .log-result .log-type {
    color: #7b1fa2;
  }

  .log-result .log-message {
    color: #7b1fa2;
  }

  .log-warn .log-type {
    color: #f57c00;
  }

  .log-warn .log-message {
    color: #f57c00;
  }
</style>
