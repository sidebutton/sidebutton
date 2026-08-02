---
name: Fleet Operations
domain: agents
parent: agents
path: /ops
tags: ["@ops", "@fleet", "@dispatch", "@workflows"]
confidence: 0.9
---

# Fleet Operations

Operational workflows for autonomous agent fleets: repo management, environment updates, QA validation, SE implementation, PM epic analysis and breakdown, SD coverage improvement, experiment scoring, public data collection.

## Evidence Publishing

Workflows that produce evidence — screenshots, logs, mocks, diagrams, datasets, reports — save each file and **publish it during the session** via the `publish_artifact` tool (an agent-local sidebutton-server tool; SCRUM-1606). The tool uploads the file, attaches it to the job's ticket, and returns a `download_url`: a tokenized, no-login, revocable link. The agent cites that link **inline in its single resolution comment**, so one comment carries both the outcome and its evidence — no separate "📎" attachment comment is posted for agent-initiated publishes.

- **Fallback**: if `publish_artifact` is unavailable (e.g. an older sidebutton build without the tool), save each file under `~/workspace/artifacts/` — the Stop hook uploads leftovers after the session for post-run collection. The convention degrades gracefully; agents never block on the tool.
- **By role**: QA workflows (`agent_qa_validate` / `_new_ticket` / `_regression` / `_followup`) publish evidence unconditionally. SE workflows (`agent_se_rca` / `_rca_fix` / `_work`) publish only when they produced a mock, diagram, screenshot, or report — their primary deliverable is a PR. `agent_pm_research` may publish charts/datasets/reports alongside its cited sources.
- **Verdict-gate safety**: the pipeline string-matches the resolution comment for verdict tokens and forbidden tokens (`pass`/`fail`/`merged`/`blocked`/`conflict`). A `download_url` is inert to that gate — the share token is random hex and cannot spell a verdict word — so citing links never disturbs verdict parsing. Keep the QA `PASS`/`FAIL` token intact and last, keep evidence **filenames** free of verdict words, and note that `agent_experiment_score` (which forbids those tokens outright) does not publish and is excluded from this convention.

## Gate-Verdict Vocabulary (`metadata.verdicts`)

A workflow that ends in a machine-matchable outcome declares it in its YAML — `metadata.verdicts: [TOKEN, …]` (UPPER_SNAKE). The portal syncs the declaration with the workflow and uses it as the playbook gate vocabulary (PLAYBOOKS.md §5): a playbook step running the workflow can content-route on those tokens, matched from the step's single resolution comment. Undeclared ⇒ the step is presence-gated (any comment advances; text never inspected).

| Workflow | Declared verdicts |
|---|---|
| `agent_qa_new_ticket` | `BUG_CONFIRMED` · `NO_BUG` |
| `agent_qa_validate` | `PASS` · `FAIL` |
| `agent_qa_followup` | `PASS` · `FAIL` |
| `agent_qa_regression` | `PASS` · `FAIL` |
| `agent_se_work` | `PR_OPEN` · `WORK_CONTINUE` (step continuation — NOT-DONE handoff, token-only) · `BLOCKED` (token-only) |
| `agent_se_rca_fix` | `PR_OPEN` · `BLOCKED` (token-only) |
| `agent_se_review_merge` | `MERGED` · `CONFLICT` · `CI_FAIL` |
| `agent_pm_goal_analysis` | `READY_TO_PLAN` · `NEEDS_DECISIONS` · `NO_CHANGE` |
| `agent_pm_breakdown` | `ISSUES_CREATED` · `ISSUES_RECONCILED` |
| `agent_ops_validate_resolution` | `VALIDATED` · `INCOMPLETE` · `UNVERIFIABLE` |

Free-form workflows (`agent_se_rca`, `agent_se_plan`, `agent_se_followup`, `agent_pm_research`, `agent_sentry_triage`, `agent_sd_coverage`, `agent_pull_repos`) deliberately declare nothing. `agent_experiment_score` must NEVER declare a vocabulary — its comment is parsed as JSON and its prompt forbids verdict-looking tokens outright. The reserved engine-synthesized verdicts (`COMMENT_POSTED`, `JOB_COMPLETED`, `JOB_FAILED`, `JOB_CANCELLED`) are refused at sync and must not be declared.

## Experiment Scoring

`agent_experiment_score` is the A/B experiment judge: after a forked playbook step finishes both branches, the engine dispatches it with `ticket_url`, `branch_a_ref`, `branch_b_ref` (each ref is a PR URL, or an instruction pointing at the branch's `[exp A]`/`[exp B]` ticket comment). It is read-only except for its single output — ONE ticket comment holding a short comparison summary plus one fenced `json` block with per-branch scores (coverage/correctness/quality/overall, 0–100), a recommended winner (`"A"`/`"B"`), and a rationale. The engine parses that comment into the experiment ledger; the operator makes the pick. Quality only — cost/turns/model come from job telemetry, and the judge's own model/effort are pinned engine-side for cross-experiment comparability.

## Collection Workflow

`agent_collect_source` collects structured data from any public URL. It's a two-step workflow:

1. **Claude** loads platform skill packs, navigates to the source, extracts items, saves JSON to `/tmp/collect_result.json`
2. **curl** POSTs the file to the `callback_url` with agent auth headers, then cleans up

### Output Contract

```json
{
  "collect_result": {
    "source_url": "https://...",
    "platform": "truthsocial|x|whitehouse|reddit|...",
    "captured_at": "ISO8601",
    "items": [
      {
        "external_id": "post-123",
        "event_type": "post|article|executive_order|statement",
        "published_at": "ISO8601",
        "title": "...",
        "content": "Full text...",
        "url": "https://...",
        "engagement": {"likes": 100, "replies": 20}
      }
    ],
    "item_count": 5
  }
}
```

### Auth

The curl step sends:
- `Authorization: Bearer $SIDEBUTTON_AGENT_TOKEN` — standard agent token from `~/.agent-env`
- `X-Agent-Name: $SIDEBUTTON_AGENT_NAME` — agent identifier for tracing

The receiving API validates the token and records the agent name.
