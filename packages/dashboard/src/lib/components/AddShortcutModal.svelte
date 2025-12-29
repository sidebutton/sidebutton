<script lang="ts">
  import type { Action, DashboardShortcut } from "../types";
  import { showToast } from "../stores";
  import ColorPicker from "./ColorPicker.svelte";

  interface Props {
    action: Action | null;
    existingShortcut?: DashboardShortcut | null;
    onsave: (shortcut: DashboardShortcut) => void;
    oncancel: () => void;
  }

  let { action, existingShortcut = null, onsave, oncancel }: Props = $props();

  // Form state
  let customName = $state(existingShortcut?.custom_name || action?.title || "");
  let color = $state(existingShortcut?.color || "#2196f3");
  let params = $state<Record<string, string | boolean>>(
    existingShortcut?.params
      ? { ...existingShortcut.params }
      : initializeParams()
  );
  let paramErrors = $state<Record<string, string>>({});

  function initializeParams(): Record<string, string | boolean> {
    if (!action) return {};
    const result: Record<string, string | boolean> = {};
    for (const [key, type] of Object.entries(action.params || {})) {
      result[key] = type === "boolean" ? false : "";
    }
    return result;
  }

  function generateId(): string {
    return `shortcut_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  function validateParams(): boolean {
    if (!action) return false;

    const errors: Record<string, string> = {};
    for (const [key, type] of Object.entries(action.params || {})) {
      const value = params[key];
      if (type === "boolean") {
        continue;
      }
      if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
        errors[key] = `${key} is required`;
      } else if (type === "number" && isNaN(Number(value))) {
        errors[key] = `${key} must be a number`;
      }
    }

    paramErrors = errors;
    return Object.keys(errors).length === 0;
  }

  function handleSave() {
    if (!action) return;

    // Validate name
    if (!customName.trim()) {
      showToast("Please enter a name for this shortcut", "warning");
      return;
    }

    // Validate params
    if (!validateParams()) {
      return;
    }

    // Convert params to strings
    const convertedParams: Record<string, string> = {};
    for (const [key, _type] of Object.entries(action.params || {})) {
      convertedParams[key] = String(params[key]);
    }

    const shortcut: DashboardShortcut = {
      id: existingShortcut?.id || generateId(),
      action_id: action.id,
      custom_name: customName.trim(),
      color,
      params: convertedParams,
      order: existingShortcut?.order ?? 999,
    };

    onsave(shortcut);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      oncancel();
    }
  }
</script>

<div
  class="modal-overlay"
  onclick={oncancel}
  onkeydown={handleKeydown}
  role="dialog"
  aria-modal="true"
  aria-labelledby="shortcut-modal-title"
  tabindex="-1"
>
  <div class="modal" role="document" onclick={(e) => e.stopPropagation()}>
    <div class="modal-header">
      <h2 id="shortcut-modal-title">
        {existingShortcut ? "Edit Shortcut" : "Add to Dashboard"}
      </h2>
      <button class="modal-close" onclick={oncancel} aria-label="Close modal">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <div class="modal-body">
      {#if action}
        <p class="modal-subtitle">
          Create a shortcut for <strong>{action.title}</strong>
        </p>

        <div class="form-group">
          <label for="shortcut-name">Shortcut Name</label>
          <input
            type="text"
            id="shortcut-name"
            bind:value={customName}
            placeholder="Enter a custom name"
          />
        </div>

        <div class="form-group">
          <label>Accent Color</label>
          <ColorPicker selected={color} onchange={(c) => (color = c)} />
        </div>

        {#if Object.keys(action.params || {}).length > 0}
          <div class="form-group">
            <label>Parameters</label>
            <p class="params-hint">
              These values will be used when running from the Dashboard.
            </p>
            <div class="params-form">
              {#each Object.entries(action.params || {}) as [key, type]}
                <div class="param-field" class:has-error={paramErrors[key]}>
                  <label for="param-{key}">
                    {key}
                    <span class="param-type-badge">{type}</span>
                  </label>
                  {#if type === "boolean"}
                    <label class="checkbox-label">
                      <input
                        type="checkbox"
                        id="param-{key}"
                        checked={params[key] === true || params[key] === "true"}
                        onchange={(e) =>
                          (params = {
                            ...params,
                            [key]: (e.target as HTMLInputElement).checked,
                          })}
                      />
                      <span class="checkbox-text">
                        {params[key] === true || params[key] === "true" ? "True" : "False"}
                      </span>
                    </label>
                  {:else}
                    <input
                      type={type === "number" ? "number" : "text"}
                      id="param-{key}"
                      value={params[key] || ""}
                      oninput={(e) =>
                        (params = {
                          ...params,
                          [key]: (e.target as HTMLInputElement).value,
                        })}
                      placeholder={`Enter ${key}`}
                    />
                  {/if}
                  {#if paramErrors[key]}
                    <span class="param-error">{paramErrors[key]}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {:else}
        <div class="error-state">
          <p>Action not found. This shortcut references a deleted action.</p>
        </div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="cancel-btn" onclick={oncancel}>Cancel</button>
      <button class="save-btn" onclick={handleSave} disabled={!action}>
        {existingShortcut ? "Save Changes" : "Add to Dashboard"}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: white;
    border-radius: 12px;
    width: 100%;
    max-width: 480px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid #e0e0e0;
  }

  .modal-header h2 {
    font-size: 18px;
    font-weight: 600;
    color: #1a1a1a;
    margin: 0;
  }

  .modal-close {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    color: #666;
    transition: all 0.15s;
  }

  .modal-close:hover {
    background: #f0f0f0;
    color: #333;
  }

  .modal-close svg {
    width: 20px;
    height: 20px;
  }

  .modal-body {
    padding: 24px;
    overflow-y: auto;
    flex: 1;
  }

  .modal-subtitle {
    color: #666;
    margin: 0 0 20px 0;
    font-size: 14px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group > label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: #333;
    margin-bottom: 8px;
  }

  .form-group input[type="text"],
  .form-group input[type="number"] {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }

  .form-group input:focus {
    outline: none;
    border-color: #2196f3;
  }

  .params-hint {
    font-size: 13px;
    color: #888;
    margin: 0 0 12px 0;
  }

  .params-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .param-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .param-field label {
    font-size: 13px;
    font-weight: 500;
    color: #444;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .param-type-badge {
    font-size: 10px;
    font-weight: 500;
    padding: 2px 6px;
    background: #e3f2fd;
    color: #1976d2;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .param-field input[type="text"],
  .param-field input[type="number"] {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
  }

  .param-field input:focus {
    outline: none;
    border-color: #2196f3;
  }

  .param-field.has-error input {
    border-color: #f44336;
  }

  .param-error {
    font-size: 12px;
    color: #f44336;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .checkbox-label input {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .checkbox-text {
    font-size: 14px;
    color: #333;
  }

  .error-state {
    padding: 20px;
    background: #fff3e0;
    border-radius: 8px;
    color: #e65100;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid #e0e0e0;
  }

  .cancel-btn {
    padding: 10px 20px;
    border: 1px solid #ddd;
    background: white;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    color: #666;
    transition: all 0.2s;
  }

  .cancel-btn:hover {
    background: #f5f5f5;
  }

  .save-btn {
    padding: 10px 20px;
    background: #2196f3;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .save-btn:hover:not(:disabled) {
    background: #1976d2;
  }

  .save-btn:disabled {
    background: #bdbdbd;
    cursor: not-allowed;
  }
</style>
