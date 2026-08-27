---
docs_agent:
  sources:
    - pack: sidebutton.local
      module: workflow-engine
      version: 1.4.15
      verified: "2026-08-25"
  updated: "2026-08-25"
---

# LLM Integration

Use AI for text classification, generation, and decision-making within your workflows.

## Overview

SideButton's workflow engine ships three LLM steps, backed by your choice of provider:

- **Classification** (`llm.classify`) — Categorize text into predefined buckets
- **Generation** (`llm.generate`) — Create text based on prompts
- **Decision** (`llm.decide`) — Pick one action from a list, for branching workflows

## Setup

### Supported Providers

| Provider | Configuration | Notes |
|----------|---------------|-------|
| OpenAI | `OPENAI_API_KEY` | Default provider |
| Anthropic | `ANTHROPIC_API_KEY` | Claude models |
| Ollama | none — local | No API key. Defaults to `http://localhost:11434/api/generate` and model `llama2`; override both in the LLM settings |

### Configuration

The LLM configuration has four fields — `provider`, `model`, `api_key`, and `base_url` — settable in the dashboard or via environment:

**Option 1: Environment Variable**
```bash
export OPENAI_API_KEY=sk-your-key-here     # or ANTHROPIC_API_KEY for Anthropic
npx sidebutton
```

