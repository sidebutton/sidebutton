# LLM Integration

Use AI for text classification and generation within your workflows.

## Overview

SideButton integrates with OpenAI (and Anthropic) APIs to enable:

- **Classification** — Categorize text into predefined buckets
- **Generation** — Create text based on prompts

## Setup

### API Key

Set your OpenAI API key:

**Option 1: Environment Variable**
```bash
export OPENAI_API_KEY=sk-your-key-here
npx @sidebutton/server serve
```

**Option 2: Settings (Dashboard)**
1. Open [localhost:9876](http://localhost:9876)
2. Go to **Settings**
3. Add an env context:
   - Name: `OPENAI_API_KEY`
   - Value: `sk-your-key-here`

### Supported Providers

| Provider | Environment Variable | Status |
|----------|---------------------|--------|
| OpenAI | `OPENAI_API_KEY` | ✅ Supported |
| Anthropic | `ANTHROPIC_API_KEY` | ✅ Supported |

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

### "OpenAI API key not configured"

Set the `OPENAI_API_KEY` environment variable before starting the server.

### Rate limiting errors

- Add delays between LLM calls
- Use `control.retry` with exponential backoff
- Consider batching requests

### Unexpected output

- Check your prompt is clear
- Use few-shot examples
- Add output format instructions

### High latency

- Keep prompts concise
- Extract only needed content
- Cache results if appropriate

## API Usage & Costs

LLM steps make API calls that may incur costs:

| Step Type | Typical Usage |
|-----------|---------------|
| `llm.classify` | ~100-500 tokens |
| `llm.generate` | ~500-2000 tokens |

Monitor your API usage at [OpenAI Dashboard](https://platform.openai.com/usage).

## Next Steps

- **[Workflow Examples](/workflows/examples)** — More LLM workflow examples
- **[Step Types](/workflows/steps)** — All available steps
- **[User Contexts](#user-contexts)** — Customize AI behavior
