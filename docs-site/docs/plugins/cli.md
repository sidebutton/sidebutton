# Plugin CLI Reference

Manage plugins from the command line.

## Commands

### List Plugins

```bash
sidebutton plugin list
```

Shows all installed plugins with their version, description, and tool names.

**Example output:**

```
  Installed Plugins

  screen-record v1.0.0
    Screen recording via ffmpeg x11grab
    Tools (3): start_recording, stop_recording, list_recordings

  writing-quality v1.0.0
    AI writing pattern detection and quality scoring
    Tools (1): check_writing_quality

  Plugins dir: ~/.sidebutton/plugins
```

### Install Plugin

```bash
sidebutton plugin install <path>
```

Install a plugin from a local directory. Copies the plugin into `~/.sidebutton/plugins/`.

| Parameter | Description |
|-----------|-------------|
| `<path>` | Path to the plugin directory (must contain `plugin.json`) |

**Example:**

```bash
# Install from a cloned repo
git clone https://github.com/sidebutton/plugin-screen-record.git
sidebutton plugin install plugin-screen-record

# Install from an absolute path
sidebutton plugin install /home/user/my-plugin
```

**Output:**

```
  ✓ Installed plugin: screen-record
  Tools: start_recording, stop_recording, list_recordings
```

The plugin validates before installation — if `plugin.json` is missing or invalid, the install fails with a diagnostic.

### Remove Plugin

```bash
sidebutton plugin remove <name>
```

Remove an installed plugin by name.

| Parameter | Description |
|-----------|-------------|
| `<name>` | Plugin name (from `plugin.json`, not directory name) |

**Example:**

```bash
sidebutton plugin remove screen-record
```

**Output:**

```
  ✓ Removed plugin: screen-record (3 tools)
```

## Summary

| Command | Description |
|---------|-------------|
| `sidebutton plugin list` | List installed plugins and tools |
| `sidebutton plugin install <path>` | Install from local directory |
| `sidebutton plugin remove <name>` | Remove by plugin name |

## Next Steps

- **[Creating Plugins](/plugins/creating)** — Build your own
- **[Available Plugins](/plugins/available)** — Official plugins
