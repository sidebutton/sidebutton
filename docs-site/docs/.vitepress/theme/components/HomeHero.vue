<script setup lang="ts">
import { ref } from 'vue'

const copied = ref(false)
const command = 'npx sidebutton@latest'

async function copyCommand() {
  try {
    await navigator.clipboard.writeText(command)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}
</script>

<template>
  <section class="hero-section">
    <div class="hero-container">
      <h1 class="hero-product-title">SideButton</h1>

      <p class="hero-tagline">
        Give your AI agent a real browser.<br />
        Open source MCP server for Chrome.
      </p>

      <div class="hero-actions">
        <a
          href="https://chromewebstore.google.com/detail/sidebutton/odaefhmdmgijnhdbkfagnlnmobphgkij"
          class="btn btn-primary"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2a10 10 0 0 1 8.66 5H12" />
            <path d="M2.34 17L7 9.14" />
            <path d="M14 22a10 10 0 0 0 6.66-5H16" />
          </svg>
          Install Chrome Extension
        </a>
        <a href="/installation" class="btn btn-secondary">
          View Documentation
        </a>
      </div>

      <div class="hero-command">
        <code class="command-text">$ {{ command }}</code>
        <button
          class="command-copy"
          :class="{ copied }"
          @click="copyCommand"
          aria-label="Copy command"
        >
          <svg v-if="!copied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
      </div>

      <p class="hero-compat">
        Works with Claude Code &middot; Cursor &middot; Any MCP client
      </p>
    </div>
  </section>
</template>

<style scoped>
.hero-section {
  padding: 4rem 0 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 768px) {
  .hero-section {
    padding: 3rem 0 2rem;
  }
}

.hero-container {
  max-width: 42rem;
  margin: 0 auto;
  padding: 0 1.5rem;
  text-align: center;
}

.hero-product-title {
  font-size: clamp(3rem, 8vw, 4.5rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1;
  margin-bottom: 1.25rem;
  background: linear-gradient(135deg, #15C39A 0%, #0EA87D 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-tagline {
  font-size: clamp(1.125rem, 2.5vw, 1.375rem);
  color: var(--vp-c-text-2);
  line-height: 1.6;
  margin-bottom: 2rem;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
  margin-bottom: 1.75rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border-radius: 8px;
  font-size: 0.9375rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.15s ease;
}

.btn-primary {
  background: linear-gradient(135deg, #15C39A 0%, #0EA87D 100%);
  color: white;
  border: none;
}

.btn-primary:hover {
  box-shadow: 0 4px 16px rgba(21, 195, 154, 0.35);
  transform: translateY(-1px);
}

.btn-secondary {
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
}

.btn-secondary:hover {
  border-color: var(--vp-c-brand-1);
}

.btn-icon {
  width: 18px;
  height: 18px;
}

.hero-command {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  margin-bottom: 1.5rem;
}

.command-text {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
}

.command-copy {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  color: var(--vp-c-text-3);
  cursor: pointer;
  transition: all 0.15s ease;
}

.command-copy:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.command-copy.copied {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.hero-compat {
  font-size: 0.8125rem;
  color: var(--vp-c-text-3);
  letter-spacing: 0.01em;
}
</style>
