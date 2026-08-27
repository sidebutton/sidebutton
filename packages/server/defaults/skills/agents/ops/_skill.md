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
- **By role**: QA workflows (`agent_qa_validate` / `_new_ticket` / `_regression` / `_followup`) publish evidence unconditionally, as does `agent_docs_verify` (build output, walked-page screenshots, scan output). SE workflows (`agent_se_rca` / `_rca_fix` / `_work`) publish only when they produced a mock, diagram, screenshot, or report — their primary deliverable is a PR, which is also why `agent_docs_write` publishes nothing: its screenshots are page assets committed to the PR, not evidence. `agent_pm_research` may publish charts/datasets/reports alongside its cited sources.
- **Exception — `app_edit_session`**: it publishes nothing, and its boot turn captures no screenshot at all. The portal keys the session's *connected* state on the boot job completing (the ready report) plus its liveness probe — never on an artifact upload (SCRUM-1965), so no evidence file is load-bearing here and the session posts no ticket comment. Evidence a *later* turn produces still drops in `~/workspace/artifacts/` for the post-session lane, which globs exactly ONE directory — the first of `<cwd>/artifacts`, `~/workspace/artifacts`, `~/artifacts` that exists — so the convention directory above is the only reliable drop point; `~/artifacts` is shadowed wherever `~/workspace/artifacts` already exists. Never inside the project worktree: that tree is pushed every turn.
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
| `agent_se_review` | `READY_TO_MERGE` · `NEEDS_CHANGES` |
| `agent_se_followup` | `FEEDBACK_APPLIED` · `BLOCKED` |
| `agent_docs_write` | `PAGES_READY` · `STALE_SKILL` · `NEEDS_DECISION` |
| `agent_docs_verify` | `PASS` · `FAIL` · `BLOCKED` |
| `agent_pm_goal_analysis` | `READY_TO_PLAN` · `NEEDS_DECISIONS` · `NO_CHANGE` |
| `agent_pm_breakdown` | `ISSUES_CREATED` · `ISSUES_RECONCILED` |
| `agent_ops_validate_resolution` | `VALIDATED` · `INCOMPLETE` · `UNVERIFIABLE` |
| `agent_pm_landing_scope` | `GATES_ALIGNED` · `NEEDS_INPUTS` |
| `agent_pm_landing_calls` | `NEEDS_DECISIONS` · `NO_CHANGE` |
| `agent_pm_wireframe` | `REQUIREMENTS_READY` · `NEEDS_INPUT` |
| `agent_se_design_check` | `DEPS_CLEAR` · `BLOCKERS_FOUND` |
| `agent_design_assemble` | `MOCK_READY` · `NEEDS_INPUT` |
| `agent_docs_scope` | `GATES_ALIGNED` · `NEEDS_INPUTS` |
| `agent_docs_decisions` | `NEEDS_DECISIONS` · `NO_CHANGE` |
| `agent_docs_postdeploy` | `LIVE_OK` · `DEPLOY_PENDING` · `DRIFT_FOUND` |
| `app_edit_session` | `SESSION_READY` · `BOOT_FAILED` |

The five `landing`/design workflows serve the `landing-website` pack, which documents their contracts, roles and gates — the YAMLs live here because this is the one directory the default-pack sync registers workflows from. Three are ticket-anchored playbook steps (wireframe → design check → assemble); `agent_pm_landing_scope` and `agent_pm_landing_calls` anchor on `{{goal_url}}` instead of `ticket_url` — no issue exists at the goal's scope/decide phases. `agent_docs_decisions` is goal-anchored for the same reason: it runs the decide phase of a `docs-site` goal (the docs question class — visibility · locale · canonical section naming · retire/redirect per stray page · canonical demo tenant), and it is the first goal-anchored workflow whose deliverable also includes a PR — the `DOCS-INSTRUCTION` instance on the site repo, authored on a greenfield site and validated deltas-only on a site that already carries one.

`agent_docs_scope` is the third goal-anchored workflow and the first goal-anchored one with `role: sd` (`agent_sd_coverage` already carries that role, ticket-anchored): the scope phase of the `docs-site` goal type, one goal per target site. It sweeps the account's skill packs for freshness and publishes the type's five docs gates, together with its verdict, through the goal gates endpoint below. The `sd` role playbook is ticket- and discovery-shaped and says nothing about goal phases, so the prompt carries that framing itself — publish a result, create no issues.

Its five gate ids are a cross-repo contract with the `docs-site` type registry, frozen here so both sides key on the same tokens (`blocking` names the phase in the chain `scope → decide → plan → build → launch`):

