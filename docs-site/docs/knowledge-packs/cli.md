# Knowledge Packs CLI Reference

All commands for installing, managing, and searching knowledge packs.

## Install Commands

### sidebutton install

Install a knowledge pack from a local path, git URL, or registry.

```bash
# From a local directory
sidebutton install ./my-app.example.com

# From a git repository
sidebutton install https://github.com/org/skill-packs

# By domain name (searches configured registries)
sidebutton install my-app.example.com

# Force overwrite existing version
sidebutton install ./my-app.example.com --force
```

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing pack even if version differs |
| `--list` | List installed packs instead of installing |

**What happens:**
1. Reads `skill-pack.json` from the source
2. Checks for version conflicts (fails if a different version is installed without `--force`)
3. Copies all pack files to `~/.sidebutton/skills/<domain>/`
4. Records installation metadata

---

### sidebutton install --list

List all currently installed knowledge packs.

```bash
sidebutton install --list
```

**Example output:**

```
Installed knowledge packs:

  my-app.example.com
    Name:      myorg/app
    Version:   1.0.0
    Title:     My App Automation
    Installed: 2026-02-13
    Source:    /Users/me/skills/my-app.example.com
```

---

### sidebutton uninstall

Remove an installed knowledge pack by domain.

```bash
sidebutton uninstall my-app.example.com
```

**What happens:**
1. Removes all files from `~/.sidebutton/skills/<domain>/`
2. Removes installation record

---

## Registry Commands

### sidebutton registry add

Add a knowledge pack registry and install all its packs.

```bash
# Local directory
sidebutton registry add /path/to/registry

# Git repository
sidebutton registry add https://github.com/org/skill-packs

# With custom name
sidebutton registry add /path/to/registry --name my-team

# Specify type explicitly
sidebutton registry add /path/to/registry --type local
```

| Option | Description |
|--------|-------------|
| `--name <name>` | Custom registry name (defaults to directory/repo name) |
| `--type <local\|git>` | Registry type (auto-detected if omitted) |

**What happens:**
1. Validates the registry has an `index.json`
2. Saves registry configuration
3. Installs all packs listed in `index.json`

---

### sidebutton registry remove

Remove a registry and uninstall all packs that came from it.

```bash
sidebutton registry remove my-team
```

**What happens:**
1. Uninstalls all packs tagged with this registry
2. Removes registry configuration

---

### sidebutton registry list

List all configured registries.

```bash
sidebutton registry list
```

**Example output:**

```
Configured registries:

  my-team (local)
    URL:   /path/to/registry
    Packs: 3

  community (git)
    URL:   https://github.com/org/skill-packs
    Packs: 5
```

---

### sidebutton registry update

Pull latest changes and re-install modified packs.

```bash
# Update all registries
sidebutton registry update

# Update a specific registry
sidebutton registry update my-team
```

**What happens:**
1. For git registries: pulls latest changes
2. For local registries: re-reads directory
3. Re-installs packs whose versions have changed

---

## Search

### sidebutton search

Search available packs across all configured registries.

```bash
# List all available packs
sidebutton search

# Filter by keyword
sidebutton search jira
```

**Example output:**

```
Available knowledge packs:

  myorg/app — My App Automation (my-app.example.com)
    v1.0.0 | browser | Installed

  myorg/crm — CRM Workflows (crm.example.com)
    v2.1.0 | browser, llm | Not installed
```

## Creator Commands

Commands for scaffolding, validating, and publishing knowledge packs.

### sidebutton init

Scaffold a new knowledge pack directory with templates.

```bash
sidebutton init my-app.example.com
```

**What happens:**
1. Creates a directory named `my-app.example.com`
2. Generates `skill-pack.json` with name derived from the domain (e.g. `my-app.example.com` → name `example`)
3. Generates `_skill.md` with section templates (Overview, Navigation, Authentication, Data Model, Common Tasks, Selectors, States & Indicators, Gotchas, API)
4. Creates `_roles/qa.md` with a QA test playbook template

