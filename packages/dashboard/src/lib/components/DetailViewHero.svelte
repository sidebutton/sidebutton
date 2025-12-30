<script lang="ts">
  import CategoryBadge from "./CategoryBadge.svelte";
  import type { CategoryLevel, CategoryDomain } from "../types";
  import { CATEGORY_LEVELS, CATEGORY_DOMAINS } from "../types";

  interface Props {
    title: string;
    description?: string;
    version?: string;
    lastVerified?: string;
    category?: { level: CategoryLevel; domain: CategoryDomain };
    parentId?: string;
    editable?: boolean;
    isSaving?: boolean;
    ontitlechange?: (title: string) => void;
    ondescriptionchange?: (description: string) => void;
    oncategorychange?: (level: CategoryLevel, domain: CategoryDomain) => void;
  }

  let {
    title,
    description,
    version,
    lastVerified,
    category,
    parentId,
    editable = false,
    isSaving = false,
    ontitlechange,
    ondescriptionchange,
    oncategorychange,
  }: Props = $props();

  // Editing state
  let isEditingTitle = $state(false);
  let isEditingDescription = $state(false);
  let isEditingCategory = $state(false);
  let editTitle = $state("");
  let editDescription = $state("");
  let editCategoryLevel = $state<CategoryLevel>("task");
  let editCategoryDomain = $state<CategoryDomain>("personal");

  function formatRelativeTime(date: string | undefined): string {
    if (!date) return "";
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

  function startEditTitle() {
    if (!editable) return;
    editTitle = title;
    isEditingTitle = true;
  }

  function saveTitle() {
    if (!editTitle.trim()) return;
    ontitlechange?.(editTitle.trim());
    isEditingTitle = false;
  }

  function cancelEditTitle() {
    isEditingTitle = false;
    editTitle = "";
  }

  function startEditDescription() {
    if (!editable) return;
    editDescription = description || "";
    isEditingDescription = true;
  }

  function saveDescription() {
    ondescriptionchange?.(editDescription.trim());
    isEditingDescription = false;
  }

  function cancelEditDescription() {
    isEditingDescription = false;
    editDescription = "";
  }

  function startEditCategory() {
    if (!editable) return;
    editCategoryLevel = category?.level || "task";
    editCategoryDomain = category?.domain || "personal";
    isEditingCategory = true;
  }

  function saveCategory() {
    oncategorychange?.(editCategoryLevel, editCategoryDomain);
    isEditingCategory = false;
  }

  function cancelEditCategory() {
    isEditingCategory = false;
  }
</script>

<div class="hero-section">
  <div class="hero-header">
    {#if isEditingTitle}
      <div class="edit-inline">
        <input type="text" bind:value={editTitle} class="edit-input title-input" />
        <button class="btn-save-small" onclick={saveTitle} disabled={isSaving}>Save</button>
        <button class="btn-cancel-small" onclick={cancelEditTitle}>Cancel</button>
      </div>
    {:else}
      <h1
        class:editable={editable}
        onclick={editable ? startEditTitle : undefined}
        title={editable ? "Click to edit" : undefined}
      >
        {title}
      </h1>
    {/if}
    <div class="hero-badges">
      {#if version}
        <span class="version-badge">v{version}</span>
      {/if}
      {#if lastVerified}
        <span class="verified-badge" title="Verified: {lastVerified}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          Verified {formatRelativeTime(lastVerified)}
        </span>
      {/if}
      {#if parentId}
        <span class="forked-badge" title="Forked from: {parentId}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <circle cx="18" cy="6" r="3" />
            <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" />
            <path d="M12 12v3" />
          </svg>
          Forked
        </span>
      {/if}
    </div>
  </div>

  {#if isEditingDescription}
    <div class="edit-inline description-edit">
      <textarea bind:value={editDescription} class="edit-textarea" rows="2" placeholder="Add a description..."></textarea>
      <div class="edit-buttons">
        <button class="btn-save-small" onclick={saveDescription} disabled={isSaving}>Save</button>
        <button class="btn-cancel-small" onclick={cancelEditDescription}>Cancel</button>
      </div>
    </div>
  {:else if description}
    <p
      class="hero-description"
      class:editable={editable}
      onclick={editable ? startEditDescription : undefined}
      title={editable ? "Click to edit" : undefined}
    >
      {description}
    </p>
  {:else if editable}
    <p class="hero-description placeholder editable" onclick={startEditDescription}>
      Click to add description...
    </p>
  {/if}

  <div class="hero-category">
    {#if isEditingCategory}
      <div class="edit-inline category-edit">
        <select bind:value={editCategoryLevel} class="edit-select">
          {#each Object.entries(CATEGORY_LEVELS) as [key, info]}
            <option value={key}>{info.label}</option>
          {/each}
        </select>
        <select bind:value={editCategoryDomain} class="edit-select">
          {#each Object.entries(CATEGORY_DOMAINS) as [key, info]}
            <option value={key}>{info.label}</option>
          {/each}
        </select>
        <button class="btn-save-small" onclick={saveCategory} disabled={isSaving}>Save</button>
        <button class="btn-cancel-small" onclick={cancelEditCategory}>Cancel</button>
      </div>
    {:else if category}
      <div
        class:editable={editable}
        onclick={editable ? startEditCategory : undefined}
        title={editable ? "Click to edit" : undefined}
      >
        <CategoryBadge level={category.level} domain={category.domain} showDomain={true} size="md" />
      </div>
    {:else if editable}
      <span class="placeholder editable" onclick={startEditCategory}>Click to set category...</span>
    {/if}
  </div>
</div>

<style>
  .hero-section {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 20px;
  }

  .hero-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  h1 {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 600;
    line-height: 1.3;
  }

  h1.editable {
    cursor: pointer;
    border-radius: 4px;
    padding: 4px 8px;
    margin: -4px -8px;
    transition: background 0.15s;
  }

  h1.editable:hover {
    background: #f0f0f0;
  }

  .hero-badges {
    display: flex;
    gap: 10px;
    flex-shrink: 0;
  }

  .version-badge {
    font-size: 0.8rem;
    padding: 4px 12px;
    background: #f0f0f0;
    border-radius: 6px;
    color: #666;
    font-family: ui-monospace, monospace;
  }

  .verified-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    padding: 4px 12px;
    background: #e8f5e9;
    border-radius: 6px;
    color: #388e3c;
  }

  .verified-badge svg {
    width: 14px;
    height: 14px;
  }

  .forked-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    padding: 4px 10px;
    background: #f3e5f5;
    color: #7b1fa2;
    border-radius: 4px;
  }

  .forked-badge svg {
    width: 14px;
    height: 14px;
  }

  .hero-description {
    margin: 0 0 16px;
    color: #555;
    font-size: 1rem;
    line-height: 1.6;
  }

  .hero-description.editable {
    cursor: pointer;
    border-radius: 4px;
    padding: 4px 8px;
    margin-left: -8px;
    transition: background 0.15s;
  }

  .hero-description.editable:hover {
    background: #f0f0f0;
  }

  .hero-description.placeholder {
    color: #999;
    font-style: italic;
  }

  .hero-category {
    display: flex;
    align-items: center;
  }

  .hero-category .editable {
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.15s;
  }

  .hero-category .editable:hover {
    background: #f0f0f0;
  }

  .placeholder {
    color: #999;
    font-style: italic;
    font-size: 0.9rem;
    padding: 4px 8px;
  }

  /* Edit inline styles */
  .edit-inline {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .description-edit {
    flex-direction: column;
    align-items: stretch;
    margin-bottom: 16px;
  }

  .category-edit {
    gap: 8px;
  }

  .edit-input {
    padding: 8px 12px;
    border: 1px solid #2196f3;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .title-input {
    font-size: 1.5rem;
    font-weight: 600;
    min-width: 300px;
  }

  .edit-textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #2196f3;
    border-radius: 6px;
    font-size: 0.95rem;
    font-family: inherit;
    resize: vertical;
  }

  .edit-select {
    padding: 8px 12px;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    font-size: 0.85rem;
    background: #fff;
  }

  .edit-buttons {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .btn-save-small,
  .btn-cancel-small {
    padding: 6px 14px;
    border-radius: 4px;
    font-size: 0.8rem;
    cursor: pointer;
    border: none;
  }

  .btn-save-small {
    background: #4caf50;
    color: #fff;
  }

  .btn-save-small:hover:not(:disabled) {
    background: #388e3c;
  }

  .btn-save-small:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-cancel-small {
    background: #f0f0f0;
    color: #666;
  }

  .btn-cancel-small:hover {
    background: #e0e0e0;
  }
</style>
