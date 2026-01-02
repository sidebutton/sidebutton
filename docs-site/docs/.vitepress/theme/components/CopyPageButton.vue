<script setup lang="ts">
import { ref, computed } from 'vue'
import { useData, useRoute } from 'vitepress'

const { page } = useData()
const route = useRoute()

const copied = ref(false)
const loading = ref(false)
const showDropdown = ref(false)

// Build raw GitHub URL from current path
const rawUrl = computed(() => {
  const path = page.value.relativePath
  return `https://raw.githubusercontent.com/sidebutton/sidebutton/main/docs-site/docs/${path}`
})

// GitHub edit URL (same as editLink)
const editUrl = computed(() => {
  const path = page.value.relativePath
  return `https://github.com/sidebutton/sidebutton/edit/main/docs-site/docs/${path}`
})

async function copyPageAsMarkdown() {
  loading.value = true
  try {
    const response = await fetch(rawUrl.value)
    if (!response.ok) throw new Error('Failed to fetch')
    const markdown = await response.text()
    await navigator.clipboard.writeText(markdown)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (err) {
    console.error('Failed to copy page:', err)
    // Fallback: copy the page URL
    await navigator.clipboard.writeText(window.location.href)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } finally {
    loading.value = false
  }
}

async function copyPageUrl() {
  await navigator.clipboard.writeText(window.location.href)
  copied.value = true
  showDropdown.value = false
  setTimeout(() => { copied.value = false }, 2000)
}

function openInGitHub() {
  window.open(editUrl.value, '_blank')
  showDropdown.value = false
}

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
}

// Close dropdown on outside click
function closeDropdown(e: Event) {
  const target = e.target as HTMLElement
  if (!target.closest('.copy-page-container')) {
    showDropdown.value = false
  }
}
</script>

<template>
  <div class="copy-page-container" v-on:focusout="closeDropdown">
    <div class="copy-page-buttons">
      <!-- Main copy button -->
      <button
        class="copy-btn copy-btn-main"
        @click="copyPageAsMarkdown"
        :disabled="loading"
        :aria-label="copied ? 'Copied!' : 'Copy page as Markdown'"
      >
        <!-- Checkmark icon when copied -->
        <svg v-if="copied" class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <!-- Copy icon -->
        <svg v-else class="icon" width="16" height="16" viewBox="0 0 18 18" fill="none">
          <path d="M14.25 5.25H7.25C6.14543 5.25 5.25 6.14543 5.25 7.25V14.25C5.25 15.3546 6.14543 16.25 7.25 16.25H14.25C15.3546 16.25 16.25 15.3546 16.25 14.25V7.25C16.25 6.14543 15.3546 5.25 14.25 5.25Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2.80103 11.998L1.77203 5.07397C1.61003 3.98097 2.36403 2.96397 3.45603 2.80197L10.38 1.77297C11.313 1.63397 12.19 2.16297 12.528 3.00097" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>{{ copied ? 'Copied!' : 'Copy page' }}</span>
      </button>

      <!-- Dropdown toggle -->
      <button
        class="copy-btn copy-btn-dropdown"
        @click="toggleDropdown"
        aria-label="More actions"
        :aria-expanded="showDropdown"
      >
        <svg width="8" height="12" viewBox="0 0 8 12" class="chevron" :class="{ 'chevron-open': showDropdown }">
          <path d="M1 1L4 4L1 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- Dropdown menu -->
    <div v-if="showDropdown" class="copy-dropdown">
      <button class="dropdown-item" @click="copyPageUrl">
        <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        <span>Copy link</span>
      </button>
      <button class="dropdown-item" @click="openInGitHub">
        <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        <span>Edit on GitHub</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.copy-page-container {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
}

.copy-page-buttons {
  display: flex;
  align-items: stretch;
}

.copy-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  cursor: pointer;
  transition: all 0.15s ease;
}

.copy-btn:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  border-color: var(--vp-c-brand-1);
}

.copy-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.copy-btn-main {
  border-radius: 8px 0 0 8px;
  border-right: none;
}

.copy-btn-dropdown {
  border-radius: 0 8px 8px 0;
  padding: 6px 8px;
}

.icon {
  flex-shrink: 0;
}

.chevron {
  transition: transform 0.15s ease;
  transform: rotate(90deg);
}

.chevron-open {
  transform: rotate(270deg);
}

.copy-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 160px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
  overflow: hidden;
}

.dark .copy-dropdown {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--vp-c-text-2);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.dropdown-item:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
}

.dropdown-item + .dropdown-item {
  border-top: 1px solid var(--vp-c-border);
}
</style>
