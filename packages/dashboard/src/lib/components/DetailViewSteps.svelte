<script lang="ts">
  import StepIcon from "./StepIcon.svelte";
  import type { Action } from "../types";
  import { formatStepDetails } from "../utils/stepFormatters";

  type Step = Action["steps"][number];

  interface Props {
    steps: Step[];
    editable?: boolean;
    isSaving?: boolean;
    onedit?: (index: number) => void;
    ondelete?: (index: number) => void;
  }

  let { steps, editable = false, isSaving = false, onedit, ondelete }: Props = $props();

  function handleEdit(index: number) {
    onedit?.(index);
  }

  function handleDelete(index: number) {
    if (confirm("Delete this step?")) {
      ondelete?.(index);
    }
  }
</script>

<section class="steps-section">
  <h2>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
    Steps
    <span class="count-badge">{steps.length}</span>
  </h2>
  <div class="steps-list">
    {#each steps as step, index}
      <div class="step-card">
        <div class="step-header">
          <span class="step-number">{index + 1}</span>
          <StepIcon stepType={step.type} size={20} />
          <span class="step-type">{step.type}</span>
          {#if editable}
            <div class="step-actions">
              <button class="step-action-btn" onclick={() => handleEdit(index)} title="Edit" disabled={isSaving}>
                Edit
              </button>
              <button class="step-action-btn danger" onclick={() => handleDelete(index)} title="Delete" disabled={isSaving}>
                Delete
              </button>
            </div>
          {/if}
        </div>
        <div class="step-details">
          {formatStepDetails(step)}
        </div>
      </div>
    {/each}
  </div>
</section>

<style>
  .steps-section {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 16px;
    font-size: 0.95rem;
    font-weight: 600;
    color: #333;
  }

  h2 svg {
    width: 18px;
    height: 18px;
    color: #666;
  }

  .count-badge {
    font-size: 0.75rem;
    padding: 2px 8px;
    background: #e3f2fd;
    color: #1976d2;
    border-radius: 10px;
    font-weight: 500;
  }

  .steps-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .step-card {
    background: #f8f9fa;
    border: 1px solid #e8e8e8;
    border-radius: 10px;
    padding: 14px 16px;
  }

  .step-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  .step-number {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #e0e0e0;
    border-radius: 50%;
    font-size: 0.8rem;
    font-weight: 600;
    color: #555;
    flex-shrink: 0;
  }

  .step-type {
    font-family: ui-monospace, monospace;
    font-size: 0.9rem;
    font-weight: 500;
    color: #1a1a1a;
    flex: 1;
  }

  .step-details {
    margin-left: 38px;
    font-size: 0.85rem;
    color: #666;
    font-family: ui-monospace, monospace;
    word-break: break-word;
    line-height: 1.5;
  }

  .step-actions {
    display: flex;
    gap: 6px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .step-card:hover .step-actions {
    opacity: 1;
  }

  .step-action-btn {
    padding: 4px 10px;
    background: transparent;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    color: #666;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .step-action-btn:hover:not(:disabled) {
    background: #f0f0f0;
    color: #1a1a1a;
  }

  .step-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .step-action-btn.danger {
    color: #c62828;
  }

  .step-action-btn.danger:hover:not(:disabled) {
    background: #ffebee;
  }
</style>