**Option 2: Settings (Dashboard)**
1. Open [localhost:9876](http://localhost:9876)
2. Go to **Settings**
3. Configure the LLM provider, model, and key (Ollama needs no key — just point `base_url` at your Ollama instance if it isn't on the default port)

## LLM Steps

### llm.classify

Categorize text into one of several categories:

```yaml
- type: llm.classify
  input: "{{email_content}}"
  categories:
    - urgent
    - important
    - normal
    - spam
  as: priority
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | string | Yes | Text to classify |
| `categories` | array | Yes | List of possible categories |
| `as` | string | Yes | Variable for result |

**Output:** One of the category strings (e.g., `"urgent"`)

**Use cases:**
- Email triage
- Support ticket routing
- Content moderation
- Lead qualification

### llm.generate

Generate text based on a prompt:

```yaml
- type: llm.generate
  prompt: |
    Summarize this article in 3 bullet points:

    {{article_content}}
  as: summary
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Prompt for the LLM |
| `as` | string | Yes | Variable for result |

**Output:** Generated text string

**Use cases:**
- Summarization
- Reply drafting
- Content creation
- Code explanation

### llm.decide

Choose one action from a list — the branching primitive for agent-style workflows:

```yaml
- type: llm.decide
  input: "{{ticket_content}}"
  actions:
    - id: escalate
      description: "Severe or customer-blocking — route to an engineer now"
    - id: reply
      description: "Answerable from documentation — draft a response"
    - id: archive
      description: "Spam or duplicate — close without action"
  as: next_action

- type: control.if
  condition: "{{next_action}} == 'escalate'"
  then:
    - type: issues.transition
      status: "Urgent"
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | string | Yes | The situation to decide on |
| `actions` | array | Yes | Available actions, each with an `id` and a `description` |
| `as` | string | Yes | Variable for the chosen action `id` |

**Output:** Exactly one of the action `id` strings.

The step is defensive about model output: if the reply is not exactly an action id, the closest id contained in the reply is used, and if nothing matches, the **first** action in the list is chosen — so order your actions with the safest default first.

**Use cases:**
- Ticket routing with different follow-up steps per outcome
- Choosing between reply / escalate / ignore in inbox automations
- Letting a role-scoped workflow pick its next move

## User Contexts

Customize AI behavior for specific workflows using LLM Contexts in Settings.

### Creating an LLM Context

1. Go to **Settings** → **User Contexts**
2. Click **Add Context**
3. Choose type: **LLM**
4. Fill in:
   - **Industry:** Match by category domain (e.g., Sales)
   - **Domain:** Match by allowed_domains (e.g., linkedin.com)
   - **Context:** Instructions for the AI

### Example Context

```
Industry: Sales
Domain: linkedin.com
Context: |
  You are a professional sales assistant.
  Keep responses concise and business-appropriate.
  Focus on building relationships, not hard selling.
  Never use emojis or overly casual language.
```

### How Contexts Are Applied

When an LLM step runs:
1. The system checks workflow's `category.domain` and `policies.allowed_domains`
2. Matching contexts are prepended to the prompt
3. The combined prompt is sent to the API

This applies to all three LLM steps — `llm.decide` includes the matched contexts ahead of its decision prompt.

## Examples

### Email Priority Classification

```yaml
id: classify_email
title: "Classify Email Priority"

steps:
  - type: browser.extract
    selector: ".email-body"
    as: email

  - type: llm.classify
    input: "{{email}}"
    categories:
      - urgent_action_needed
      - important_but_not_urgent
      - informational
      - spam_or_marketing
    as: priority

  - type: control.if
    condition: "{{priority}} == 'urgent_action_needed'"
    then:
      - type: browser.click
        selector: ".flag-important"
```

### Article Summarization

```yaml
id: summarize_article
title: "Summarize Article"

steps:
  - type: browser.extract
    selector: "article"
    as: content

  - type: llm.generate
    prompt: |
      Summarize this article:

      {{content}}

      Format your response as:
      - HEADLINE: (one line summary)
      - KEY POINTS: (3 bullet points)
      - TAKEAWAY: (one sentence)
    as: summary

  - type: control.stop
    message: "{{summary}}"
```

### Draft Reply with Context

```yaml
id: draft_linkedin_reply
title: "Draft LinkedIn Reply"

category:
  domain: sales

policies:
  allowed_domains:
    - "*.linkedin.com"

steps:
  - type: browser.extractAll
    selector: ".msg-s-message-group"
    as: conversation

  - type: llm.generate
    prompt: |
      Draft a reply to this LinkedIn conversation:

      {{conversation}}

      The reply should be professional and move the conversation forward.
    as: reply

  - type: browser.type
    selector: ".msg-form__contenteditable"
    text: "{{reply}}"
```

### Sentiment Analysis

```yaml
id: analyze_sentiment
title: "Analyze Sentiment"

steps:
  - type: browser.extractAll
    selector: ".review-text"
    as: reviews

  - type: llm.classify
    input: "{{reviews}}"
    categories:
      - very_positive
      - positive
      - neutral
      - negative
      - very_negative
    as: sentiment

  - type: control.stop
    message: "Overall sentiment: {{sentiment}}"
```

## Best Practices

### 1. Be Specific in Prompts

```yaml
# Bad - vague
prompt: "Write something about {{topic}}"

# Good - specific
prompt: |
  Write a 100-word summary of {{topic}}.
  Include:
  - Main definition
  - Key applications
  - One interesting fact
```

### 2. Use Categories Thoughtfully

```yaml
# Bad - overlapping categories
categories:
  - good
  - positive
  - great

# Good - distinct categories
categories:
  - positive
  - neutral
  - negative
```

### 3. Provide Context

```yaml
prompt: |
  You are analyzing customer support tickets.

  Ticket: {{ticket_content}}

  Classify the urgency and suggest a response.
```

### 4. Handle Failures Gracefully

```yaml
- type: control.retry
  max_attempts: 2
  delay_ms: 1000
  steps:
    - type: llm.generate
      prompt: "{{input}}"
      as: result
```

## Troubleshooting

### "API key not configured"

Set the provider's environment variable (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) before starting the server, or configure the key in Settings. Ollama needs no key — check the `base_url` instead.

### Rate limiting errors

- Add delays between LLM calls
- Use `control.retry` with exponential backoff
- Consider batching requests

### Unexpected output

- Check your prompt is clear
- Use few-shot examples
- Add output format instructions
- For `llm.decide`, remember the fallback order: exact id → closest match → first action

### High latency

- Keep prompts concise
- Extract only needed content
- Cache results if appropriate
- For Ollama, latency depends on your local hardware and model size

## API Usage & Costs

LLM steps make API calls that may incur costs (Ollama runs locally and is free):

| Step Type | Typical Usage |
|-----------|---------------|
| `llm.classify` | ~100-500 tokens |
| `llm.generate` | ~500-2000 tokens |
| `llm.decide` | ~100-500 tokens |

Token usage is tracked per run across all providers. Monitor provider-side usage in your provider's dashboard.

## Next Steps

- **[Workflow Examples](/workflows/examples)** — More LLM workflow examples
- **[Step Types](/workflows/steps)** — All available steps
- **[User Contexts](#user-contexts)** — Customize AI behavior
