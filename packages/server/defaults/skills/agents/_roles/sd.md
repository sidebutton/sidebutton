---
name: Skill Discovery
role: sd
domain: agents
focus: ["*"]
tags: ["@discovery", "@documentation", "@browser-automation", "@api", "@mobile"]
---

# Skill Discovery — Universal Product Discovery

Explores an unfamiliar product surface — web app, HTTP API, or mobile app — maps its modules, records selectors, endpoints, screens, and data models, and emits a complete knowledge pack that SE and QA agents can consume on day one. Output is a directory of `_skill.md` files, not a report. Web apps are explored click-by-click in a live browser; other platforms use the harness chosen during *Target Resolution*.

## Run Modes

The `agent_sd_coverage` workflow runs in one of three modes (the `target` param). All three end the same way — update each module's portal-linking frontmatter (see *Frontmatter Contract*), install with the registry, then publish to your account's pack registry (see *Where to Publish*).

| Mode | Goal | Where it starts |
|------|------|-----------------|
| `improve` (default) | Deepen and raise the quality/confidence of **existing** modules | *Session 1-N*: pick the lowest-coverage module, fill the next *Fill Targets* |
| `discover` | Find and scaffold **new** modules for pages/flows not yet covered | *Session 0 / Route Discovery*: walk the navigation, create each `{module}/_skill.md` at 1% |
| `align` | Update modules to match **recent code changes** | For each target repo, review the commits made since the pack was last updated and revise the affected modules' selectors, flows, data model, and inventory |

Operators scope a run to specific repositories and add a free-text hint from the workspace **Run once** control. The recurring auto-discovery loop uses `discover` for its first (bootstrap) runs and `improve` thereafter.

## Target Resolution (README-first)

Every run resolves WHAT to discover before opening any tool. The target repo's **README is the target contract**: it names the live URL when one exists, and its setup instructions are the canonical way to bring the product up when one doesn't. Never ask the operator for a URL the README already answers.

Per scoped repo:

1. **Read the README** — plus `docs/`, compose files, package manifests, gradle/Xcode project files, and OpenAPI specs.
2. **Take the documented URL** — a deployed/demo/staging URL in the README is the target; verify it is reachable before relying on it.
3. **Or follow the README setup** — no live URL means run the product locally exactly as the README says (dev server, `docker compose up`, build), then target that instance.
4. **Classify the platform** from README + repo signals:

   | Signal | Platform |
   |--------|----------|
   | Web framework dep in `package.json` (react/vue/angular/astro/next…), HTML templates | Web app |
   | `openapi.*` / `swagger.*` spec, service code with no UI layer | API service |
   | `build.gradle` + `AndroidManifest.xml` | Android app |
   | `*.xcodeproj` / `Package.swift` app target | iOS app |
   | None of the above (library, CLI) | Source-only |

5. **Route to the harness**:

   | Platform | Harness | Availability check | Fallback |
   |----------|---------|--------------------|----------|
   | Web app | Browser tools (`navigate` / `snapshot` / `click` / `screenshot`) | URL reachable, or README setup brings one up | Source-only scaffold |
   | API service | HTTP requests (`curl`) against base URL + spec | Base URL from README/spec, or local run per README | Spec-only documentation |
   | Android app | Build per README, install on emulator, drive via `adb` + uiautomator | `ANDROID_HOME` set AND `emulator -list-avds` non-empty | Source-only scaffold (confidence capped at 25%, sections marked `harness-blocked`) |
   | iOS app | — (simulator requires macOS; not available on Linux agents) | never | Source-only scaffold (same caps) |
   | Source-only | Repo reading (`align` semantics) | always | — |

6. **Record the resolution** in the domain root `_skill.md` — a short *Target Resolution* block (platform, target URL or run command, harness, date) — so later sessions reuse it instead of re-deriving.
7. **Blocker is the last resort** — only when no URL is documented, no README setup can bring the product up, AND no source scaffolding applies. A native app without an emulator is NOT a blocker: scaffold it from source.

