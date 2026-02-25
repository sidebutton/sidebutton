<script lang="ts">
  import { onMount } from "svelte";
  import {
    fetchRegistries, fetchRegistryCatalog, installSkillPack as installPack,
    addRegistry as addReg, removeRegistry as removeReg, fetchSkillPacks,
  } from "../api";
  import type { CatalogPack } from "../api";
  import { skillPacks, publishers, showToast } from "../stores";
  import { navigateToSkills } from "../router";
  import type { Publisher, InstalledPack } from "../types";

  let isLoading = $state(true);
  let registries = $state<Publisher[]>([]);
  let selectedRegistry = $state<string>('');
  let catalogPacks = $state<CatalogPack[]>([]);
  let catalogName = $state('');
  let searchQuery = $state('');
  let isLoadingCatalog = $state(false);
  let showAddPublisher = $state(false);
  let newPublisherUrl = $state('');
  let newPublisherName = $state('');
  let installingDomain = $state<string | null>(null);

  async function loadData() {
    isLoading = true;
    try {
      const [regs, packs] = await Promise.all([
        fetchRegistries(),
        fetchSkillPacks(),
      ]);
      registries = regs;
      publishers.set(regs);
      skillPacks.set(packs);

      // Auto-select first registry
      if (regs.length > 0 && !selectedRegistry) {
        selectedRegistry = regs[0].name;
        await loadCatalog(regs[0].name);
      }
    } catch (e) {
      console.error("Failed to load registries:", e);
    } finally {
      isLoading = false;
    }
  }

  async function loadCatalog(name: string) {
    isLoadingCatalog = true;
    try {
      const result = await fetchRegistryCatalog(name);
      catalogPacks = result.packs;
      catalogName = result.name;
    } catch (e) {
      console.error("Failed to load catalog:", e);
      catalogPacks = [];
      showToast(`Failed to load catalog: ${e}`, "error");
    } finally {
      isLoadingCatalog = false;
    }
  }

  async function handleRegistryChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    selectedRegistry = target.value;
    await loadCatalog(target.value);
  }

  async function handleInstall(pack: CatalogPack) {
    installingDomain = pack.domain;
    try {
      await installPack(pack.path);
      showToast(`Installed ${pack.title || pack.name}`, "success");
      // Refresh catalog and installed packs
      await Promise.all([
        loadCatalog(selectedRegistry),
        fetchSkillPacks().then(p => skillPacks.set(p)),
      ]);
    } catch (e) {
      showToast(`Install failed: ${e}`, "error");
    } finally {
      installingDomain = null;
    }
  }

  async function handleAddPublisher() {
    if (!newPublisherUrl.trim()) return;
    try {
      await addReg(newPublisherUrl.trim(), newPublisherName.trim() || undefined);
      showToast("Publisher added", "success");
      newPublisherUrl = '';
      newPublisherName = '';
      showAddPublisher = false;
      await loadData();
    } catch (e) {
      showToast(`Failed to add publisher: ${e}`, "error");
    }
  }

  async function handleRemovePublisher(name: string) {
    if (!confirm(`Remove publisher "${name}"? This will also uninstall its packs.`)) return;
    try {
      await removeReg(name);
      showToast("Publisher removed", "success");
      if (selectedRegistry === name) selectedRegistry = '';
      await loadData();
    } catch (e) {
      showToast(`Failed to remove: ${e}`, "error");
    }
  }

  let filteredPacks = $derived.by(() => {
    if (!searchQuery.trim()) return catalogPacks;
    const q = searchQuery.toLowerCase();
    return catalogPacks.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.title.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.domain.toLowerCase().includes(q)
    );
  });

  let installedPacks = $derived(
    $skillPacks.filter(p => !catalogPacks.some(c => c.domain === p.domain))
  );

  onMount(() => { loadData(); });
</script>

