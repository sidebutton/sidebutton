<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { fetchAgents, startAgent, stopAgent, getRoles, fetchSkillPacks } from "../api";
  import { agents, showToast, skillPacks } from "../stores";
  import { navigateToRunLogDetail } from "../router";
  import type { AgentJob, RoleContext, InstalledPack } from "../types";

  let isLoading = $state(true);
  let running = $state<AgentJob[]>([]);
  let completed = $state<AgentJob[]>([]);
  let showStartModal = $state(false);
  let roles = $state<RoleContext[]>([]);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Start modal state
  let selectedRole = $state('se');
  let agentPrompt = $state('');
  let isStarting = $state(false);
  let isRefreshing = $state(false);

  async function handleRefresh() {
    isRefreshing = true;
    try {
      await loadData();
      showToast('Agents refreshed', 'success');
    } catch (e) {
      showToast(`Refresh failed: ${e}`, 'error');
    } finally {
      isRefreshing = false;
    }
  }

  async function loadData() {
    try {
      const [data, loadedRoles, packs] = await Promise.all([
        fetchAgents(),
        getRoles(),
        fetchSkillPacks(),
      ]);
      running = data.running;
      completed = data.completed;
      agents.set([...data.running, ...data.completed]);
      roles = loadedRoles.filter(r => r.enabled !== false);
      skillPacks.set(packs);
    } catch (e) {
      console.error("Failed to load agents:", e);
    } finally {
      isLoading = false;
    }
  }

  async function handleStart() {
    if (!agentPrompt.trim()) {
      showToast("Please enter a prompt for the agent", "warning");
      return;
    }

    isStarting = true;
    try {
      await startAgent({ role: selectedRole, prompt: agentPrompt.trim() });
      showToast(`${selectedRole.toUpperCase()} agent started`, "success");
      showStartModal = false;
      agentPrompt = '';
      await loadData();
    } catch (e) {
      showToast(`Failed to start agent: ${e}`, "error");
    } finally {
      isStarting = false;
    }
  }

  async function handleStop(agentId: string) {
    if (!confirm("Stop this agent?")) return;
    try {
      await stopAgent(agentId);
      showToast("Agent stopped", "success");
      await loadData();
    } catch (e) {
      showToast(`Failed to stop: ${e}`, "error");
    }
  }

  function formatDuration(startedAt: string, durationMs?: number): string {
    const ms = durationMs || (Date.now() - new Date(startedAt).getTime());
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  function formatTimeAgo(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function formatTokens(count: number): string {
    if (count < 1000) return String(count);
    return `${Math.round(count / 1000)}K`;
  }

  function formatCost(cost?: number): string {
    if (!cost) return '$0';
    return `$${cost.toFixed(2)}`;
  }

  onMount(() => {
    loadData();
    // Poll running agents every 5 seconds
    pollInterval = setInterval(() => {
      if (running.length > 0) loadData();
    }, 5000);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });
</script>

<div class="agents-view">
  <header>
    <h1>Agents</h1>
    <div class="header-actions">
      <button class="reload-btn" onclick={handleRefresh} title="Refresh agents" disabled={isRefreshing}>
        <svg class:spinning={isRefreshing} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 4v6h6M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      </button>
      <button class="btn btn-primary" onclick={() => showStartModal = true}>+ Start Agent</button>
    </div>
  </header>

  <div class="content">
    {#if isLoading}
      <div class="loading">Loading agents...</div>
    {:else}
      <!-- Running Agents -->
      {#if running.length > 0}
        <section class="section">
          <h2>Running ({running.length})</h2>
          <div class="agent-list">
            {#each running as agent (agent.run_id)}
              <div class="agent-card running">
                <div class="agent-header">
                  <div class="agent-status-row">
                    <span class="status-dot running"></span>
                    <span class="agent-title">{agent.workflow_title}</span>
                    <span class="role-badge">{agent.role.toUpperCase()}</span>
                  </div>
                  <span class="agent-time">
                    Started {formatTimeAgo(agent.started_at)} · {formatDuration(agent.started_at)}
                  </span>
                </div>

                {#if agent.initial_prompt}
                  <div class="agent-prompt">
                    <p>{agent.initial_prompt}</p>
                  </div>
                {/if}

                <div class="agent-metrics">
                  <span>Actions: {agent.metrics.action_count}</span>
                  <span>Tokens: {formatTokens(agent.metrics.token_count)}</span>
                  <span>Cost: {formatCost(agent.metrics.cost_estimate)}</span>
                </div>

                {#if agent.current_task}
                  <div class="agent-output">
                    <span class="output-line">{agent.current_task}</span>
                  </div>
                {/if}

                <div class="agent-actions">
                  <button class="btn btn-ghost btn-sm" onclick={() => navigateToRunLogDetail(agent.run_id)}>View Log</button>
                  <button class="btn btn-danger btn-sm" onclick={() => handleStop(agent.run_id)}>Stop</button>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Completed Agents -->
      {#if completed.length > 0}
        <section class="section">
          <h2>Completed Today ({completed.length})</h2>
          <div class="agent-list">
            {#each completed as agent (agent.run_id)}
              <div class="agent-card" class:failed={agent.status === 'failed'}>
                <div class="agent-header">
                  <div class="agent-status-row">
                    <span class="status-dot" class:success={agent.status === 'completed'} class:failed={agent.status === 'failed'}></span>
                    <span class="agent-title">{agent.workflow_title}</span>
                    <span class="role-badge">{agent.role.toUpperCase()}</span>
                  </div>
                  <span class="agent-time">
                    {formatDuration(agent.started_at, agent.duration_ms)} · Completed {formatTimeAgo(agent.started_at)}
                  </span>
                </div>

                {#if agent.result_summary}
                  <div class="agent-result">
                    {agent.status === 'completed' ? 'Result' : 'Error'}: {agent.result_summary}
                  </div>
                {/if}

                <div class="agent-actions">
                  <button class="btn btn-ghost btn-sm" onclick={() => navigateToRunLogDetail(agent.run_id)}>View Log</button>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Empty state -->
      {#if running.length === 0 && completed.length === 0}
        <div class="empty-card">
          <h3>No Agents Running</h3>
          <p>Agents are autonomous workflows that run in a terminal. Start an SE or QA agent to pick up issues and work on them automatically.</p>
          <button class="btn btn-primary" onclick={() => showStartModal = true}>+ Start Agent</button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<!-- Start Agent Modal -->
{#if showStartModal}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-overlay" role="dialog" aria-modal="true" tabindex="-1" onclick={() => showStartModal = false} onkeydown={(e) => { if (e.key === 'Escape') showStartModal = false; }}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal" role="presentation" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <h2>Start Agent</h2>

      <div class="form-group">
        <label for="agent-role">Role</label>
        <select id="agent-role" bind:value={selectedRole}>
          {#each roles as role}
            <option value={role.name.toLowerCase().replace(/\s+/g, '-')}>
              {role.name}
            </option>
          {/each}
          {#if roles.length === 0}
            <option value="se">Software Engineer</option>
            <option value="qa">QA Engineer</option>
            <option value="pm">Product Manager</option>
          {/if}
        </select>
      </div>

      <div class="form-group">
        <label for="agent-prompt">Prompt</label>
        <textarea
          id="agent-prompt"
          bind:value={agentPrompt}
          placeholder="e.g., Pick issue SCRUM-142 from backlog, implement fix for login validation error, create PR when tests pass."
          rows="4"
        ></textarea>
      </div>

      <div class="modal-actions">
        <button class="btn btn-ghost" onclick={() => showStartModal = false}>Cancel</button>
        <button class="btn btn-primary" onclick={handleStart} disabled={isStarting}>
          {isStarting ? 'Starting...' : 'Start Agent'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .agents-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
  }

  header {
    padding: 20px 24px;
    background: var(--color-card);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  header h1 { font-size: 24px; font-weight: 600; color: var(--color-text); margin: 0; }

  .header-actions { display: flex; align-items: center; gap: 8px; }

  .reload-btn {
    width: 36px; height: 36px; padding: 8px;
    background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 8px;
    color: var(--color-text-secondary); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all var(--transition-fast);
  }
  .reload-btn:hover:not(:disabled) { background: var(--color-border); color: var(--color-text); }
  .reload-btn:disabled { opacity: 0.5; cursor: default; }
  .reload-btn svg { width: 18px; height: 18px; }
  .reload-btn svg.spinning { animation: spin 0.8s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  .content { flex: 1; padding: 24px; overflow-y: auto; }

  .loading { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--color-text-secondary); }

  .section { margin-bottom: 24px; }
  .section h2 {
    margin: 0 0 12px; font-size: 12px; font-weight: 600;
    color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px;
  }

  .agent-list { display: flex; flex-direction: column; gap: 12px; }

  .agent-card {
    padding: 16px 20px; background: var(--color-card); border: 1px solid var(--color-border);
    border-radius: var(--radius-lg); display: flex; flex-direction: column; gap: 10px;
  }
  .agent-card.running { border-left: 3px solid var(--color-success); }
  .agent-card.failed { border-left: 3px solid var(--color-error); }

  .agent-header { display: flex; flex-direction: column; gap: 4px; }
  .agent-status-row { display: flex; align-items: center; gap: 8px; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--color-text-muted); }
  .status-dot.running { background: var(--color-success); animation: pulse 2s infinite; }
  .status-dot.success { background: var(--color-success); }
  .status-dot.failed { background: var(--color-error); }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

  .agent-title { font-size: 15px; font-weight: 600; color: var(--color-text); }
  .role-badge {
    font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
    background: var(--color-surface); color: var(--color-text-secondary); border: 1px solid var(--color-border);
  }
  .agent-time { font-size: 12px; color: var(--color-text-muted); }

  .agent-prompt {
    padding: 8px 12px; background: var(--color-surface); border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }
  .agent-prompt p { margin: 0; font-size: 13px; color: var(--color-text-secondary); line-height: 1.5; }

  .agent-metrics {
    display: flex; gap: 16px; font-size: 12px; color: var(--color-text-secondary);
    padding: 6px 10px; background: var(--color-surface); border-radius: var(--radius-md);
  }

  .agent-output {
    padding: 8px 10px; background: #1e1e2e; border-radius: var(--radius-md);
    font-family: monospace; font-size: 12px; color: #a6adc8;
  }

  .agent-result {
    font-size: 13px; color: var(--color-text-secondary); padding: 6px 10px;
    background: var(--color-surface); border-radius: var(--radius-md);
  }

  .agent-actions { display: flex; gap: 8px; justify-content: flex-end; }

  .empty-card {
    padding: 48px 24px; text-align: center; background: var(--color-card);
    border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  }
  .empty-card h3 { margin: 0 0 8px; font-size: 18px; font-weight: 600; color: var(--color-text); }
  .empty-card p { margin: 0 0 16px; font-size: 14px; color: var(--color-text-secondary); max-width: 500px; display: inline-block; }

  /* Modal */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000;
    display: flex; align-items: center; justify-content: center;
  }
  .modal {
    background: var(--color-card); border-radius: var(--radius-lg); padding: 24px;
    width: 100%; max-width: 480px; box-shadow: 0 20px 60px rgba(0,0,0,0.2);
  }
  .modal h2 { margin: 0 0 20px; font-size: 20px; font-weight: 600; color: var(--color-text); }

  .form-group { margin-bottom: 16px; }
  .form-group label { display: block; font-size: 13px; font-weight: 600; color: var(--color-text-secondary); margin-bottom: 6px; }
  .form-group select, .form-group textarea {
    width: 100%; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md);
    font-size: 14px; background: var(--color-surface); font-family: inherit; resize: vertical;
  }

  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }

  .btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px;
    border: none; border-radius: var(--radius-md); cursor: pointer; font-size: 14px; font-weight: 500;
    transition: all var(--transition-fast);
  }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .btn-primary { background: var(--color-primary); color: white; }
  .btn-primary:hover:not(:disabled) { opacity: 0.9; }
  .btn-ghost { background: transparent; color: var(--color-text-secondary); }
  .btn-ghost:hover { color: var(--color-text); background: var(--color-surface); }
  .btn-danger { background: var(--color-error); color: white; }
  .btn-danger:hover { opacity: 0.9; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
</style>