| Gate id | Settles | Arms | Blocking |
|---|---|---|---|
| `source-allowlist` | which packs, and which modules inside them, feed this site | user-input · workspace | `decide` |
| `staleness-ledger` | per source: manifest vs index version, evidence type, verdict, required action before use | user-input · workspace | `plan` |
| `confidence-floor` | the minimum module confidence a page may be written from, and the modules under it | user-input · workspace · platform-floor (`0.70`) | `plan` |
| `sitemap-draft` | the page inventory derived from the module inventory, with its declared coverage gaps | user-input · workspace | `plan` |
| `deploy-target` | where the site publishes, and who controls each hop of the deploy chain | user-input · workspace · platform-floor (a SideButton-hosted docs subdomain) | `launch` |

`agent_docs_write` and `agent_docs_verify` are the two per-page steps of the `docs-page` playbook (write → verify → `agent_se_review_merge`, with the verify `FAIL` routed back to write). They split deliberately along the source they trust: write derives the page from the *content* packs the ticket maps and refuses to write at all when those are stale, below the confidence floor, or unreconciled between `index.json` and the pack manifest; verify judges the result against the *audit* pack's per-module `_roles/qa.md` and the live product, never re-reading the content packs — checking a page against the same modules it was generated from confirms nothing. Both prompts carry a reporting-discipline clause, and neither is optional. Write's three tokens are fresh, so they are matched token-only and cannot collide with prose — but token-only matching is not the whole risk: `matchVerdict` scans the WHOLE comment and returns the first hit in gate order (retry → loopback → pass → stop → pause), so write's `PAGES_READY` (pass) outranks `STALE_SKILL`/`NEEDS_DECISION` (pause) wherever it appears. One stray mention in the body advances a run that wrote nothing — the unsafe direction — which is why write names none of its tokens outside the last line. Verify reuses the curated `PASS`/`FAIL`/`BLOCKED`, which additionally keep their case-insensitive prose tiers, so it reports every count neutrally ("dead links: 0"); there `FAIL` sits in loopback ahead of pass, so a stray hit costs a wasted loop rather than a false advance. `agent_docs_write` is also the one workflow here declaring `role: writer` — and `writer` is not a builtin role, so it needs registering before a `docs-page` step is pickable. Declaring it here is necessary but **not** sufficient: role auto-registration (`registerPackRoles`) runs only on an ACCOUNT pack sync, over that account's own registry clone; the global catalog sync that ingests this repo discards the roles it collects. So this pack's `roles` array and `metadata.role` get the workflow registered with the right role string, but they never mint the account registry row that the role pickers and auto-dispatch read. That row comes from a builtin seed (how `design` was enabled, ahead of the landing pack shipping it) or from an account pack carrying `_roles/writer.md` — one of the two has to happen, and it is not this pack's to do.

`agent_docs_postdeploy` serves the `docs-site` goal type (the Documentation Agent) and is the one workflow here declaring **both** anchors: it takes `goal_url` and `ticket_url`, each defaulted to `""`, and exactly one is set per dispatch. The goal type's Launch phase runs it goal-anchored over every route the goal changed; the `docs-page` playbook's optional last step runs it ticket-anchored over the one page that ticket delivered. Both dispatches ask the identical question, so a second id would have been a copy — and the type's ship lane pins a fixed set of `agent_docs_*` ids. Its `DEPLOY_PENDING` is a **hold, not a failure**: on a target whose publish hop is batched and release-driven (source → OSS mirror → Pages, for our own docs site), it is the correct pre-sync answer and the phase waits for the sync rather than failing.

`app_edit_session` is the one id here **without** the `agent_` prefix, and deliberately so: `executePipeline` writes the exact string into `~/.sidebutton/job-context.json` (`.workflow_id`), the portal floor entry keys on it, and SP-D's per-turn Stop-hook branch (SCRUM-1937) will read it from there — the id is a frozen cross-repo contract. It is also the only workflow that is not ticket-anchored — it takes a project path, not a `ticket_url`, and its verdicts describe the boot turn (`SESSION_READY` once the dev server answers over HTTP — any status, since a project with no route at `/` legitimately 404s while healthy — and `BOOT_FAILED` when it never answers at all). Its later chat turns emit neither token: they are conversation on a live session, not gated step results. The session contract itself lives in the `dev-session` module.

