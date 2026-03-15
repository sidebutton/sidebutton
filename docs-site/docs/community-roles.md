# Community Roles

SideButton ships with reusable **role templates** that teach AI agents specific job functions. Roles inject behavioral context into every LLM call — they define *when* and *why* an agent should act, not just *how*.

## How Roles Work

A role is a markdown file with YAML frontmatter. When enabled, its content is injected into every LLM call as system context — giving the AI agent a specific perspective, priorities, and domain expertise.

Roles work with any knowledge pack. A QA role + a CRM knowledge pack = an agent that knows how to test CRM features. A Sales role + a LinkedIn knowledge pack = an agent that knows how to do outreach.

## Available Roles

| Role | Match Tags | Description |
|------|-----------|-------------|
| **Software Engineer** | `@engineering`, `@dev` | Writing, reviewing, and shipping production code. Picks up tickets, implements features, creates PRs, and runs tests. Enabled by default. |
| **QA Engineer** | `@qa`, `@testing` | Testing, verifying, and logging issues. Navigates the real app in a browser — clicking buttons, filling forms, and verifying features work as expected. |
| **Product Manager** | `@product`, `@pm` | Defining what to build, why, and in what order. Manages backlogs, writes specs, and prioritizes work. |
| **Skill Discovery** | `@sd` | Explores web apps via browser, documents modules and selectors, and generates knowledge packs that other roles consume. |
| **HR & People Ops** | `@hr` | Managing onboarding, benefits, compliance, and people operations. |
| **Sales** | `@sales`, `@outreach` | Building relationships and closing deals through personalized outreach. |

Additional built-in roles: Social Media Manager (`@social`), DevOps (`@devops`), Support (`@support`), Research (`@research`), Marketing (`@marketing`), Finance (`@finance`), Recruiting (`@recruiting`), Operations (`@operations`).

## Enabling Roles

Only the **Software Engineer** role is enabled by default. Enable additional roles in the dashboard under **Settings > AI Context > Roles**, or by editing the role file's frontmatter:

```yaml
---
name: QA Engineer
match:
  - "@qa"
  - "@testing"
enabled: true   # Change from false to true
---
```

## Using Roles with Knowledge Packs

Roles and knowledge packs are complementary:

- **Roles** teach the agent *what job to do* (test, build, sell, discover)
- **Knowledge packs** teach the agent *how a specific app works* (selectors, navigation, data model)

Together, they give AI agents enough context to work autonomously with real web applications.

## Role Files in the Repository

Default role templates are located at [`packages/server/defaults/roles/`](https://github.com/sidebutton/sidebutton/tree/main/packages/server/defaults/roles) in the OSS repository.

Knowledge packs can also include domain-specific roles in their `_roles/` directories. These are loaded automatically when the knowledge pack is installed.
