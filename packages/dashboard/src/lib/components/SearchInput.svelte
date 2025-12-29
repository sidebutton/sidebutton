<script lang="ts">
  interface Props {
    value?: string;
    placeholder?: string;
    debounceMs?: number;
    onSearch?: (value: string) => void;
    onClear?: () => void;
  }
  let { value = $bindable(''), placeholder = 'Search...', debounceMs = 300, onSearch = () => {}, onClear = () => {} }: Props = $props();

  let inputValue = $state(value);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    inputValue = target.value;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      value = inputValue;
      onSearch(inputValue);
    }, debounceMs);
  }

  function handleClear() {
    inputValue = '';
    value = '';
    onSearch('');
    onClear();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleClear();
    }
  }

  let hasValue = $derived(inputValue.length > 0);
</script>

<div class="search-container">
  <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>

  <input
    type="text"
    {placeholder}
    value={inputValue}
    oninput={handleInput}
    onkeydown={handleKeydown}
  />

  {#if hasValue}
    <button class="clear-btn" onclick={handleClear} title="Clear search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  {/if}
</div>

<style>
  .search-container {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    width: 16px;
    height: 16px;
    color: #888;
    pointer-events: none;
  }

  input {
    width: 100%;
    padding: 10px 36px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    color: #1a1a1a;
    font-size: 0.9rem;
  }

  input::placeholder {
    color: #888;
  }

  input:focus {
    outline: none;
    border-color: #2196f3;
  }

  .clear-btn {
    position: absolute;
    right: 8px;
    width: 24px;
    height: 24px;
    padding: 4px;
    background: transparent;
    border: none;
    color: #888;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .clear-btn:hover {
    background: #f0f0f0;
    color: #1a1a1a;
  }

  .clear-btn svg {
    width: 14px;
    height: 14px;
  }
</style>
