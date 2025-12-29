# Embed Buttons

Inject automation buttons directly into web pages — one-click actions right where you need them.

## What Are Embed Buttons?

Embed buttons are workflow triggers that appear on web pages:

- **TL;DR** button on Wikipedia articles
- **Summarize** button on news sites
- **Review PR** button on GitHub pull requests

When you click, the workflow runs immediately with context from the page.

## Basic Configuration

Add an `embed` section to your workflow:

```yaml
id: tldr_article
title: "TL;DR"

embed:
  selector: "article header"    # Where to put the button
  position: append              # Before or after the element
  label: "TL;DR"               # Button text

steps:
  - type: browser.extract
    selector: "article"
    as: content

  - type: llm.generate
    prompt: "TL;DR: {{content}}"
    as: summary
```

## Embed Options

### selector (required)

CSS selector for the target element:

```yaml
embed:
  selector: ".article-title"     # Class
  selector: "#header"            # ID
  selector: "article h1"         # Descendant
  selector: "[data-section]"     # Attribute
```

### position

Where to inject relative to the selector:

| Position | Result |
|----------|--------|
| `prepend` | Inside element, at start |
| `append` | Inside element, at end |
| `before` | Before the element |
| `after` | After the element |

```yaml
embed:
  selector: ".actions"
  position: prepend  # Button appears first inside .actions
```

### when (optional)

Only show button when this selector exists:

```yaml
embed:
  selector: ".actions"
  when: ".article-content"  # Only on article pages
```

### label

Button text:

```yaml
embed:
  label: "Summarize"
  label: "Draft Reply"
  label: "Review"
```

## Extracting Page Data

Use `extract` to pull data from the page when the button is clicked:

```yaml
embed:
  selector: ".pr-header"
  extract:
    pr_number:
      selector: ".pr-number"
      attribute: "textContent"

    author:
      selector: ".author-link"
      attribute: "href"
```

### Extract Options

| Option | Description |
|--------|-------------|
| `selector` | CSS selector (or `"self"` for target element) |
| `attribute` | What to extract (`textContent`, `href`, `data-*`, etc.) |
| `pattern` | Regex with capture group |

### Using Patterns

Extract specific parts with regex:

```yaml
extract:
  pr_number:
    selector: ".pr-link"
    attribute: "textContent"
    pattern: "#(\\d+)"  # Captures just the number
```

Input: `"PR #123 - Fix bug"`
Result: `"123"`

## Mapping to Parameters

Use `param_map` to connect extracted values to workflow params:

```yaml
params:
  org: string
  repo: string
  issue: string

embed:
  extract:
    issue_num:
      selector: ".issue-number"
      attribute: "textContent"
      pattern: "#(\\d+)"

  param_map:
    _path.0: "org"       # From URL path
    _path.1: "repo"      # From URL path
    issue_num: "issue"   # From extraction
```

## Magic Context Keys

These are automatically available in `param_map`:

| Key | Example Value | Description |
|-----|---------------|-------------|
| `_url` | `https://github.com/org/repo/issues/42` | Full URL |
| `_domain` | `github.com` | Hostname |
| `_pathname` | `/org/repo/issues/42` | Path |
| `_title` | `Issue #42 · org/repo` | Page title |
| `_path` | `["org", "repo", "issues", "42"]` | Path segments |
| `_path.0` | `org` | First segment |
| `_path.1` | `repo` | Second segment |
| `_path.2` | `issues` | Third segment |
| `_path.3` | `42` | Fourth segment |

## Parent Filtering

Only show button for specific elements:

```yaml
embed:
  selector: ".action-button-container"
  parent_filter:
    selector: ".issue-row"
    match:
      attribute: "textContent"
      contains: "Open"  # Only for open issues
```

## Domain Restrictions

Combine with `policies` to limit where the button appears:

```yaml
policies:
  allowed_domains:
    - github.com
    - "*.github.com"

embed:
  selector: ".pr-header"
  when: ".pull-request"
```

## Complete Examples

### Wikipedia TL;DR

```yaml
id: wikipedia_tldr
title: "Wikipedia TL;DR"

policies:
  allowed_domains:
    - "*.wikipedia.org"

embed:
  selector: "#firstHeading"
  position: after
  when: "#mw-content-text"
  label: "TL;DR"

steps:
  - type: browser.extract
    selector: "#mw-content-text .mw-parser-output > p"
    as: content

  - type: llm.generate
    prompt: "TL;DR in 2-3 sentences: {{content}}"
    as: summary

  - type: control.stop
    message: "{{summary}}"
```

### GitHub PR Review

```yaml
id: github_pr_review
title: "AI Review PR"

params:
  org: string
  repo: string
  pr_number: string

policies:
  allowed_domains:
    - github.com

embed:
  selector: ".gh-header-actions"
  position: prepend
  when: "[data-hpc]"  # PR page indicator
  label: "AI Review"

  extract:
    pr_num:
      selector: ".gh-header-number"
      attribute: "textContent"
      pattern: "#(\\d+)"

  param_map:
    _path.0: "org"
    _path.1: "repo"
    pr_num: "pr_number"

steps:
  - type: browser.navigate
    url: "https://github.com/{{org}}/{{repo}}/pull/{{pr_number}}/files"

  - type: browser.wait
    selector: ".file"
    timeout: 10000

  - type: browser.extractAll
    selector: ".blob-code"
    as: code_changes

  - type: llm.generate
    prompt: |
      Review this PR code:
      {{code_changes}}

      Focus on:
      - Potential bugs
      - Code style
      - Performance issues
    as: review

  - type: control.stop
    message: "{{review}}"
```

### News Article Summary

```yaml
id: news_summary
title: "Summarize Article"

embed:
  selector: "article h1, .article-headline"
  position: after
  when: "article, .article-content"
  label: "Summary"

steps:
  - type: browser.extract
    selector: "article, .article-body"
    as: article

  - type: llm.generate
    prompt: |
      Summarize this news article:
      {{article}}

      Format:
      - Headline (1 line)
      - Key points (3 bullets)
      - Why it matters (1 line)
    as: summary

  - type: control.stop
    message: "{{summary}}"
```

## Troubleshooting

### Button doesn't appear

1. Check `selector` matches an element on the page
2. Verify `when` condition (if set) is satisfied
3. Check `policies.allowed_domains` includes the site
4. Refresh the page after saving workflow changes

### Button appears in wrong place

Adjust `selector` and `position`:

```yaml
# Try different positions
position: prepend  # Inside, at start
position: append   # Inside, at end
position: before   # Outside, before
position: after    # Outside, after
```

### Extraction returns empty

1. Check selector in browser DevTools
2. Verify element exists when button is clicked
3. Check `attribute` is correct (`textContent` vs `innerText` vs `href`)

### Pattern doesn't match

Test your regex:

```javascript
// In browser console
"PR #123".match(/#(\d+)/)[1]  // Should return "123"
```

## Styling

Embed buttons use SideButton's default styling. The button will have:
- Distinct appearance (purple/accent color)
- Hover states
- Loading indicator when running

Custom styling is not yet supported.

## Next Steps

- **[Recording Mode](/features/recording)** — Create workflows by clicking
- **[Workflow Examples](/workflows/examples)** — More embed examples
- **[DSL Reference](/workflows/dsl)** — Full embed options
