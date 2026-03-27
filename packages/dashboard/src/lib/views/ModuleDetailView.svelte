<script lang="ts">
  import { onMount } from "svelte";
  import { viewState, showToast } from "../stores";
  import { fetchSkillModules, runWorkflow, listRunLogs } from "../api";
  import { navigateBack, navigateToExecution, navigateToRunLogDetail } from "../router";
  import type { SkillModule, RunLogMetadata } from "../types";

  let mod = $state<SkillModule | null>(null);
  let recentRuns = $state<RunLogMetadata[]>([]);
  let isLoading = $state(true);

  async function loadData() {
    const domain = $viewState.selectedSkillDomain;
    const modulePath = $viewState.selectedModulePath;
    if (!domain || !modulePath) return;

    isLoading = true;
    try {
      const modules = await fetchSkillModules(domain);
      mod = modules.find(m => m.path === modulePath) || null;

      // Load recent runs for this module's workflows
      if (mod) {
        const allRuns = await listRunLogs(50);
        const wfIds = new Set(mod.workflows.map(w => w.id));
        recentRuns = allRuns.filter(r => wfIds.has(r.workflow_id)).slice(0, 10);
      }
    } catch (e) {
      console.error("Failed to load module:", e);
    } finally {
      isLoading = false;
    }
  }

  async function handleRun(workflowId: string) {
    try {
      const result = await runWorkflow(workflowId, {});
      navigateToExecution(workflowId, result.run_id);
    } catch (e) {
      showToast(`Failed to run: ${e}`, "error");
    }
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
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

  onMount(() => { loadData(); });
</script>

<div class="module-detail-view">
  <header>
    <button class="back-btn" onclick={navigateBack}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <line x1="19" y1="12" x2="5" y2="12"></line>
        <polyline points="12 19 5 12 12 5"></polyline>
      </svg>
      Back to Dashboard
    </button>
    {#if mod}
      <div class="header-title">
        <h1>{mod.displayName}</h1>
        <span class="header-domain">{$viewState.selectedSkillDomain}</span>
      </div>
    {/if}
  </header>

  <div class="content">
    {#if isLoading}
      <div class="loading">Loading module...</div>
    {:else if !mod}
      <div class="loading">Module not found</div>
    {:else}
      <!-- Skill Context -->
      {#if mod.hasSkillDoc}
        <section class="section">
          <h2>Skill Context</h2>
          <div class="context-card">
            <span class="context-file">_skill.md</span>
            <span class="context-desc">Selectors, data model, states, gotchas</span>
          </div>
        </section>
      {/if}

      <!-- Workflows -->
      <section class="section">
        <h2>Workflows ({mod.workflows.length})</h2>
        <div class="list-card">
          {#each mod.workflows as wf (wf.id)}
            <div class="list-row">
              <div class="row-info">
                <span class="row-id">{wf.id}</span>
                <span class="row-title">{wf.title}</span>
              </div>
              <button class="run-btn" onclick={() => handleRun(wf.id)}>▶ Run</button>
            </div>
          {/each}
        </div>
      </section>

      <!-- Roles -->
      {#if mod.hasRoles.length > 0}
        <section class="section">
          <h2>Roles</h2>
          <div class="list-card">
            {#each mod.hasRoles as role}
              <div class="list-row">
                <span class="row-title">{role}.md</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Recent Runs -->
      {#if recentRuns.length > 0}
        <section class="section">
          <h2>Recent Runs</h2>
          <div class="list-card">
            {#each recentRuns as run (run.id)}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div class="list-row clickable" role="button" tabindex="0" onclick={() => navigateToRunLogDetail(run.id)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateToRunLogDetail(run.id); } }}>
                <div class="row-info">
                  <span class="status-icon" class:success={run.status === 'success'} class:failed={run.status === 'failed'}>
                    {run.status === 'success' ? '✓' : run.status === 'failed' ? '✗' : '—'}
                  </span>
                  <span class="row-title">{run.workflow_id}</span>
                </div>
                <div class="row-meta">
                  <span>{formatTimeAgo(run.timestamp)}</span>
                  <span>{formatDuration(run.duration_ms)}</span>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </div>
</div>

<style>
  .module-detail-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
  }

  header {
    padding: 16px 24px;
    background: var(--color-card);
    border-bottom: 1px solid var(--color-border);
  }

  .back-btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 4px 0; border: none;
    background: transparent; cursor: pointer; font-size: 13px; color: var(--color-text-secondary);
    margin-bottom: 8px;
  }
  .back-btn:hover { color: var(--color-primary); }

  .header-title { display: flex; align-items: baseline; gap: 12px; }
  .header-title h1 { margin: 0; font-size: 24px; font-weight: 600; color: var(--color-text); }
  .header-domain { font-size: 14px; color: var(--color-text-secondary); }

  .content { flex: 1; padding: 24px; overflow-y: auto; }

  .loading { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--color-text-secondary); }

  .section { margin-bottom: 24px; }
  .section h2 {
    margin: 0 0 12px; font-size: 12px; font-weight: 600;
    color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px;
  }

  .context-card {
    padding: 12px 16px; background: var(--color-card); border: 1px solid var(--color-border);
    border-radius: var(--radius-lg); display: flex; gap: 12px; align-items: center;
  }
  .context-file { font-size: 13px; font-weight: 600; color: var(--color-text); font-family: monospace; }
  .context-desc { font-size: 13px; color: var(--color-text-secondary); }

  .list-card {
    background: var(--color-card); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .list-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-bottom: 1px solid var(--color-border);
  }
  .list-row:last-child { border-bottom: none; }
  .list-row.clickable { cursor: pointer; }
  .list-row.clickable:hover { background: var(--color-surface); }

  .row-info { display: flex; align-items: center; gap: 10px; }
  .row-id { font-size: 12px; color: var(--color-text-muted); font-family: monospace; min-width: 120px; }
  .row-title { font-size: 14px; color: var(--color-text); }

  .row-meta { display: flex; gap: 16px; font-size: 12px; color: var(--color-text-muted); }

  .status-icon { font-weight: 700; font-size: 14px; }
  .status-icon.success { color: var(--color-success); }
  .status-icon.failed { color: var(--color-error); }

  .run-btn {
    padding: 4px 12px; font-size: 12px; font-weight: 500; border: 1px solid var(--color-border);
    border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text);
    cursor: pointer; transition: all var(--transition-fast);
  }
  .run-btn:hover { background: var(--color-primary); color: white; border-color: var(--color-primary); }

  @media (max-width: 768px) {
    header {
      flex-wrap: wrap;
      padding: 14px 16px;
      gap: 8px;
    }

    .content {
      padding: 16px;
    }

    .row-info {
      flex-wrap: wrap;
    }

    .row-meta {
      flex-wrap: wrap;
      gap: 8px;
    }
  }
</style>