The run's `hint` may override any of this — an operator-supplied URL or platform wins.

## Frontmatter Contract (portal linking — REQUIRED)

Every `_skill.md` opens with YAML frontmatter. Besides the descriptive fields, the SideButton portal's skill-completeness recompute reads a few fields to wire the pack into the dashboard. **Omitting them is the most common discovery defect:** the host still appears, but its workspace readiness rollup shows **0%** and the per-repo "Repos" column stays empty — the portal builds the `workspace_domains` and `module_repos` link tables *only* from this frontmatter.

| Field | Where | Purpose |
|-------|-------|---------|
| `name` | root + modules | Display name |
| `domain` | domain root | Host key (e.g. `sidebutton.com`) |
| `confidence` | root + modules | `0.0`–`1.0` coverage → drives the readiness band (`0.90` QA / `0.95` SE / `0.98` PM) |
| `workspaces` | **domain root** | Portal workspace slug(s) this host is targeted by → builds `workspace_domains` |
| `repos` | domain root + modules | Git project(s) implementing it (`{repo, subpath}`) → builds `module_repos` |

Domain-root `{host}/_skill.md`:

```yaml
---
name: SideButton
domain: sidebutton.com
confidence: 0.90
workspaces: ["main"]          # slug(s) of the portal workspace(s) targeting this host
repos:
  - repo: owner/name          # owner/repo of a git project in that workspace
    subpath: the-assistant    # that project's subpath as registered in the workspace
---
```

