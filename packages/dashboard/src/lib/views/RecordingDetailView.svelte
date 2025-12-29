<script lang="ts">
  import { onMount } from "svelte";
  import {
    getRecording,
    deleteRecording,
    convertRecording,
    convertRecordingWithLLM,
    getSettings,
  } from "../api";
  import {
    viewState,
    navigateBack,
    navigateToRecordings,
    navigateToActionDetail,
  } from "../stores";
  import type { Recording, Settings, RecordedEvent } from "../types";

  let recording = $state<Recording | null>(null);
  let settings = $state<Settings | null>(null);
  let isLoading = $state(true);
  let isConverting = $state(false);
  let error = $state<string | null>(null);
  let showDeleteConfirm = $state(false);

  async function loadRecording() {
    const recordingId = $viewState.selectedRecordingId;
    if (!recordingId) return;

    isLoading = true;
    error = null;
    try {
      recording = await getRecording(recordingId);
      settings = await getSettings();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load recording";
      console.error("Failed to load:", e);
    } finally {
      isLoading = false;
    }
  }

  async function handleDelete() {
    if (!recording) return;
    try {
      await deleteRecording(recording.id);
      navigateToRecordings();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to delete";
      console.error("Failed to delete:", e);
    }
  }

  async function handleConvert() {
    if (!recording) return;
    isConverting = true;
    error = null;
    try {
      const action = await convertRecording(recording.id);
      navigateToActionDetail(action.id);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to convert";
      console.error("Failed to convert:", e);
    } finally {
      isConverting = false;
    }
  }

  async function handleConvertWithAI() {
    if (!recording) return;
    isConverting = true;
    error = null;
    try {
      const action = await convertRecordingWithLLM(recording.id);
      navigateToActionDetail(action.id);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to convert with AI";
      console.error("Failed to convert:", e);
    } finally {
      isConverting = false;
    }
  }

  function formatTimestamp(ts: string): string {
    return new Date(ts).toLocaleString();
  }

  function getEventTypeColor(type: string): string {
    switch (type) {
      case 'navigate':
        return '#3b82f6';
      case 'click':
        return '#22c55e';
      case 'input':
        return '#a78bfa';
      case 'scroll':
        return '#f59e0b';
      case 'extract':
        return '#ec4899';
      default:
        return '#888';
    }
  }

  function formatEventDetails(event: RecordedEvent): string {
    switch (event.event_type) {
      case 'navigate':
        return event.url || '';
      case 'click':
        return event.selector || '';
      case 'input':
        return `${event.selector}: "${event.value}"`;
      case 'scroll':
        return `${event.direction} ${event.amount}px`;
      case 'extract':
        return event.selector || '';
      default:
        return JSON.stringify(event);
    }
  }

  onMount(() => {
    loadRecording();
  });

  let hasApiKey = $derived(!!settings?.llm?.api_key);
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
    {#if recording}
      <div class="header-actions">
        {#if showDeleteConfirm}
          <span class="confirm-text">Delete this recording?</span>
          <button class="btn-danger" onclick={handleDelete}>Yes, Delete</button>
          <button class="btn-secondary" onclick={() => showDeleteConfirm = false}>Cancel</button>
        {:else if isConverting}
          <span class="converting">Converting...</span>
        {:else}
          <button class="btn-secondary" onclick={() => showDeleteConfirm = true}>Delete</button>
          <button class="btn-secondary" onclick={handleConvert}>Save as Workflow</button>
          <button
            class="btn-primary"
            onclick={handleConvertWithAI}
            disabled={!hasApiKey}
            title={hasApiKey ? "Convert with AI optimization" : "Configure LLM API key in Settings"}
          >
            Convert with AI
          </button>
        {/if}
      </div>
    {/if}
  </header>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  <div class="content">
    {#if isLoading}
      <div class="loading">Loading recording...</div>
    {:else if recording}
      <div class="recording-info">
        <div class="meta-section">
          <div class="meta-item">
            <span class="label">Recording ID</span>
            <span class="value mono">{recording.id}</span>
          </div>
          <div class="meta-item">
            <span class="label">Recorded</span>
            <span class="value">{formatTimestamp(recording.timestamp)}</span>
          </div>
          <div class="meta-item">
            <span class="label">Events</span>
            <span class="value">{recording.events.length}</span>
          </div>
        </div>

        <section class="events-section">
          <h2>Events ({recording.events.length})</h2>
          <div class="events-container">
            {#each recording.events as event, index}
              <div class="event-item">
                <span class="event-index">{index + 1}</span>
                <span
                  class="event-type"
                  style="color: {getEventTypeColor(event.event_type)}"
                >
                  {event.event_type}
                </span>
                <span class="event-details">{formatEventDetails(event)}</span>
              </div>
            {/each}
          </div>
        </section>

        <section class="raw-section">
          <h2>Raw JSON</h2>
          <pre class="raw-json">{JSON.stringify(recording, null, 2)}</pre>
        </section>
      </div>
    {:else}
      <div class="not-found">Recording not found.</div>
    {/if}
  </div>
</div>

<style>
  .detail-view {
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

  .back-btn:hover {
    background: #f0f0f0;
    color: #1a1a1a;
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
    color: #f57c00;
  }

  .converting {
    font-size: 0.9rem;
    color: #666;
  }

  .btn-primary,
  .btn-secondary,
  .btn-danger {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 0.9rem;
    cursor: pointer;
    border: none;
    font-weight: 500;
  }

  .btn-primary {
    background: #7b1fa2;
    color: #fff;
  }

  .btn-primary:hover:not(:disabled) {
    background: #6a1b9a;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: #f0f0f0;
    color: #666;
    border: 1px solid #e0e0e0;
  }

  .btn-secondary:hover {
    background: #e0e0e0;
    color: #1a1a1a;
  }

  .btn-danger {
    background: #ffebee;
    color: #c62828;
  }

  .btn-danger:hover {
    background: #ffcdd2;
  }

  .error-banner {
    padding: 12px 24px;
    background: #ffebee;
    color: #c62828;
    font-size: 0.9rem;
  }

  .content {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
  }

  .loading,
  .not-found {
    text-align: center;
    padding: 40px;
    color: #666;
  }

  .recording-info {
    max-width: 900px;
  }

  .meta-section {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .meta-item {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 12px 16px;
  }

  .meta-item .label {
    display: block;
    font-size: 0.75rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .meta-item .value {
    font-size: 0.95rem;
    color: #1a1a1a;
  }

  .meta-item .value.mono {
    font-family: monospace;
    font-size: 0.85rem;
    word-break: break-all;
  }

  .events-section,
  .raw-section {
    margin-bottom: 24px;
  }

  h2 {
    margin: 0 0 12px;
    font-size: 0.9rem;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .events-container {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 16px;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
    font-size: 0.8rem;
  }

  .event-item {
    display: flex;
    gap: 12px;
    padding: 8px 16px;
    border-radius: 4px;
    line-height: 1.4;
  }

  .event-item:hover {
    background: #f5f5f5;
  }

  .event-index {
    color: #999;
    min-width: 30px;
    text-align: right;
  }

  .event-type {
    min-width: 80px;
    font-weight: 500;
  }

  .event-details {
    flex: 1;
    color: #666;
    word-break: break-all;
  }

  .raw-json {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 16px;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
    font-size: 0.75rem;
    color: #333;
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
    margin: 0;
  }
</style>
