# Workflow Examples

Copy-paste these examples to get started quickly.

## Browser Automation

### Open a URL

```yaml
id: open_example
title: "Open Example Site"
steps:
  - type: browser.navigate
    url: "https://example.com"
```

### Extract Page Title

```yaml
id: get_title
title: "Get Page Title"
steps:
  - type: browser.extract
    selector: "title"
    as: page_title

  - type: control.stop
    message: "Title: {{page_title}}"
```

### Fill a Form

```yaml
id: fill_login
title: "Fill Login Form"
params:
  username: string
  password: string
steps:
  - type: browser.type
    selector: "input[name='username']"
    text: "{{username}}"

  - type: browser.type
    selector: "input[name='password']"
    text: "{{password}}"

  - type: browser.click
    selector: "button[type='submit']"
```

### Scroll and Extract List

```yaml
id: extract_list
title: "Extract List Items"
steps:
  - type: browser.scroll
    direction: down
    amount: 1000

  - type: browser.wait
    ms: 500

  - type: browser.extractAll
    selector: ".list-item"
    as: items

  - type: control.stop
    message: "Found: {{items}}"
```

## AI-Powered Workflows

### Summarize Current Page

```yaml
id: summarize_page
title: "Summarize Page"
steps:
  - type: browser.extract
    selector: "article, main, .content, body"
    as: content

  - type: llm.generate
    prompt: |
      Summarize this webpage content in 3 bullet points:

      {{content}}
    as: summary

  - type: control.stop
    message: "{{summary}}"
```

### Classify Email Priority

```yaml
id: classify_email
title: "Classify Email Priority"
params:
  email_content: string
steps:
  - type: llm.classify
    input: "{{email_content}}"
    categories:
      - urgent
      - important
      - normal
      - low
    as: priority

  - type: control.stop
    message: "Priority: {{priority}}"
```

### Draft Reply

```yaml
id: draft_reply
title: "Draft Reply to Message"
steps:
  - type: browser.extractAll
    selector: ".message"
    as: conversation

  - type: llm.generate
    prompt: |
      Draft a professional reply to this conversation:

      {{conversation}}

      Keep it concise and friendly.
    as: reply

  - type: browser.type
    selector: ".reply-input, textarea"
    text: "{{reply}}"
```

## Shell & System

### Git Status

```yaml
id: git_status
title: "Show Git Status"
params:
  repo_path: string
steps:
  - type: shell.run
    cmd: "cd {{repo_path}} && git status --short"
    as: status

  - type: control.stop
    message: "{{status}}"
```

### Open Project in Terminal

```yaml
id: open_terminal
title: "Open Terminal in Project"
params:
  project: string
steps:
  - type: terminal.open
    title: "{{project}}"
    cwd: "{{env.github_base_path}}/{{project}}"

  - type: terminal.run
    cmd: "git status"
```

### Run npm Script

```yaml
id: npm_dev
title: "Start Dev Server"
params:
  project: string
steps:
  - type: terminal.open
    cwd: "{{env.github_base_path}}/{{project}}"

  - type: terminal.run
    cmd: "npm run dev"
```

## Conditional Logic

### Check Before Action

```yaml
id: conditional_click
title: "Click If Available"
steps:
  - type: browser.exists
    selector: ".continue-button"
    as: can_continue

  - type: control.if
    condition: "{{can_continue}} == 'true'"
    then:
      - type: browser.click
        selector: ".continue-button"
    else_steps:
      - type: control.stop
        message: "Button not available"
```

### Retry Flaky Element

```yaml
id: retry_click
title: "Retry Click"
steps:
  - type: control.retry
    max_attempts: 3
    delay_ms: 1000
    steps:
      - type: browser.wait
        selector: ".dynamic-button"
        timeout: 5000

      - type: browser.click
        selector: ".dynamic-button"
```

## Composed Workflows

### Extract Then Process

```yaml
id: extract_and_analyze
title: "Extract and Analyze"
steps:
  # Call extraction workflow
  - type: workflow.call
    workflow: extract_article_content
    as: article

  # Call analysis workflow
  - type: workflow.call
    workflow: analyze_sentiment
    params:
      text: "{{article.content}}"
    as: analysis

  - type: control.stop
    message: "Sentiment: {{analysis.sentiment}}"
```

### Multi-Step Pipeline

```yaml
id: release_pipeline
title: "Release Pipeline"
params:
  org: string
  repo: string
steps:
  # Step 1: Get current version
  - type: workflow.call
    workflow: get_latest_release
    params:
      org: "{{org}}"
      repo: "{{repo}}"
    as: release

  # Step 2: Decide next version
  - type: llm.generate
    prompt: "Current version is {{release.tag}}. What should the next patch version be?"
    as: next_version

  # Step 3: Create release
  - type: workflow.call
    workflow: create_github_release
    params:
      org: "{{org}}"
      repo: "{{repo}}"
      tag: "{{next_version}}"
```

## Embed Button Examples

### TL;DR Button for Articles

```yaml
id: tldr_button
title: "TL;DR"
embed:
  selector: "article header, .article-header"
  position: append
  label: "TL;DR"
steps:
  - type: browser.extract
    selector: "article"
    as: content

  - type: llm.generate
    prompt: "TL;DR in 2-3 sentences: {{content}}"
    as: summary

  - type: control.stop
    message: "{{summary}}"
```

### GitHub PR Review Button

```yaml
id: pr_review
title: "Review PR"
embed:
  selector: ".gh-header-actions"
  position: prepend
  when: ".pull-request"
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
params:
  org: string
  repo: string
  pr_number: string
policies:
  allowed_domains:
    - github.com
steps:
  - type: browser.navigate
    url: "https://github.com/{{org}}/{{repo}}/pull/{{pr_number}}/files"

  - type: browser.wait
    selector: ".file"

  - type: browser.extractAll
    selector: ".blob-code-addition"
    as: additions

  - type: llm.generate
    prompt: |
      Review these code changes:
      {{additions}}
    as: review

  - type: control.stop
    message: "{{review}}"
```

## Complete Real-World Example

### Wikipedia Research Assistant

```yaml
id: wiki_research
title: "Wikipedia Research"
description: "Search Wikipedia and summarize findings"
params:
  topic: string
steps:
  # Navigate to Wikipedia
  - type: browser.navigate
    url: "https://en.wikipedia.org/wiki/{{topic}}"

  # Wait for content
  - type: browser.wait
    selector: "#firstHeading"
    timeout: 10000

  # Check if page exists
  - type: browser.exists
    selector: ".noarticletext"
    as: not_found

  - type: control.if
    condition: "{{not_found}} == 'true'"
    then:
      - type: control.stop
        message: "No Wikipedia article found for '{{topic}}'"

  # Extract content
  - type: browser.extract
    selector: "#firstHeading"
    as: title

  - type: browser.extract
    selector: "#mw-content-text .mw-parser-output > p:not(.mw-empty-elt)"
    as: content

  - type: browser.extractAll
    selector: "#toc li a"
    as: sections

  # Generate summary
  - type: llm.generate
    prompt: |
      Summarize this Wikipedia article about "{{title}}":

      Content:
      {{content}}

      Sections covered:
      {{sections}}

      Provide a 3-paragraph summary suitable for someone unfamiliar with the topic.
    as: summary

  - type: control.stop
    message: |
      # {{title}}

      {{summary}}
```