**Example output:**

```
  SideButton

  ✓ Knowledge pack scaffolded: my-app.example.com

  Created:
    my-app.example.com/skill-pack.json
    my-app.example.com/_skill.md
    my-app.example.com/_roles/qa.md

  Next steps:
    1. Edit _skill.md with domain knowledge
    2. Edit _roles/qa.md with test playbook
    3. Run sidebutton validate my-app.example.com to check
    4. Run sidebutton publish my-app.example.com --registry <path> to publish
```

---

### sidebutton validate

Lint a knowledge pack's structure. Reports errors and warnings.

```bash
# Validate a specific pack directory
sidebutton validate ./my-app.example.com

# Validate current directory
sidebutton validate
```

**Checks performed:**
1. Valid `skill-pack.json` manifest (file exists, JSON parses, required fields present)
2. `_skill.md` exists at pack root
3. All `*.yaml` / `*.yml` files parse correctly (recursive)
4. `_roles/` directory exists (warning if missing)

**Exit code:** `1` if errors found, `0` if valid.

**Example output (passing):**

```
  SideButton

  Validating: /path/to/my-app.example.com

  ✓ Valid knowledge pack
```

**Example output (errors):**

```
  SideButton

  Validating: /path/to/my-app.example.com

  ✗ Missing _skill.md — every knowledge pack needs a root skill file.
  ! No _roles/ directory — role playbooks recommended.
```

---

### sidebutton publish

Publish a knowledge pack to a registry directory. Operates in two modes.

**Copy mode** — validate a source pack and copy it into a registry:

```bash
sidebutton publish ./my-app.example.com --registry /path/to/registry

# Preview without writing
sidebutton publish ./my-app.example.com --registry /path/to/registry --dry-run
```

**In-place mode** — scan an existing registry, validate all packs, and regenerate `index.json`:

```bash
sidebutton publish --registry /path/to/registry

# Preview without writing
sidebutton publish --registry /path/to/registry --dry-run
```

| Option | Description |
|--------|-------------|
| `--registry <path>` | Target registry directory (required) |
| `--dry-run` | Preview changes without writing files |

**What happens (copy mode):**
1. Validates the source pack (aborts on errors)
2. Copies the pack into the registry under `<domain>/`
3. Regenerates `index.json` from all packs in the registry
4. Auto-commits if the registry is a git repo

**What happens (in-place mode):**
1. Scans all subdirectories that contain `skill-pack.json`
2. Validates each pack
3. Regenerates `index.json`
4. Auto-commits if the registry is a git repo

**Example output (copy mode):**

```
  SideButton

  ✓ Published my-app.example.com@1.0.0 to my-registry
```

**Example output (in-place mode):**

```
  SideButton

  ✓ Reindexed 3 packs in my-registry
```

**Example output (dry-run):**

```
  SideButton

  [dry-run] Would publish my-app.example.com@1.0.0 to my-registry
  [dry-run] Would copy /path/to/source → /path/to/registry/my-app.example.com
  [dry-run] Would regenerate index.json
```

---

## Summary

| Command | Description |
|---------|-------------|
| `sidebutton install <source>` | Install a knowledge pack |
| `sidebutton install --list` | List installed packs |
| `sidebutton uninstall <domain>` | Remove a knowledge pack |
| `sidebutton registry add <url>` | Add registry and install its packs |
| `sidebutton registry remove <name>` | Remove registry and its packs |
| `sidebutton registry list` | List configured registries |
| `sidebutton registry update [name]` | Sync and re-install changed packs |
| `sidebutton search [query]` | Search packs across registries |
| `sidebutton init <domain>` | Scaffold a new knowledge pack |
| `sidebutton validate [path]` | Lint pack structure |
| `sidebutton publish [source] --registry <path>` | Publish pack to registry |
