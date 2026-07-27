<script lang="ts">
  /**
   * SideButton "S" mark — single source for the dashboard's brand glyph.
   * The path is byte-identical to website/public/favicon.svg and the
   * design-system <Logo> mark. Fill follows `currentColor`, defaulting to the
   * brand token (--color-primary), so it stays on-brand and theme-consistent.
   *
   * Decorative by default: both current call sites render it next to the
   * visible "SideButton" wordmark, so the mark is aria-hidden to avoid a
   * doubled accessible name. Pass `label` to give it a name when used alone.
   */
  let { size = 24, label }: { size?: number; label?: string } = $props();
</script>

<svg
  class="sb-logo"
  viewBox="80 240 420 420"
  width={size}
  height={size}
  fill="currentColor"
  role={label ? "img" : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : "true"}
  focusable="false"
>
  <path d="M122.96,593.43l20.99-57.86c42.5,20.99,101.38,34.82,151.55,34.82,68.61,0,112.64-26.11,112.64-75.26,0-41.47-29.18-62.98-93.18-69.12-65.54-6.14-86.53-21.5-86.53-50.18,0-31.23,29.7-48.64,90.62-48.64,26.62,0,57.34,4.1,77.82,11.78v-20.99c-19.46-7.17-47.62-11.26-77.82-11.26-53.76,0-111.1,16.9-111.1,69.12,0,41.98,31.23,64,104.96,70.66,55.81,5.12,74.75,20.48,74.75,48.64,0,35.33-32.77,54.78-92.16,54.78-49.15,0-103.93-13.31-144.38-33.79l18.94-51.2c-27.14-18.94-40.96-48.64-40.96-84.48,0-95.23,91.13-129.53,189.95-129.53,50.18,0,103.93,9.73,146.94,26.62v136.7c22.02,19.46,33.79,47.1,33.79,79.36,0,98.81-96.25,132.61-199.17,132.61-68.09,0-134.65-12.8-177.66-32.77Z" />
</svg>

<style>
  .sb-logo {
    color: var(--color-primary);
    flex-shrink: 0;
  }
</style>
