<script setup lang="ts">
import { onMounted } from 'vue'

onMounted(() => {
  const logo = document.querySelector('.VPNavBarTitle a, .VPNavBarTitle')
  if (logo) {
    logo.addEventListener('click', (e) => {
      e.preventDefault()
      window.location.href = 'https://sidebutton.com'
    })
  }
})
</script>

<template>
  <section class="hero-section">
    <div class="hero-container">
      <h1 class="hero-title">SideButton Documentation</h1>
      <p class="hero-tagline">
        Open source platform for AI agents with structured roles, skills, and domain knowledge.
      </p>

      <a href="/sidebutton-agent-stack.png" target="_blank" class="hero-image-link">
        <img src="/sidebutton-agent-stack.png" alt="The AI Agent Stack — SideButton" />
      </a>

      <div class="hero-actions">
        <a href="/installation" class="btn btn-primary">Get Started</a>
        <a href="/knowledge-packs/overview" class="btn btn-secondary">Knowledge Packs</a>
        <a href="https://github.com/sidebutton/sidebutton" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">GitHub</a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero-section {
  padding: 2.5rem 0 2rem;
}

.hero-container {
  max-width: 48rem;
  margin: 0 auto;
  padding: 0 1.5rem;
  text-align: center;
}

.hero-title {
  font-size: 1.75rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--vp-c-text-1);
}

.hero-tagline {
  font-size: 1.05rem;
  color: var(--vp-c-text-2);
  line-height: 1.6;
  margin-bottom: 1.5rem;
}

.hero-image-link {
  display: block;
  margin: 0 auto 1.5rem;
  max-width: 600px;
}

.hero-image-link img {
  width: 100%;
  height: auto;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  transition: box-shadow 0.2s ease;
}

.hero-image-link:hover img {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1.125rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.15s ease;
}

.btn-primary {
  background: linear-gradient(135deg, #15C39A 0%, #0EA87D 100%);
  color: white;
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
</style>
