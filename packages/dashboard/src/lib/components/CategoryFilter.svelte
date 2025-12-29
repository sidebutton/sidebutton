<script lang="ts">
  import type { CategoryLevel } from '../types';
  import { CATEGORY_LEVELS } from '../types';

  interface Props {
    selected?: CategoryLevel | 'all';
    onChange?: (level: CategoryLevel | 'all') => void;
  }
  let { selected = $bindable('all'), onChange = () => {} }: Props = $props();

  const levels: (CategoryLevel | 'all')[] = ['all', 'primitive', 'task', 'process', 'workflow', 'pipeline'];

  function handleClick(level: CategoryLevel | 'all') {
    selected = level;
    onChange(level);
  }
</script>

<div class="filter-pills">
  {#each levels as level}
    <button
      class="pill"
      class:active={selected === level}
      style={level !== 'all' ? `--pill-color: ${CATEGORY_LEVELS[level].color}; --pill-bg: ${CATEGORY_LEVELS[level].bgColor}` : ''}
      onclick={() => handleClick(level)}
    >
      {#if level === 'all'}
        All
      {:else}
        {CATEGORY_LEVELS[level].badge}
      {/if}
    </button>
  {/each}
</div>

<style>
  .filter-pills {
    display: flex;
    gap: 8px;
    padding: 12px 0;
    flex-wrap: wrap;
  }

  .pill {
    padding: 6px 12px;
    border-radius: 16px;
    border: 1px solid #e5e7eb;
    background: #fff;
    color: #6b7280;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  }

  .pill:hover {
    border-color: #d1d5db;
    background: #f9fafb;
  }

  .pill.active {
    border-color: var(--pill-color, #3b82f6);
    background: var(--pill-bg, #dbeafe);
    color: var(--pill-color, #3b82f6);
  }
</style>
