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
    <!-- Animated background mesh -->
    <div class="hero-bg">
      <div class="hero-gradient-1"></div>
      <div class="hero-gradient-2"></div>
      <div class="hero-grid"></div>
    </div>

    <div class="hero-container">
      <div class="hero-content">
        <div class="hero-badge">
          <span class="hero-badge-dot"></span>
          Free & Open Source
        </div>

        <h1 class="hero-title">
          Automate your browser<br />
          <span class="gradient-text">in seconds</span>
        </h1>

        <p class="hero-subtitle">
          Run workflows, control any website, connect AI tools to your browser.<br />
          Works with any LLM and MCP agent.
        </p>

        <!-- Terminal Command -->
        <div class="hero-terminal">
          <div class="terminal-header">
            <div class="terminal-dots">
              <span class="dot dot-red"></span>
              <span class="dot dot-yellow"></span>
              <span class="dot dot-green"></span>
            </div>
            <span class="terminal-title">Terminal</span>
          </div>
          <div class="terminal-body">
            <div class="terminal-line">
              <span class="terminal-prompt">$</span>
              <span class="terminal-command">{{ command }}</span>
              <button
                class="terminal-copy"
                :class="{ copied }"
                @click="copyCommand"
                aria-label="Copy command"
              >
                <svg v-if="!copied" class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <svg v-else class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
            </div>
            <div class="terminal-output">
              <span class="output-line">Starting SideButton server...</span>
              <span class="output-line output-success">Dashboard ready at http://localhost:9876</span>
            </div>
          </div>
        </div>

        <div class="hero-actions">
          <a href="/installation" class="btn btn-primary">
            Get Started
          </a>
          <a href="https://github.com/AskSideButton/sidebutton" class="btn btn-secondary">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            GitHub
          </a>
        </div>

        <div class="hero-trust">
          <div class="trust-item">
            <svg class="trust-icon" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            No sign-up required
          </div>
          <div class="trust-item">
            <svg class="trust-icon" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            Runs 100% locally
          </div>
          <div class="trust-item">
            <svg class="trust-icon" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            Works with any AI
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero-section {
  position: relative;
  padding: 4rem 0 3rem;
  overflow: hidden;
  display: flex;
  align-items: center;
  min-height: calc(100vh - 64px - 200px);
}

@media (max-width: 768px) {
  .hero-section {
    padding: 3rem 0 2rem;
    min-height: auto;
  }
}

.hero-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.hero-gradient-1 {
  position: absolute;
  top: -150px;
  left: 50%;
  transform: translateX(-50%);
  width: 900px;
  height: 600px;
  background: radial-gradient(ellipse at center, rgba(21, 195, 154, 0.2) 0%, transparent 60%);
  animation: hero-pulse-1 8s ease-in-out infinite;
}

.hero-gradient-2 {
  position: absolute;
  top: 200px;
  right: -100px;
  width: 500px;
  height: 500px;
  background: radial-gradient(ellipse at center, rgba(139, 92, 246, 0.12) 0%, transparent 60%);
  animation: hero-pulse-2 10s ease-in-out infinite;
}

.hero-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(0, 0, 0, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 0, 0, 0.02) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
}

@keyframes hero-pulse-1 {
  0%, 100% { opacity: 0.6; transform: translateX(-50%) scale(1); }
  50% { opacity: 0.8; transform: translateX(-50%) scale(1.05); }
}

@keyframes hero-pulse-2 {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.1); }
}

.hero-container {
  position: relative;
  max-width: 64rem;
  margin: 0 auto;
  padding: 0 1.5rem;
  width: 100%;
}

.hero-content {
  text-align: center;
  max-width: 48rem;
  margin: 0 auto;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.875rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 9999px;
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
  margin-bottom: 1.5rem;
}

.hero-badge-dot {
  width: 6px;
  height: 6px;
  background: #22C55E;
  border-radius: 50%;
  animation: badge-pulse 2s ease-in-out infinite;
}

@keyframes badge-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.hero-title {
  font-size: clamp(2.5rem, 6vw, 4rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin-bottom: 1.25rem;
  color: var(--vp-c-text-1);
}

.gradient-text {
  background: linear-gradient(135deg, #15C39A 0%, #0EA87D 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 1.25rem;
  color: var(--vp-c-text-2);
  line-height: 1.6;
  margin-bottom: 2rem;
}

@media (max-width: 640px) {
  .hero-subtitle {
    font-size: 1.125rem;
  }
}

/* Terminal */
.hero-terminal {
  max-width: 480px;
  margin: 0 auto 2rem;
  border-radius: 12px;
  overflow: hidden;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 20px 40px -10px rgba(0, 0, 0, 0.15);
}

.terminal-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: #1E293B;
  border-bottom: 1px solid #334155;
}

.terminal-dots {
  display: flex;
  gap: 6px;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.dot-red { background: #EF4444; }
.dot-yellow { background: #EAB308; }
.dot-green { background: #22C55E; }

.terminal-title {
  flex: 1;
  text-align: center;
  font-size: 0.75rem;
  color: #94A3B8;
  font-weight: 500;
}

.terminal-body {
  background: #0F172A;
  padding: 1.25rem;
}

.terminal-line {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 1rem;
  margin-bottom: 1rem;
}

.terminal-prompt {
  color: #22C55E;
  font-weight: 600;
}

.terminal-command {
  color: #F8FAFC;
  flex: 1;
  text-align: left;
}

.terminal-copy {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: 1px solid #475569;
  border-radius: 6px;
  color: #94A3B8;
  cursor: pointer;
  transition: all 0.2s ease;
}

.terminal-copy:hover {
  background: #1E293B;
  border-color: #15C39A;
  color: #15C39A;
}

.terminal-copy.copied {
  background: rgba(21, 195, 154, 0.1);
  border-color: #15C39A;
  color: #15C39A;
}

.copy-icon, .check-icon {
  width: 16px;
  height: 16px;
}

.terminal-output {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-top: 0.75rem;
  border-top: 1px solid #1E293B;
}

.output-line {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.8125rem;
  color: #64748B;
  text-align: left;
}

.output-success {
  color: #22C55E;
}

/* Actions */
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
  margin-bottom: 2rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 0.9375rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s ease;
}

.btn-primary {
  background: linear-gradient(135deg, #15C39A 0%, #0EA87D 100%);
  color: white;
  border: none;
}

.btn-primary:hover {
  box-shadow: 0 4px 16px rgba(21, 195, 154, 0.4);
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

/* Trust Items */
.hero-trust {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  justify-content: center;
}

.trust-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
}

.trust-icon {
  width: 18px;
  height: 18px;
  color: #22C55E;
}

@media (prefers-reduced-motion: reduce) {
  .hero-gradient-1,
  .hero-gradient-2,
  .hero-badge-dot {
    animation: none;
  }
}
</style>
