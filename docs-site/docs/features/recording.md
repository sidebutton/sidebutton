# Recording Mode

Create workflows by clicking through tasks — no coding required.

## How It Works

1. **Start recording** — Click "New Recording" in the dashboard
2. **Perform actions** — Navigate, click, type in your browser
3. **Stop recording** — Actions are captured as workflow steps
4. **Export as YAML** — Save to your actions folder

## Starting a Recording

### From Dashboard

1. Open [localhost:9876](http://localhost:9876)
2. Click **"Recordings"** in the sidebar
3. Click **"New Recording"**
4. The extension will indicate recording is active

### Recording Status

When recording:
- Extension icon shows recording indicator
- Dashboard shows "Recording..." status
- All browser actions are captured

## Captured Events

| Event | What's Recorded |
|-------|-----------------|
| **Navigate** | URL visited |
| **Click** | Element clicked (multiple selector candidates) |
| **Type** | Input field and text entered |
| **Scroll** | Direction and position |
| **Key Press** | Keyboard key pressed |

## Selector Candidates

For each click/type action, multiple selector strategies are captured:

```yaml
selectors:
  - "role=button[name='Submit']"     # ARIA role
  - "text=Submit"                     # Text content
  - "css=button.btn-primary"          # CSS selector
  - "[data-testid='submit-btn']"      # Test ID
```

This gives you options when editing — choose the most stable selector for your use case.

## Stopping and Saving

### Stop Recording

1. Click **"Stop Recording"** in the dashboard
2. Or click the extension icon and select "Stop"

### Review Actions

After stopping, you'll see:
- List of captured actions
- Generated YAML preview
- Option to edit before saving

### Save as Workflow

1. Give your recording a name
2. Click **"Save as Workflow"**
3. The file is saved to `actions/` directory

## Editing Recordings

### Change Selectors

```yaml
# Original (may be fragile)
- type: browser.click
  selector: "div.sc-1234abcd > button:nth-child(2)"

# Better (more stable)
- type: browser.click
  selector: "button[data-testid='submit']"
```

### Add Wait Steps

```yaml
steps:
  - type: browser.click
    selector: ".load-more"

  # Add wait for dynamic content
  - type: browser.wait
    selector: ".new-items"
    timeout: 5000
```

### Add Parameters

```yaml
# Make it reusable
params:
  search_term: string

steps:
  - type: browser.type
    selector: "#search"
    text: "{{search_term}}"  # Was hardcoded
```

### Add LLM Steps

```yaml
steps:
  # ... extraction steps from recording

  # Add AI processing
  - type: llm.generate
    prompt: "Summarize: {{extracted_content}}"
    as: summary
```

## Best Practices

### 1. Keep Recordings Focused

Record one task at a time:
- ✅ "Search for product"
- ✅ "Add item to cart"
- ❌ "Complete entire checkout flow"

### 2. Use Stable Selectors

Prefer selectors in this order:
1. `data-testid` attributes
2. ARIA labels
3. Unique IDs
4. Text content
5. CSS classes (least stable)

### 3. Add Waits for Dynamic Content

If the page loads content dynamically, add explicit waits:

```yaml
- type: browser.wait
  selector: ".dynamic-content"
  timeout: 10000
```

### 4. Test After Recording

Always run the workflow to verify it works:
1. Save the recording
2. Navigate to a similar page
3. Run from dashboard
4. Check run log for errors

### 5. Parameterize Hardcoded Values

Replace specific values with parameters:

```yaml
# Before
- type: browser.navigate
  url: "https://example.com/product/12345"

# After
params:
  product_id: string
steps:
  - type: browser.navigate
    url: "https://example.com/product/{{product_id}}"
```

## Limitations

### What Can't Be Recorded

- Hover actions (may not trigger reliably)
- Drag and drop
- Complex gestures
- Actions in iframes (sometimes)

### Workarounds

For unsupported actions, manually add steps:

```yaml
# Add hover step manually
- type: browser.hover
  selector: ".dropdown-trigger"

- type: browser.wait
  ms: 500

- type: browser.click
  selector: ".dropdown-menu .option"
```

## Troubleshooting

### Recording doesn't start

1. Is the extension connected?
2. Is the server running?
3. Refresh the page and try again

### Actions not captured

Some pages block content scripts. Try:
1. Refresh the page
2. Reconnect the extension
3. Check if site has strict CSP

### Playback fails

Common issues:
- Selector changed (use more stable selector)
- Page structure different (add conditional logic)
- Timing issue (add wait steps)

## Next Steps

- **[Workflow DSL](/workflows/dsl)** — Edit recordings manually
- **[Step Types](/workflows/steps)** — Add more step types
- **[Embed Buttons](/features/embed)** — Inject buttons for your workflow
