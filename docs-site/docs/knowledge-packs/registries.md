# Host Your Own Skill Pack Repository

This page is for teams and individuals who want to keep their domain knowledge **isolated from sidebutton.com** and serve it to agents directly from a private git repo or local directory.

If you instead want to publish a pack to the public SideButton registry, see [Publishing](/knowledge-packs/cli#creator-commands).

## Why host your own

- **Proprietary knowledge** — selectors, workflows, and role playbooks for internal tools that must not leave your perimeter
- **Compliance / audit** — your knowledge lives in a repo you own, with your review process, your retention, your access controls
- **Team discipline** — skill packs get PR review, versioning, and CI like any other code
- **Agent fleets on your terms** — every agent machine installs from the same git source of truth; `registry update` pulls the latest

Real-world shape: an enterprise team keeps a private `acme-skills` repo with packs for their admin panel, analytics tool, and internal customer-success workflows. Their QA, SE, and CSM agents all register that repo. sidebutton.com is never involved.

## What a custom registry looks like

A custom registry is a git repo (or a plain directory) with `index.json` at the root and one folder per pack:

```
acme-skills/
├── index.json              # Registry manifest
├── admin.acme.net/         # Pack for the admin panel
│   ├── skill-pack.json
│   ├── _skill.md
│   ├── _roles/
│   │   └── qa.md
│   ├── users/              # Module
│   │   ├── _skill.md
│   │   └── create_user.yaml
│   └── billing/
│       ├── _skill.md
│       └── refund.yaml
├── analytics.acme.net/
│   └── …
└── ops/                    # Non-domain pack (agent methodology)
    ├── skill-pack.json
    └── _skill.md
```

### `index.json` skeleton

```json
{
  "version": 1,
  "name": "Acme Skill Packs",
  "packs": []
}
```

The `packs` array is regenerated automatically every time you `sidebutton publish --registry .`, so you never need to hand-edit it after the first commit.

### Public vs. private packs

A pack with `"private": true` in its `skill-pack.json` and its `index.json` entry is marked as internal. The flag is independent of repo visibility — use it to signal intent to consumers (e.g., "don't suggest this pack in public listings"). Repo-level access still governs who can clone and install.

## Create the repository

A walkthrough for a fresh repo.

### 1. Scaffold

```bash
mkdir acme-skills && cd acme-skills
git init

# Seed index.json
cat > index.json <<'EOF'
{
  "version": 1,
  "name": "Acme Skill Packs",
  "packs": []
}
EOF

git add index.json && git commit -m "init acme-skills registry"
```

### 2. Add your first pack

```bash
# Scaffold a pack next to the registry
sidebutton init admin.acme.net

# Edit admin.acme.net/_skill.md and _roles/qa.md with real content,
# add any workflow YAML files, then:

sidebutton validate ./admin.acme.net
```

### 3. Publish into the registry

```bash
# Copy mode: validate the pack, copy it into the registry, regenerate index.json
sidebutton publish ./admin.acme.net --registry .
```

Because the registry is a git repo, `publish` auto-commits with a message like `publish: admin.acme.net@1.0.0`.

### 4. In-place editing

After you edit pack files directly inside the registry (the common case for a live team repo), regenerate the index without the `source` argument:

```bash
sidebutton publish --registry .
```

### 5. Push

```bash
git push origin main
```

Now any agent machine with read access can register the repo.

## Register the repository on your agents

Two modes: local directory for development, git URL for production.

### Local directory (development)

Point an agent at a working copy on disk:

```bash
sidebutton registry add /Users/you/code/acme-skills --name acme
```

Local registries are **read in place** — SideButton does not copy the folder. Editing a pack inside the working copy, then `sidebutton registry update acme`, reinstalls it to `~/.sidebutton/skills/<domain>/` immediately. Ideal for iterating.

### Git URL (production)

```bash
sidebutton registry add git@github.com:acme/acme-skills.git --name acme
```

The repo is cloned to `~/.sidebutton/registries/acme/` and every pack listed in `index.json` is installed.

Authentication uses the machine's existing git chain:

- **SSH URL** — uses `~/.ssh/` keys; add a GitHub deploy key or a machine user key on the agent
- **HTTPS URL** — uses your git credential helper or a PAT embedded in the URL

### Verify

```bash
sidebutton registry list
sidebutton install --list
```

## Running multiple registries

You can register as many registries as you want. Typical setups:

| Setup | Example |
|---|---|
| Single private | `acme` only |
| Private + public mirror | `acme` (internal) + `acme-public` (mirrored OSS packs you depend on) |
| Split by team | `acme-platform` + `acme-data` + `acme-ops` |

Each `sidebutton registry add` appends to `skill_registries` in `~/.sidebutton/settings.json`. When you `sidebutton install <domain>`, registries are searched in the order they were added; the first matching pack wins. `sidebutton search` lists packs from every registry with the registry name in brackets.

### Domain collisions

If two registries contain a pack with the same `domain`, only the first one registered is resolved by `install <domain>`. To pick a specific one, add from a local path directly:

```bash
sidebutton install /path/to/acme-skills/admin.acme.net --force
```

### The `enabled` flag

`sidebutton registry list` shows each registry as **enabled** or **disabled**. New registries are always added as enabled. There is currently no `registry enable|disable` CLI — to disable a registry without removing it, edit `~/.sidebutton/settings.json` and set `enabled: false` on the entry.

## Remove and re-add the SideButton registry

Registries are cheap: add, remove, add back. The default SideButton registry is just another entry you can manage like your own.

```bash
# Remove it entirely — teams that want fully isolated agents often do this
sidebutton registry remove sidebutton

# Re-add it later if you change your mind
sidebutton registry add <sidebutton-registry-url> --name sidebutton
```

`registry remove` uninstalls every pack tagged to that registry and deletes the cloned directory (if it was a git registry). Your own registries are untouched.

::: warning sidebutton.com remote fallback
Even with no SideButton registry configured, `sidebutton install <domain>` and `sidebutton search` will fall back to `https://sidebutton.com` to resolve unknown domains. There is no CLI flag to disable this fallback today. For fully air-gapped agents, prefer `sidebutton install <local-path>` and don't call `install <domain>` in your automation.
:::

## Daily operations

| Task | Command |
|---|---|
| Add a new pack | `sidebutton init <domain>` then `sidebutton publish ./<domain> --registry .` |
| Edit an existing pack | Commit the change, then `sidebutton publish --registry .` (in-place reindex) |
| Bump a pack version | Edit `skill-pack.json.version`, then republish |
| Remove a pack | Delete the folder, then `sidebutton publish --registry .` |
| Sync agents to latest | On each agent: `sidebutton registry update <name>` |

`registry update` runs `git pull` for git registries (or re-reads the directory for local registries) and then force-reinstalls every pack in the registry. Version bumps are the cleanest way to make this visible to operators.

## Single-pack repo variant

A repo can hold a single pack at the root — no `index.json`, just `skill-pack.json` + `_skill.md` + modules:

```
acme-csm-knowledge/
├── skill-pack.json
├── _skill.md
├── _roles/
│   └── csm.md
├── accounts/
│   └── _skill.md
└── renewals/
    └── _skill.md
```

This layout is simpler when you really do have one pack. Constraints:

- **Install locally:** `sidebutton install /path/to/acme-csm-knowledge` — works
- **Install from git URL:** `sidebutton install git@github.com:acme/acme-csm-knowledge.git` — does **not** work (the CLI only scans subdirectories for `skill-pack.json`)
- **Register as a registry:** `sidebutton registry add` — does **not** work (no `index.json`)
- **Workaround for remote:** clone manually, then `sidebutton install ./acme-csm-knowledge`

Prefer the multi-pack registry layout unless you're certain you'll only ever have one pack.

## Troubleshooting

**`No index.json found`**
You registered a pack folder as a registry. Either add an `index.json` at the root (and move the pack into a subfolder named after its domain), or install the pack directly: `sidebutton install <path>`.

**`Already installed (vX). Use --force to overwrite.`**
Bump `version` in the pack's `skill-pack.json` and republish, or re-run install with `--force`.

**Registry shows `disabled` in `sidebutton registry list`**
Flip `enabled: true` on the entry in `~/.sidebutton/settings.json`. There is no CLI for this today.

**`git pull` fails during `registry update`**
Check SSH keys or the git credential helper on the agent machine. For GitHub deploy keys, confirm the key has read access to the repo.

**Pack doesn't show up in `sidebutton install --list` after `registry update`**
Check that the pack appears in `index.json` (run `sidebutton publish --registry .` in the registry to regenerate it) and that its `domain` matches the folder name.

## Related

- **[CLI Reference](/knowledge-packs/cli)** — Full command reference for `install`, `registry`, `publish`
- **[Creating Packs](/knowledge-packs/creating)** — How to build a single pack's content (targets, roles, workflows)
- **[Overview](/knowledge-packs/overview)** — Pack and registry schemas