<div class="library-view">
  <header>
    <h1>Library</h1>
    <button class="btn btn-ghost" onclick={() => loadData()} aria-label="Reload library">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <polyline points="23 4 23 10 17 10"></polyline>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
      </svg>
    </button>
  </header>

  <div class="content">
    {#if isLoading}
      <div class="loading">Loading library...</div>
    {:else}
      <!-- Publisher Selector -->
      {#if registries.length > 0}
        <div class="publisher-bar">
          <label>
            Publisher:
            <select value={selectedRegistry} onchange={handleRegistryChange}>
              {#each registries as reg}
                <option value={reg.name}>{reg.name} ({reg.packCount ?? 0} packs)</option>
              {/each}
            </select>
          </label>
          <div class="search-box">
            <input
              type="text"
              placeholder="Search skill packs..."
              bind:value={searchQuery}
            />
          </div>
        </div>
      {/if}

      <!-- Catalog -->
      {#if isLoadingCatalog}
        <div class="loading">Loading catalog...</div>
      {:else if filteredPacks.length > 0}
        <section class="section">
          <h2>Available Skill Packs</h2>
          <div class="pack-list">
            {#each filteredPacks as pack (pack.domain)}
              <div class="catalog-card">
                <div class="catalog-info">
                  <div class="catalog-header">
                    <span class="catalog-icon">📦</span>
                    <h3>{pack.title || pack.name}</h3>
                  </div>
                  <span class="catalog-meta">{pack.domain} · v{pack.version}</span>
                  {#if pack.description}
                    <p class="catalog-desc">{pack.description}</p>
                  {/if}
                </div>
                <div class="catalog-actions">
                  {#if pack.installed}
                    {#if pack.installedVersion !== pack.version}
                      <button class="btn btn-secondary btn-sm" onclick={() => handleInstall(pack)}
                        disabled={installingDomain === pack.domain}>
                        Update to v{pack.version}
                      </button>
                    {:else}
                      <span class="installed-badge">Installed</span>
                    {/if}
                    <button class="btn btn-ghost btn-sm" onclick={() => navigateToSkills()}>Manage</button>
                  {:else}
                    <button class="btn btn-primary btn-sm" onclick={() => handleInstall(pack)}
                      disabled={installingDomain === pack.domain}>
                      {installingDomain === pack.domain ? 'Installing...' : 'Install'}
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </section>
      {:else if registries.length > 0}
        <div class="empty-card">
          <p>No skill packs found{searchQuery ? ` matching "${searchQuery}"` : ' in this registry'}.</p>
        </div>
      {/if}

      <!-- Installed from other publishers -->
      {#if installedPacks.length > 0}
        <section class="section">
          <h2>Installed (Other Publishers)</h2>
          <div class="pack-list">
            {#each installedPacks as pack (pack.domain)}
              <div class="catalog-card">
                <div class="catalog-info">
                  <div class="catalog-header">
                    <span class="catalog-icon">📦</span>
                    <h3>{pack.title || pack.name}</h3>
                  </div>
                  <span class="catalog-meta">{pack.domain} · v{pack.version}</span>
                </div>
                <div class="catalog-actions">
                  <span class="installed-badge">Installed</span>
                  <button class="btn btn-ghost btn-sm" onclick={() => navigateToSkills()}>Manage</button>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Publishers section -->
      <section class="section publishers">
        <h2>Publishers</h2>
        <div class="publisher-list">
          {#each registries as reg (reg.name)}
            <div class="publisher-row">
              <div class="pub-info">
                <span class="pub-name">{reg.name}</span>
                <span class="pub-type">{reg.type}</span>
                <span class="pub-status">{reg.enabled ? 'Connected' : 'Disabled'}</span>
              </div>
              <button class="btn btn-ghost btn-sm" onclick={() => handleRemovePublisher(reg.name)}>Remove</button>
            </div>
          {/each}
          {#if !showAddPublisher}
            <button class="btn btn-secondary btn-sm add-pub-btn" onclick={() => showAddPublisher = true}>+ Add Publisher</button>
          {:else}
            <div class="add-pub-form">
              <input type="text" placeholder="Registry URL or path" bind:value={newPublisherUrl} />
              <input type="text" placeholder="Name (optional)" bind:value={newPublisherName} />
              <div class="add-pub-actions">
                <button class="btn btn-primary btn-sm" onclick={handleAddPublisher}>Add</button>
                <button class="btn btn-ghost btn-sm" onclick={() => showAddPublisher = false}>Cancel</button>
              </div>
            </div>
          {/if}
        </div>
      </section>

      {#if registries.length === 0}
        <div class="empty-card">
          <h3>No Publishers Connected</h3>
          <p>Add a skill pack registry to browse and install skill packs.</p>
          <button class="btn btn-primary" onclick={() => showAddPublisher = true}>+ Add Publisher</button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .library-view {
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

  .content { flex: 1; padding: 24px; overflow-y: auto; }

  .loading { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--color-text-secondary); }

  .publisher-bar {
    display: flex; gap: 16px; align-items: center; margin-bottom: 24px;
    padding: 12px 16px; background: var(--color-card); border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }
  .publisher-bar label { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--color-text); font-weight: 500; }
  .publisher-bar select {
    padding: 6px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md);
    font-size: 14px; background: var(--color-surface);
  }
  .search-box { flex: 1; }
  .search-box input {
    width: 100%; padding: 6px 12px; border: 1px solid var(--color-border);
    border-radius: var(--radius-md); font-size: 14px; background: var(--color-surface);
  }

  .section { margin-bottom: 24px; }
  .section h2 {
    margin: 0 0 12px; font-size: 12px; font-weight: 600;
    color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px;
  }

  .pack-list { display: flex; flex-direction: column; gap: 8px; }

  .catalog-card {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 20px; background: var(--color-card); border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .catalog-info { flex: 1; }
  .catalog-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .catalog-icon { font-size: 18px; }
  .catalog-header h3 { margin: 0; font-size: 16px; font-weight: 600; color: var(--color-text); }
  .catalog-meta { font-size: 13px; color: var(--color-text-secondary); }
  .catalog-desc { margin: 6px 0 0; font-size: 13px; color: var(--color-text-secondary); }

  .catalog-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }

  .installed-badge {
    font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px;
    background: var(--color-success-light); color: var(--color-success);
  }

  .publisher-list {
    background: var(--color-card); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
    overflow: hidden;
  }
  .publisher-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 16px; border-bottom: 1px solid var(--color-border);
  }
  .publisher-row:last-child { border-bottom: none; }
  .pub-info { display: flex; gap: 12px; align-items: center; }
  .pub-name { font-size: 14px; font-weight: 500; color: var(--color-text); }
  .pub-type { font-size: 12px; color: var(--color-text-muted); padding: 2px 6px; background: var(--color-surface); border-radius: 4px; }
  .pub-status { font-size: 12px; color: var(--color-success); }

  .add-pub-btn { margin: 12px 16px; }
  .add-pub-form { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
  .add-pub-form input {
    padding: 8px 12px; border: 1px solid var(--color-border);
    border-radius: var(--radius-md); font-size: 14px;
  }
  .add-pub-actions { display: flex; gap: 8px; }

  .empty-card {
    padding: 48px 24px; text-align: center; background: var(--color-card);
    border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  }
  .empty-card h3 { margin: 0 0 8px; font-size: 18px; font-weight: 600; color: var(--color-text); }
  .empty-card p { margin: 0 0 16px; font-size: 14px; color: var(--color-text-secondary); }

  .btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px;
    border: none; border-radius: var(--radius-md); cursor: pointer; font-size: 14px; font-weight: 500;
    transition: all var(--transition-fast);
  }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .btn-primary { background: var(--color-primary); color: white; }
  .btn-primary:hover:not(:disabled) { opacity: 0.9; }
  .btn-secondary { background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); }
  .btn-secondary:hover { background: var(--color-border); }
  .btn-ghost { background: transparent; color: var(--color-text-secondary); }
  .btn-ghost:hover { color: var(--color-text); background: var(--color-surface); }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
</style>
