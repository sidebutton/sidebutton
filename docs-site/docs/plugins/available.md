# Available Plugins

Official SideButton plugins maintained by the team.

## screen-record

Screen recording on Linux agent VMs via ffmpeg x11grab.

| | |
|---|---|
| **Repo** | [sidebutton/plugin-screen-record](https://github.com/sidebutton/plugin-screen-record) |
| **Tools** | `start_recording`, `stop_recording`, `list_recordings` |
| **Language** | Bash |
| **Requires** | Linux with X11, ffmpeg |

**Install:**

```bash
git clone https://github.com/sidebutton/plugin-screen-record.git
sidebutton plugin install plugin-screen-record
```

**Tools:**

| Tool | Description |
|------|-------------|
| `start_recording` | Start ffmpeg x11grab recording (1920x1080, 10fps, H.264). Optional `filename` parameter. |
| `stop_recording` | Stop active recording with graceful SIGINT shutdown. Returns file path and size. |
| `list_recordings` | List all MP4 files in `~/.sidebutton/recordings/` with sizes and timestamps. |

---

## writing-quality

AI writing pattern detection and 5-dimension quality scoring.

| | |
|---|---|
| **Repo** | [sidebutton/plugin-writing-quality](https://github.com/sidebutton/plugin-writing-quality) |
| **Tools** | `check_writing_quality` |
| **Language** | Node.js |
| **Requires** | `ANTHROPIC_API_KEY` env var (for LLM scoring mode) |

**Install:**

```bash
git clone --recurse-submodules https://github.com/sidebutton/plugin-writing-quality.git
sidebutton plugin install plugin-writing-quality
```

**Tools:**

| Tool | Description |
|------|-------------|
| `check_writing_quality` | Score content on 5 dimensions (Directness, Rhythm, Trust, Authenticity, Density) and detect AI writing patterns. Pass/fail at 35/50. |

**Modes:**

| Mode | Description |
|------|-------------|
| `full` | Deterministic patterns + LLM scoring (default) |
| `patterns-only` | Deterministic only, no LLM call |
| `score-only` | LLM scoring only |

**Pattern categories:** throat-clearing, emphasis crutches, business jargon, filler phrases, AI vocabulary, promotional words, sycophantic phrases, passive voice, em dashes, rule-of-three, binary contrast, metronomic rhythm, and more (29 patterns total).

---

## Community Plugins

Have a plugin to share? [Open a PR](https://github.com/sidebutton/sidebutton/pulls) to add it here, or publish your own repo following the `plugin-<name>` naming convention.

## Next Steps

- **[Creating Plugins](/plugins/creating)** — Build your own
- **[CLI Reference](/plugins/cli)** — Install and manage plugins
