<script lang="ts">
  interface Props {
    runId: string;
    workflowId: string;
    workflowTitle: string;
    onclick?: () => void;
  }

  let { runId, workflowId, workflowTitle, onclick }: Props = $props();
</script>

<div class="running-card" onclick={onclick}>
  <div class="indicator"></div>
  <div class="info">
    <strong>{workflowTitle}</strong>
    <span>{runId}</span>
  </div>
</div>

<style>
  .running-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    cursor: pointer;
  }
  .running-card:hover { background: #f5f5f5; }
  .indicator {
    width: 8px;
    height: 8px;
    background: #4caf50;
    border-radius: 50%;
    animation: pulse 1s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .info { display: flex; flex-direction: column; }
  .info strong { font-size: 14px; }
  .info span { font-size: 11px; color: #888; font-family: monospace; }
</style>