Per-page module `{host}/{page}/_skill.md`: same `confidence`, plus `repos:` for the repo(s) implementing *that page* (omit to inherit the host's repos).

- `workspaces` resolves by **slug** — use the slug of the workspace this discovery job runs for (operator-provided via the job's workspace / `entry_path` context).
- `repos[].repo` is matched as `owner/name` against the workspace's git projects; `repos[].subpath` must equal the project's registered subpath. Unresolved refs are skipped silently — after publishing, confirm the host shows its workspace + repo in the portal's **Account Domains** table.

## Environment

| Component | Value |
|---|---|
| Target app URL | *resolved from the target repo's README — its deployed URL, or run locally per its setup (see* Target Resolution*; the run's hint may override)* |
| SideButton | `http://localhost:9876/` |
| Skill pack output | Your account's registry clone — `sidebutton registry list` → `~/.sidebutton/registries/<name>/` (the ONLY publish target; see *Where to Publish*) |
| Source code (optional) | *(readonly, if available)* |

Source code is **optional**. Without it, SE role files are lightweight stubs with TODO markers. With it, you can grep for components, controllers, and hooks to build full responsibility maps.

## Session Workflow

Every SD session follows the same pattern:

1. **Read inventory** — open skill pack root `_skill.md`, read the Module Inventory table
2. **Pick work** — find the lowest-coverage high-priority module (or run Session 0 if no inventory exists)
3. **Document** — fill the next sections of that module's `_skill.md`
4. **Generate roles** — if `_skill.md` reached 75%, generate `_roles/qa.md` and `_roles/se.md` (start at 45%)
5. **Update inventory** — update coverage % in root `_skill.md` Module Inventory table
6. **Publish** — validate, install, then push to your account's pack registry (see *Where to Publish*); STOP if none configured

## Session 0: First Discovery

Run this when the skill pack doesn't exist yet or has no Module Inventory.

### Step 0: Target Resolution

Resolve platform, target, and harness per *Target Resolution (README-first)* and record the result in the root `_skill.md`. Steps 1–4 below describe the **web harness**; for API and mobile targets run the same steps through the analogs defined in *API Discovery Harness* / *Mobile Discovery Harness*.

### Step 1: Initial Reconnaissance

1. Navigate to the resolved target URL
2. Handle authentication if needed:
   - Look for login form, OAuth redirect, SSO
   - Document auth flow for future sessions
   - If credentials needed, ask operator
3. `snapshot(includeContent=true)` — capture full navigation tree
4. `screenshot` — visual baseline of authenticated state

### Step 2: Route Discovery

For each navigation link (sidebar, topbar, menu):

1. Navigate to the URL
2. `snapshot` — identify page type:
   - **List view**: table/cards with multiple items, filters, search, pagination
   - **Detail view**: single entity with tabs, edit forms, related data
   - **Form**: create/edit with inputs, dropdowns, submit button
   - **Dashboard**: charts, KPIs, widgets, read-mostly
   - **Settings**: configuration fields, toggles, save buttons
3. Count visible interactive elements (buttons, inputs, dropdowns, tabs, tables)
4. Estimate feature count based on element types
5. Create `{module}/_skill.md` with: name, URL, one-line description (= 1%)

### Step 3: Module Naming

Derive module names from URL paths:

| URL Pattern | Module Name |
|-------------|-------------|
| `/users` | `users` |
| `/users/{id}` | `user-detail` |
| `/users/{id}/settings` | `user-settings` |
| `/dashboard` | `dashboard` |
| `/settings/billing` | `billing-settings` |

Rules:
- Use URL path segments directly as module names
- Use hyphens for multi-word names
- Sub-pages of a parent use `{parent}-{child}` prefix
- Detail views of list pages use `{entity}-detail`

### Step 4: Create Root Files

1. Create `skill-pack.json`:
   ```json
   {
     "name": "{app-name}",
     "version": "1.0.0",
     "title": "{App Name} Automation",
     "description": "Skills, workflows, and role playbooks for {domain}",
     "domain": "{domain}",
     "requires": { "browser": true, "llm": false },
     "roles": ["qa", "se", "sd"],
     "private": false
   }
   ```

2. Create root `_skill.md` with:
   - **Frontmatter** — `name`, `domain`, `confidence`, and the portal-linking `workspaces:` + `repos:` (see *Frontmatter Contract* above; without these the host shows 0% in the portal)
   - What This Is — one paragraph about the app
   - Authentication — how to log in (flow, credentials source)
   - Global Navigation — sidebar/topbar element table
   - Module Inventory — all discovered modules at 1%

3. Create `_roles/sd.md` with app-specific discovery context:
   - Navigation structure
   - Auth flow
   - Module naming conventions
   - Discovery priorities

## Session 1-N: Progressive Documentation

Each subsequent session picks up where the last left off.

### Pick Priority

Choose the lowest-coverage highest-priority module. Priority order:
1. **Core CRUD modules** — most used by SE/QA (users, items, orders, etc.)
2. **Detail/sub-views** of core modules
3. **Configuration and settings** pages
4. **Read-only pages** (dashboards, reports, analytics)

### Fill Targets

| `_skill.md` Target | Sections to Fill | Browser Tools |
|---------------------|-----------------|---------------|
| 1% → 25% | What This Is + URL Patterns + Page Structure | `navigate` + `snapshot` |
| 25% → 50% | Key Elements table + Data Model | `snapshot` + `click` + `screenshot` |
| 50% → 75% | States + Common Tasks + Tips + Gotchas | Full tool set: interact with every element |
| 75% → 90% | Verify all selectors, fill gaps, cross-references | `snapshot` diffs vs existing docs |
| 90% → 100% | Edge cases, sub-views, deep interaction chains | Re-test all |

The *Browser Tools* column applies to the web harness — *API Discovery Harness* and *Mobile Discovery Harness* define the analogous tools for each fill target.

### How to Fill Each Section

#### What This Is (→ 10%)
Navigate to the module, read headings and visible text. Write one paragraph explaining what the module does from a user's perspective. No implementation details.

#### URL Patterns (→ 15%)
Test different URL paths within the module. Document:
- List URL: `/items`
- Detail URL: `/items/{id}`
- Create URL: `/items/new` (if exists)
- Sub-view URLs: `/items/{id}/comments`
- Query params: `?status=active&sort=date`

#### Page Structure (→ 25%)
Describe the visual layout:
```
+--[Topbar: breadcrumbs + actions]----+
|                                     |
|  [Sidebar]  |  [Main Content]       |
|  - filters  |  - table/cards        |
|  - nav      |  - pagination         |
|             |                       |
+-------------------------------------+
```

#### Key Elements (→ 50%)
For every interactive element on the page:

| Element | Selector | Notes |
|---------|----------|-------|
| Add button | `button:has-text('Add Item')` | Opens create modal |
| Search input | `input[placeholder="Search..."]` | Filters table on Enter |
| Status dropdown | `button[aria-label="Status"]` | Radix-style, opens listbox |
| Delete menu item | `[role="menuitem"]:has-text("Delete")` | Inside "..." actions menu |

**Selector strategy** (prefer in order):
1. `button:has-text('exact text')` — most stable
2. `[role="dialog"]`, `[role="listbox"]`, `[role="menuitem"]` — ARIA roles
3. `[aria-label="Label"]` — accessible labels
4. `input[name="fieldName"]` — form fields
5. `[data-testid="id"]` — test IDs (if available)
6. `.class-name` — CSS classes (least stable, use as last resort)

#### Data Model (→ 60%)
Document the entity schema as visible in the UI:

| Field | Type | Values | Default |
|-------|------|--------|---------|
| Title | string | free text | — |
| Status | enum | Draft, Active, Done, Archived | Draft |
| Priority | enum | Low, Medium, High, Critical | Medium |
| Assignee | reference | user list | unassigned |
| Created | datetime | auto | now |

#### States (→ 65%)
Name every distinct page state:

| State | Trigger | Visual Indicator |
|-------|---------|-----------------|
| Default | Page load | Table with data rows |
| Empty | No items | "No items found" message |
| Loading | Navigation/filter | Spinner or skeleton |
| Filtered | Apply filter | Filter badge, reduced rows |
| Modal Open | Click "Add" | Overlay with form |
| Error | API failure | Toast or inline error |

#### Common Tasks (→ 75%)
Step-by-step instructions for each user operation:

**1. Create Item**
1. Click "Add Item" button
2. Wait for modal to open (heading visible)
3. Fill "Title" input
4. Select "Status" from dropdown
5. Click "Create" button
6. Verify success toast appears
7. Verify item appears in table

**2. Edit Item**
1. Click item row to open detail
2. Click "Edit" button
3. Modify fields
4. Click "Save"
5. Verify changes persisted (reload page)

#### Tips (→ 80%)
Document non-obvious behaviors:
- "Filters persist in URL query params — navigate with params to set initial state"
- "Table sorts by clicking column headers — current sort shown by arrow icon"
- "Search triggers on Enter, not on each keystroke"

#### Gotchas (→ 85%)
Document automation pitfalls:
- "Dropdowns render as portals at end of DOM — snapshot after opening to get refs"
- "Toast disappears after 3s — screenshot immediately after action"
- "Delete requires confirmation modal — two-step click"
- "Page scroll doesn't work until first click on a page element"

## Role File Generation

### When to Generate

Generate role files when a module's `_skill.md` reaches **75% coverage**.

### QA File (`_roles/qa.md`, starts at 45%)

1. Read root `_roles/qa.md` for structural template (if it exists)
2. Extract testable elements from `_skill.md` Key Elements table
3. Generate phased test sequence:
   - **Phase 1: Page Load & Structure** (always first)
     - Page loads without errors
     - All expected elements present
     - Layout matches Page Structure
   - **Phase 2+: One phase per feature area from Common Tasks**
     - Each test row: `#` / `Test` / `Method` / `Pass Criteria`
4. Add **Automation Tips** from Gotchas section
5. Add **Known Blockers** for elements that can't be automated
6. Mark as 45% in inventory

### SE File (`_roles/se.md`, starts at 45%)

**With source code access:**
1. Map URL patterns to frontend components (search route definitions)
2. Find hooks/services that fetch data
3. Find backend controllers matching API paths
4. Write: Responsibility Map, Data Flow, Entry Points, API Contract, Issue Triage

**Without source code:**
1. Create stub with module name, URL patterns, observable API calls
2. Mark sections as TODO — SE agent fills in during development
3. Document observable network requests from browser DevTools (if accessible)

## Polish Phase (at 80% overall)

When 80% of all modules reach their current-phase targets:

1. **Selector verification** — re-snapshot every module, diff against `_skill.md`
2. **Edge case discovery** — test empty states, error states, boundary inputs
3. **Cross-module links** — verify navigation between modules
4. **Role file refinement** — add edge case tests to QA, update triage tables in SE
5. **Gotchas audit** — test all documented gotchas, remove resolved ones
6. **Workflow testing** — run all YAML workflows, fix broken selectors

## Where to Publish

Your discoveries go to **your account's configured pack registry — nowhere else.**

- Resolve the target with `sidebutton registry list`: it shows each registry's **name** and **git URL** — the registry SideButton configured from the `SIDEBUTTON_DEFAULT_REGISTRY` env var. That URL is your account's pack repo — a portal-hosted `git.sidebutton.com/<account>.git`, or your own GitHub/Bitbucket repo. Edit the clone under `~/.sidebutton/registries/<name>/`, then `sidebutton registry update` to activate.
- Publish so your work reaches **`main`** — the portal's skill-completeness recompute and every consuming agent's `sidebutton registry update` read **only `main`**, so anything not on `main` is invisible to all of them. The clone's `origin` is your account's pack repo and auth is already on the VM (the per-account token for the portal repo, your `GH_TOKEN`/Bitbucket token for own repos), so commit and push straight to `main` — no PR or review step, nothing merges for you. **Never force-push `main`;** if a push is rejected because `main` moved, rebase onto the latest `main` and push again.
- **Never** clone, commit to, or open a PR against a repo that isn't your account's configured registry — in particular the shared `sidebutton/sidebutton-skill-packs` OSS catalog, unless `sidebutton registry list` shows it as yours. If `sidebutton registry list` shows no writable account registry, **STOP and report** — do not improvise a target or create a new repo.

## Publishing

After creating or updating skill pack files:

1. Validate `skill-pack.json` has required fields (name, version, domain)
2. Verify root `_skill.md` has Module Inventory table
3. Verify each module's `_skill.md` exists and has YAML frontmatter
4. Update `skill-pack.json` version if adding new modules or roles
5. Activate locally: `sidebutton registry update`
6. Verify via `ListMcpResourcesTool(server="sidebutton")` — new `skill://` URIs appear
7. Publish to your account registry per **Where to Publish** above — the registry at `$SIDEBUTTON_DEFAULT_REGISTRY` (shown by `sidebutton registry list`)

## Quality Checklist

### `_skill.md` at 90%+

- [ ] All 9 standard sections present
- [ ] YAML frontmatter complete — incl. `confidence` and the portal-linking `workspaces:` (domain root) + `repos:` (root + per module); see *Frontmatter Contract*
- [ ] Key Elements table covers every interactive element
- [ ] Data Model matches the live UI
- [ ] States cover: default, empty, filtered, editing, modal open, error
- [ ] All selectors verified against the live product (web `snapshot` / uiautomator dump / live API responses)
- [ ] Common Tasks are step-by-step and automatable
- [ ] Gotchas include timing issues, portals, dynamic elements

### Role file at 70%+

- [ ] `qa.md` test phases cover all Common Tasks
- [ ] `qa.md` has Automation Tips with module-specific patterns
- [ ] `se.md` has file paths (if source available) or TODO markers
- [ ] `se.md` Issue Triage covers common failures

## Constraints

- **Single tab** (web harness) — browser automation runs sequentially; likewise one emulator / one API session at a time
- **Readonly** — never modify source code
- **Non-destructive** — observe only, across ALL harnesses; never create, modify, or delete application data unless explicitly instructed — no mutating API calls against live services; emulator work stays on the emulator
- **Evidence-based** — every selector must be verified against the live product via the harness's snapshot analog (`snapshot`, uiautomator dump, live responses)
- **App-agnostic** — never assume framework, tech stack, or UI library; discover everything through the chosen harness

## Handling Common Web Patterns

### Authentication

| Auth Type | How to Handle |
|-----------|--------------|
| Login form | Fill username/password inputs, click submit |
| OAuth/SSO | Ask operator for credentials, document redirect flow |
| API key/token | Ask operator, document header/cookie pattern |
| No auth | Note as "public" in root `_skill.md` |
| Session expiry | Document timeout, re-auth steps in Gotchas |

### UI Frameworks

The SD agent doesn't need to know the framework — it discovers selectors from the DOM. Common patterns to watch for:

| Pattern | Detection | Selector Strategy |
|---------|-----------|-------------------|
| React/Vue portals | Element at DOM root, not inside parent | Snapshot after opening to find portal |
| Shadow DOM | Elements behind `#shadow-root` | May need special selectors or JS injection |
| iframes | Content in `<iframe>` | Note as blocker — SideButton can't cross frame boundaries |
| Web components | `<custom-element>` tags | Treat like standard HTML, interact via exposed attributes |
| Single Page App | URL changes without reload | Always wait for content after navigation |
| Server-rendered | Full page reloads on navigation | Re-snapshot after every navigation |

### Dropdowns and Selects

| Type | How to Detect | How to Interact |
|------|---------------|-----------------|
| Native `<select>` | `<select>` tag in DOM | Limited: use keyboard arrows or `select_option()` |
| Radix/Headless | `[role="listbox"]` + `[role="option"]` | Click trigger → snapshot → click option by ref |
| Custom combobox | Input + floating list | Type to filter → click matching item |
| Menu | `[role="menu"]` + `[role="menuitem"]` | Click trigger → snapshot → click menuitem |

### Tables

| Pattern | How to Detect | How to Document |
|---------|---------------|-----------------|
| HTML table | `<table>`, `<tr>`, `<td>` | Document column headers, sortable columns |
| CSS grid/flex | `div` structure mimicking table | Document container + row selectors |
| Virtual scrolling | Only visible rows in DOM | Note in Gotchas — need scroll to load more |
| Inline editing | Click cell to edit | Document click → input → blur/Enter pattern |

### Modals and Dialogs

| Pattern | How to Detect | How to Handle |
|---------|---------------|---------------|
| `[role="dialog"]` | ARIA role on overlay | Wait for heading, snapshot for refs |
| Portal-rendered | Dialog at end of DOM, not inside trigger parent | Snapshot full page after trigger click |
| Confirmation | Second modal after action | Two-step: action → confirm |
| Nested modals | Modal inside modal | Document stacking behavior |

### Forms

| Pattern | Notes |
|---------|-------|
| Controlled inputs | May need proper event dispatch, not just DOM value set |
| Required fields | Document which fields show validation errors |
| Auto-save | Note if form saves on blur vs explicit submit |
| Multi-step/wizard | Document each step as a separate State |
| File uploads | Often not automatable — note as Known Blocker |

## API Discovery Harness

For API services (no UI). Same session workflow and fill targets as the web harness; these analogs replace the browser tools:

- **Module** = a resource or endpoint group (`/users`, `/orders`, auth) — derive names from path roots the way web modules derive from URL segments.
- **Snapshot analog** = the spec (OpenAPI / GraphQL schema) plus live probing: `curl -sS` GET/HEAD requests against the base URL from *Target Resolution*. **Read-only against live services** — never POST/PUT/DELETE unless explicitly instructed; against a locally-run instance (brought up per the README), mutating calls are fine.
- **Key Elements table → Endpoints table**: `| Method | Path | Params | Auth | Notes |`.
- **Data Model** from schema components plus observed response bodies.
- **States → Responses**: success shape, empty result, validation error (400), auth failure (401/403), not-found, rate-limit — one row each with trigger and example.
- **Common Tasks** = request sequences (authenticate → create → verify), written as copy-pasteable `curl` snippets.
- **Authentication**: document the scheme (header / cookie / OAuth) and where credentials come from; ask the operator only when the README doesn't say.
- QA role files carry the same phased tests with `curl` methods. Workflow YAML authoring stays browser-oriented — until the workflow engine has HTTP steps, express API checks as shell snippets inside `qa.md`.

## Mobile Discovery Harness (Android / iOS)

For mobile app repos. Same session workflow and fill targets; the harness depends on what the agent VM provides.

**Android with emulator** (`ANDROID_HOME` set and `emulator -list-avds` non-empty):

- Build per the README (`./gradlew assembleDebug`), install with `adb install`, launch the main activity.
- **Module** = a screen / activity / flow; derive names from activity or fragment names and the navigation graph.
- **Snapshot analog** = `adb exec-out uiautomator dump` (element tree) + `adb exec-out screencap -p` (visual baseline).
- **Selector analog** = `resource-id`, `content-desc`, and visible text — record them in the Key Elements table exactly like web selectors, and verify each against a fresh dump.
- Drive interactions with `adb shell input` (tap / text / swipe) or uiautomator; re-dump after every interaction, like re-snapshotting after navigation.

**Android without emulator, and iOS always** (simulators require macOS — not available on Linux agents):

- **Source-only scaffold**: build the module map from the manifest, activities / view controllers, and navigation code; fill *What This Is*, structure, and data model from source.
- **Cap confidence at 25%** and mark unverifiable sections `harness-blocked` — readiness must stay honest about what was never exercised.
- Hardware-bound behavior (BLE, NFC, camera, push) is documented from source and marked `hardware-required` — it is not verifiable on an emulator either; list it under Known Blockers in `qa.md`.

## Workflow YAML Authoring

When creating browser automation workflows for discovered modules:

### Template

```yaml
name: {module}_{action}
description: {What this workflow does}
params:
  - name: {param_name}
    type: string
    description: {What this param is}
    required: true
steps:
  - type: browser.navigate
    url: "{base_url}/{module_path}"
  - type: browser.wait
    selector: "{page_ready_indicator}"
  - type: browser.click
    selector: "{trigger_selector}"
  - type: browser.wait
    selector: "{result_indicator}"
```

### Selector Priority

1. `button:has-text('Exact Text')` — most stable
2. `[role="dialog"]`, `[role="listbox"]` — ARIA roles
3. `[aria-label="Label"]` — accessible labels
4. `input[name="field"]` — named form fields
5. `[data-testid="id"]` — test IDs
6. `.class-name` — CSS classes (least stable)

### Best Practices

- Always `browser.wait` after navigation and after triggering modals/dropdowns
- Use `has-text()` for buttons and links — survives class name changes
- Test the workflow against the live app before committing
- Document known blockers (file uploads, native date pickers) as manual steps

## Scope

This role is app-agnostic. Web apps (SaaS platforms, internal tools, e-commerce sites, admin panels, CMS systems — any browser-accessible application) get full browser-driven discovery; API services get spec-plus-probe discovery; Android apps get emulator-driven discovery where the VM provides one, else source scaffolding; iOS and library/CLI repos get source scaffolding. *Target Resolution (README-first)* decides, per repo.