Free-form workflows (`agent_se_rca`, `agent_se_plan`, `agent_pm_research`, `agent_sentry_triage`, `agent_sd_coverage`, `agent_pull_repos`) deliberately declare nothing. `agent_experiment_score` must NEVER declare a vocabulary — its comment is parsed as JSON and its prompt forbids verdict-looking tokens outright. The reserved engine-synthesized verdicts (`COMMENT_POSTED`, `JOB_COMPLETED`, `JOB_FAILED`, `JOB_CANCELLED`) are refused at sync and must not be declared.

## Publishing to a Goal (`{{goal_url}}` workflows)

A goal-anchored job does **not** publish through its prose result — the portal renders a goal's gates and calls only from the rows these endpoints write, and nothing parses the job's text. A workflow that anchors on `{{goal_url}}` must therefore spell the channel out in its prompt; a call described in prose alone never reaches the goal page and never locks.

**`agent_docs_scope` and `agent_docs_decisions` name this channel today.** `agent_pm_landing_scope` and `agent_pm_landing_calls` still say "publish the gates/calls as this job's result" and issue no POST — read them as the pattern to repair, never as the one to copy. Migrating that pair is its own change; until it lands, do not infer from their prompts that prose is a working channel.

Identity is the `session_id` in `~/.sidebutton/job-context.json` (`job_id` is the fallback); auth is `Authorization: Bearer $SIDEBUTTON_AGENT_TOKEN` against `$PORTAL_URL`, both already in `~/.agent-env`. A publish must prove one of those two — a call carrying only `?goal=<slug>` is refused `403` ("a token is not a job"), so there the slug is an *assertion*, not an identity: passed alongside it only cross-checks, and one that disagrees with the job's own goal is a `404`. The two read routes are the ones that do accept a bare `?goal=<slug>`, since they authorise nothing against a job. Either publish lands only while its job is still its phase's live job — a superseded run gets `409`, so a stale session cannot overwrite the run that replaced it.

| Call | Purpose |
|---|---|
| `GET /api/agents/goal/read?session_id=…` | goal, current phase, every phase's state, aligned gates, decisions already on record, intake `files[]` (names only) and `links[]` |
| `GET /api/agents/goal/file?name=…&session_id=…` | the bytes of one intake file |
| `POST /api/agents/goal/gates?session_id=…` | the scope phase's gates + its verdict |
| `POST /api/agents/goal/decisions?session_id=…` | the decide phase's calls + its verdict |

`gates` takes `{"verdict":…,"gates":[{"id","content","arm"}]}` — `arm` is the rung the value resolved on (`user-input`, `workspace` or `platform-floor`, or `null` when none applies), body ≤ 256 KB, verdict ≤ 64 chars. It is **all or nothing**: the type's whole gate set publishes in one delivery, exactly once each, and a partial, duplicated or unknown set is a `422` naming `expected` / `missing` / `unknown` / `duplicates` that **writes nothing**. So a delta-aware rework re-derives *selectively* but publishes *completely* — "publish only what changed" makes every rework run fail and record nothing. A gate the user edited comes back in `kept` rather than being replaced — the dispatch hint marks those "(yours — keep)", and the route enforces it even when the edit landed *after* dispatch — while the ones the job wrote come back in `published`. On a scope phase `GATES_ALIGNED` auto-chains the decide job, but only on decide's **first** advance: once that phase has any history a rework republish chains nothing, and reconcile stays the operator's ⟳ door. That outcome rides the `200` as `chained`, which may report `dispatched: false` — a publish that landed behind a chain that did not.

`decisions` takes `{"verdict":…,"decisions":[{"id","question","options","recommended","why"}]}` — `id` and `question` non-empty and ids unique (duplicates are refused), body ≤ 256 KB, verdict ≤ 64 chars. Ids are the idempotency key, so they must be stable across runs. The same POST records the phase verdict, and the response reconciles three ways: `published` are the calls now open carrying your recommendation; `kept` are the ones already **answered** — left exactly as they stand, whether you re-stated them or omitted them; `dropped` are the ids you omitted that nobody had answered, and only those are deleted. An answered call you omit is *not* retractable this way — it comes back as `kept`. So re-publish the **whole** set every run.

`answered_by` is what separates the two kinds of answer, and the distinction is load-bearing. A **human's** answer freezes the row: re-stating it is reported `kept` and rewrites nothing. An `auto` answer is only the decide-lock having applied your own previous recommendation, so it is *not* settled — re-stating it publishes over the row and **re-opens** it, which is exactly what a ⟳ Rework run is for. Treat an `auto` row as an open call, not as the user's input. Every call needs a non-empty `recommended` unless it is already answered: decide-lock refuses a call with neither and the phase stalls.

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
