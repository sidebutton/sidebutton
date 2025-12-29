<script lang="ts">
  import { onMount } from "svelte";
  import {
    listRecordings,
    getRecordingStatus,
    startRecording,
    stopRecording,
    getBrowserStatus,
  } from "../api";
  import {
    recordings,
    recordingStatus,
    mcpStatus,
    navigateToRecordingDetail,
  } from "../stores";
  import { initWebSocket } from "../websocket";
  import type { RecordingMetadata } from "../types";

  let isLoading = $state(true);
  let error = $state<string | null>(null);

  async function loadRecordings() {
    isLoading = true;
    try {
      const loaded = await listRecordings();
      recordings.set(loaded);
    } catch (e) {
      console.error("Failed to load recordings:", e);
    } finally {
      isLoading = false;
    }
  }

  async function loadStatus() {
    try {
      const status = await getRecordingStatus();
      recordingStatus.set(status);

      const browserStatus = await getBrowserStatus();
      mcpStatus.set({
        server_running: browserStatus.server_running,
        browser_connected: browserStatus.browser_connected,
        error: null,
      });
    } catch (e) {
      console.error("Failed to load status:", e);
    }
  }

  async function handleStartRecording() {
    error = null;
    try {
      await startRecording();
      recordingStatus.set({ is_recording: true, event_count: 0 });
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to start recording";
      console.error("Failed to start:", e);
    }
  }

  async function handleStopRecording() {
    error = null;
    try {
      const recording = await stopRecording();
      recordingStatus.set({ is_recording: false, event_count: 0 });
      // Reload to show new recording
      await loadRecordings();
      // Navigate to new recording
      navigateToRecordingDetail(recording.id);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to stop recording";
      console.error("Failed to stop:", e);
    }
  }

  async function handleReload() {
    await loadRecordings();
    await loadStatus();
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

  function selectRecording(recording: RecordingMetadata) {
    navigateToRecordingDetail(recording.id);
  }

  onMount(() => {
    initWebSocket();
    loadRecordings();
    loadStatus();
  });

  let isRecording = $derived($recordingStatus.is_recording);
  let eventCount = $derived($recordingStatus.event_count);
  let browserConnected = $derived($mcpStatus.browser_connected);
</script>

<div class="recordings-view">
  <header>
    <div class="header-left">
      <h1>Recordings</h1>
      <span class="item-count">{$recordings.length}</span>
    </div>
    <div class="header-controls">
      {#if isRecording}
        <div class="recording-status">
          <span class="recording-pulse"></span>
          <span class="recording-label">Recording ({eventCount} events)</span>
        </div>
        <button class="btn-stop" onclick={handleStopRecording}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          </svg>
          Stop
        </button>
      {:else}
        <button
          class="btn-primary"
          onclick={handleStartRecording}
          disabled={!browserConnected}
          title={browserConnected ? "Start recording" : "Browser not connected"}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="8" />
          </svg>
          Start Recording
        </button>
      {/if}
      <button class="reload-btn" onclick={handleReload} title="Reload">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 4v6h6M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      </button>
    </div>
  </header>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  {#if !browserConnected}
    <div class="warning-banner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>Browser extension not connected. Install and enable the extension to record.</span>
    </div>
  {/if}

  <div class="content">
    {#if isLoading}
      <div class="loading-state">
        <p>Loading recordings...</p>
      </div>
    {:else if $recordings.length === 0}
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" fill="currentColor" />
          </svg>
        </div>
        <h2>No Recordings Yet</h2>
        <p>Click "Start Recording" to capture browser interactions.</p>
        <p class="hint">Make sure the browser extension is connected.</p>
      </div>
    {:else}
      <div class="recording-list">
        {#each $recordings as recording (recording.id)}
          <button class="recording-card" onclick={() => selectRecording(recording)}>
            <div class="recording-header">
              <span class="recording-id">{recording.id}</span>
              <span class="event-badge">{recording.event_count} events</span>
            </div>
            <div class="recording-meta">
              <span class="timestamp">{formatTimestamp(recording.timestamp)}</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .recordings-view {
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

  .recording-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #ffebee;
    border-radius: 8px;
  }

  .recording-pulse {
    width: 10px;
    height: 10px;
    background: #c62828;
    border-radius: 50%;
    animation: pulse 1s ease-in-out infinite;
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

  .recording-label {
    color: #c62828;
    font-size: 0.85rem;
  }

  .btn-primary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: #c62828;
    border: none;
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .btn-primary:hover:not(:disabled) {
    background: #b71c1c;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary svg {
    width: 14px;
    height: 14px;
  }

  .btn-stop {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: #f0f0f0;
    border: none;
    border-radius: 8px;
    color: #1a1a1a;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .btn-stop:hover {
    background: #e0e0e0;
  }

  .btn-stop svg {
    width: 16px;
    height: 16px;
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

  .error-banner {
    padding: 12px 24px;
    background: #ffebee;
    color: #c62828;
    font-size: 0.9rem;
  }

  .warning-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 24px;
    background: #fff3e0;
    color: #e65100;
    font-size: 0.9rem;
  }

  .warning-banner svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .content {
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
    color: #c62828;
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
  }

  .empty-state .hint {
    margin-top: 8px;
    font-size: 0.8rem;
    color: #888;
  }

  .recording-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .recording-card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 16px 20px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
  }

  .recording-card:hover {
    border-color: #bdbdbd;
    background: #f5f5f5;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .recording-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .recording-id {
    font-family: monospace;
    font-size: 0.9rem;
    color: #1a1a1a;
  }

  .event-badge {
    font-size: 0.75rem;
    padding: 4px 10px;
    background: #f0f0f0;
    border-radius: 9999px;
    color: #666;
  }

  .recording-meta {
    font-size: 0.8rem;
    color: #666;
  }
</style>
