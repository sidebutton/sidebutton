<script lang="ts">
  import { pickerPalette } from '../theme';

  interface Props {
    selected: string;
    onchange: (color: string) => void;
  }

  let { selected, onchange }: Props = $props();

  const COLORS = [
    { hex: pickerPalette[0], name: "Blue" },
    { hex: pickerPalette[1], name: "Green" },
    { hex: pickerPalette[2], name: "Amber" },
    { hex: pickerPalette[3], name: "Purple" },
    { hex: pickerPalette[4], name: "Cyan" },
    { hex: pickerPalette[5], name: "Pink" },
    { hex: pickerPalette[6], name: "Slate" },
    { hex: pickerPalette[7], name: "Red" },
  ];
</script>

<div class="color-picker">
  <div class="color-swatches">
    {#each COLORS as color}
      <button
        type="button"
        class="swatch"
        class:selected={selected === color.hex}
        style="background-color: {color.hex}"
        title={color.name}
        onclick={() => onchange(color.hex)}
      ></button>
    {/each}
  </div>
</div>

<style>
  .color-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .color-swatches {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .swatch {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    border: 2px solid transparent;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .swatch:hover {
    transform: scale(1.1);
  }

  .swatch.selected {
    border-color: var(--color-text);
    box-shadow: 0 0 0 2px var(--color-card), 0 0 0 4px var(--color-text);
  }
</style>
