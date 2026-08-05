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
| `agent_se_work` | `PR_OPEN` · `WORK_CONTINUE` (step continuation — NOT-DONE handoff, token-only) · `BLOCKED` |
| `agent_se_rca_fix` | `PR_OPEN` · `BLOCKED` |
| `agent_se_review_merge` | `MERGED` · `CONFLICT` · `CI_FAIL` |
| `agent_pm_goal_analysis` | `READY_TO_PLAN` · `NEEDS_DECISIONS` · `NO_CHANGE` |
| `agent_pm_breakdown` | `ISSUES_CREATED` · `ISSUES_RECONCILED` |
| `agent_ops_validate_resolution` | `VALIDATED` · `INCOMPLETE` · `UNVERIFIABLE` |

Free-form workflows (`agent_se_rca`, `agent_se_plan`, `agent_se_followup`, `agent_pm_research`, `agent_sentry_triage`, `agent_sd_coverage`, `agent_pull_repos`) deliberately declare nothing. `agent_experiment_score` must NEVER declare a vocabulary — its comment is parsed as JSON and its prompt forbids verdict-looking tokens outright. The reserved engine-synthesized verdicts (`COMMENT_POSTED`, `JOB_COMPLETED`, `JOB_FAILED`, `JOB_CANCELLED`) are refused at sync and must not be declared.

## Validation Verdict Comment Contract

`agent_ops_validate_resolution` is the one workflow whose comment **shape** — not just its verdict token — is consumed by the portal. Two portal surfaces read it, so the prompt states the order explicitly rather than leaving the judge to invent one (it previously did, and the portal parser was written against the shapes it happened to produce).

| Element | Order | Consumed by |
|---|:--:|---|
| `Validation verdict: <TOKEN>` | 1st line | `matchValidationVerdict` — the token must appear nowhere else |
| Evidence lines (outcome → PR/commit/file) | 2nd | Operator read; the peek-rail validation panel renders the comment verbatim |
| `Notes:` — reported, non-verdict-bearing items | 3rd | Operator read only |
| `Gaps:` heading + numbered list, **last** | 4th | `extractValidationGap` — sliced heading-to-end into the re-run steering hint |

Three constraints follow, and all three are load-bearing:

- **The gap list must come last and nothing may follow it.** The slice runs from the heading to the end of the comment, so any closing paragraph ("Net: …", "Bottom line: …") is carried into every re-run's prompt.
- **`Notes:` must precede `Gaps:`**, for the same reason — a Notes section after the heading would steer re-runs by exactly the items that are defined not to be gaps. No other line may begin with the word "gap" either: the heading match takes the FIRST line that opens with gap/gaps, and with no heading at all the fallback keeps the comment's tail.
- **The comment carries no date.** The verdict's timestamp is stamped portal-side when the sweep reads the comment (`task_evaluations.created_at`) and displayed as the flag's age in the Tasks "needs you" band, where it is also the oldest-first ordering key. A self-stated date is redundant there and can disagree with the stamp.

**The verdict judges delivery, not tracker hygiene.** Unfiled follow-ups, stale description text on a re-scoped ticket, operator-accepted deferrals and in-thread findings owned by other tickets go under `Notes:` — they are not gaps. The portal's own gap routing already assumes this: `deriveGapClass` biases every deps-resolved flag to `verify` (confirmation-only) precisely because over-calling a flag triggers wasteful re-implementation runs.

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
