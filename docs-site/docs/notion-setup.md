# Notion Boards

Run agent work straight off the Notion kanban your team already keeps. Connect your Notion workspace, bind a board to a SideButton workspace, and a card movement becomes the trigger: the card joins the [**Tasks**](/workflows/tasks) pool, an agent picks it up, and the Notion page collects status moves and one comment per step as the run advances.

## Overview

A typical setup: *assigning the SideButton agent to a card on your engineering board starts the Bug Fix playbook.* Saving a Notion connection seeds exactly that rule for you — an ordinary, editable automation called **Assigned to SideButton Agent (Notion)** — so the shortest path from "connected" to "working" is to drop the agent into a card's person property.

What happens on a matching card event:

1. SideButton sees the change — from the polling sweep, or from a webhook delivery if you set one up.
2. The automation's filters are evaluated — data source, type, status, assignee, and event type.
3. **Playbook action:** the card is added to the **Tasks** pool (auto-approved or held for review), and the run starts once its dependencies clear. **Workflow action:** a single job is dispatched right away.
4. The agent works the ticket; with **Sync ticket status** on, the card moves through your board's status column as the run progresses.
5. Each step posts one comment to the page — what was done, the evidence, and a **verdict** — and records that same verdict in a **Verdict ledger** column on the page itself.
6. The agent's own edits are recognized and skipped, so an automation never re-triggers itself.

## Prerequisites

- **A Notion workspace you own** — creating an internal integration is an owner-level action.
- **A database (board) to work from**, with at least a title column and a **Status** column.
- **A playbook or workflow to run** — for example *Bug Fix*, *Hotfix*, *Feature Implementation*, *QA Only*.
- **An agent online** — automations default to "Any available agent" ([create one](./cloud/aws-setup.md) if you haven't yet).
- **Portal admin rights** — saving the connection and binding a workspace are admin actions.

---

## Step 1: Create the internal integration in Notion

1. Go to [notion.so/profile/integrations](https://www.notion.so/profile/integrations) and create a new **internal** integration in the workspace you want to automate.
2. Give it a name your team will recognize on the board — the agent's comments and card assignments appear under it.
3. Open the integration's **Capabilities** and switch on all six:

| Capability | Why the integration needs it |
|--------|---------|
| Read content | Read cards, board schemas, and your status vocabulary |
| Update content | Move a card's status, set the assignee, write the verdict ledger |
| Insert content | Create cards |
| **Insert comments** | Post each step's report to the page |
| **Read comments** | Read the verdict a gate decides on |
| User information | Resolve assignee names and recognize the agent's own edits |

4. Copy the **Internal Integration Secret** — it starts with `ntn_`.

::: warning Both comment capabilities are OFF by default — turn them on now
A fresh Notion integration arrives with the three **content** capabilities already on and **both comment capabilities off**. That default is the single most common way a Notion setup goes wrong, because nothing about it looks wrong: the connection succeeds, your databases list correctly, and the portal's **Test Connection** reports green — none of those checks touches a comment.

The failure surfaces much later, on the first real run: a step cannot post its report, or a gate cannot read the verdict it needs to decide on, and the run stalls with a permission error instead of advancing.

Switch on **Insert comments** and **Read comments** before you leave the Capabilities screen. Grant **User information** at the same time — without it the assignee picker comes back empty.
:::

---

## Step 2: Share the database with the connection

Notion grants access **per resource**, never per workspace. Owning the workspace grants your integration nothing at all, and neither does being its admin: until someone connects a specific database to the integration, that database does not exist as far as the API is concerned.

In Notion:

1. Open the database.
2. Click **•••** (top right).
3. Choose **Connections**, then add your integration.
4. Repeat for every database you want SideButton to see — including any database a **relation** column points at.

::: warning "Not found" usually means "not shared"
Notion answers a request for an unshared page with a plain *not found*. SideButton re-words that into the likelier cause, but the confusion is worth recognizing on sight: if a board, a card, or a dependency link reports as missing while you are looking right at it in Notion, the connection almost certainly was never added to it.

Relations are the sneaky case. When the database a relation points at is unshared, Notion omits the property **entirely** rather than erroring — so a "Blocked by" column can simply be missing from the property map instead of failing loudly.
:::

---

## Step 3: Paste the token into the portal

1. In the portal, open **Integrations** and click the **Notion** card.
2. Paste the secret into **Integration Token**. There is no workspace URL to enter — the token identifies your workspace.
3. *(Optional)* Set a **Default data source**: the board whose statuses and types are offered when nothing else names one. A Notion board's columns belong to that board, so unlike Jira and Linear there is no workspace-wide vocabulary to fall back on.
4. Click **Save**, then **Test Connection**.

A successful test names the workspace and bot you are connected as, and lists every database it can see under **Shared databases**. That list is the real point of the test — *"Connected"* with an empty list means the token is fine and nothing will ever sync. Go back to Step 2 and share a database.

::: tip Test proves reachability, not capabilities
Test asks Notion who the token belongs to and searches for shared databases. Neither call needs a comment capability, so a connection missing them still tests green. Step 1's warning is the only guard against that.
:::

---

## Step 4: Bind a board to a workspace

Binding tells SideButton which repository and agent pool a board's cards belong to.

1. Open **Workspaces**, edit the workspace that owns the repository, and find **Work intake**.
2. Choose **Notion** as the provider, then pick a **Notion data source** from the list. Pick it from the list rather than typing it — a Notion data source is a long opaque id, not a short key anyone can retype.
3. Review the **Notion property map** that appears. A workspace that was already bound shows a **Show the property map** button instead, so that merely opening the page never spends a live schema read.

One data source per workspace. A Notion database can carry several data sources with different schemas, so each is offered as its own option — pick the one this workspace tracks.

### The property map

Because Notion has no fixed vocabulary — your status column may be called *Stage*, your board may have two people columns, and none of it is named the way anyone else's is — SideButton reads the board you already built and works out which column plays which role. A kanban's grouping column is the strongest hint about your status property; schema heuristics fill in the rest.

| Role | What it is used for |
|--------|---------|
| **Title** | The ticket summary — required before anything can be created |
| **Ticket key** | The human-facing key, from a unique-id column such as `ENG-17`; cards without one fall back to their page id |
| **Status** | The workflow column — required before anything can be transitioned |
| **Type** | Story / bug / task; what playbook routing keys on |
| **Assignee** | Who owns the ticket; without it work lands unassigned |
| **Blocked by** | The dependency relation — a relation column pointing back at the same board — used to hold work back |
| **Parent** | The parent relation used to group work; without it the pool is flat |
| **Verdict ledger** | Where SideButton records step and validation verdicts. This is the one column that is ours rather than yours: add a rich-text column named **SideButton Verdict** and it is picked up automatically |

Each row carries a state, so nothing is ever silently guessed:

- **discovered** — read straight off the board.
- **assumed** — a recommendation you can accept or change.
- **ambiguous** — a question you have to answer before that role works at all (two people columns, for instance). Questions are shown above the table, not buried in it.
- **absent** — no such column, with a note naming the consequence.

::: tip Renaming a column later is safe — renaming an option is not
The map stores Notion **property ids**, not names, so you can rename "Status" to "Stage" and every binding keeps working. The same is true of the three status **groups**, which are matched by id.

Individual **options** are the exception: an automation's status and type filters are saved as the option name and matched exactly, so renaming *In Review* to *Review* orphans any rule that filtered on the old name. Re-pick it in the rule after a rename.

Corrections you make in the map are stored separately from what was discovered, so pressing **Re-discover** after a schema change never overwrites them. A stored map is reused for a day before being read again; **Re-discover** forces a fresh read whenever you want one.
:::

---

## Step 5: Get events flowing

Two lanes deliver card events. The first needs nothing from you.

### The polling sweep — on by default

SideButton sweeps every bound data source on a short cycle (about every five minutes), newest-edited first, and turns what it finds into exactly the events a webhook would have delivered — same filters, same routing, same logs. It starts working the moment a workspace binding exists; there is nothing to switch on, and a connection with no bound board costs nothing.

Two properties are worth planning around:

- **It never backfills.** The sweep's floor is the moment you bound the board. A card created before that never enters the pool through the sweep, *even if you edit it today* — deliberately conservative, so connecting a five-year-old board does not dispatch five years of work. Bring older cards in by hand from **Tasks**.
- **It cannot see comments.** A page's last-edited time does not move when someone comments, so comment events are not deliverable on this lane at all. The **Comment added** trigger stays unavailable until a webhook subscription exists.

### A webhook subscription — optional

A subscription trades the sweep's cycle for delivery in seconds. Notion has **no API for creating subscriptions**, so unlike Linear there is no Deploy button that can do this for you — it is created by hand, on Notion's side, and verified with a token pasted back:

1. In your integration's settings in Notion, add a webhook subscription pointed at your account's SideButton Notion endpoint URL.
2. Notion immediately posts a **one-time verification token** to that URL. SideButton captures it automatically and holds it.
3. Read that captured token back out of the portal and paste it into Notion's subscription form. The paste is how Notion confirms you control the endpoint — the token only ever arrives at the endpoint, so this is the only way to close the loop.
4. From then on every delivery is signed. SideButton verifies the signature over the raw body, rejects stale deliveries and deliveries from another workspace, and ignores a re-send of anything it has already handled.

::: warning Treat the endpoint URL like a credential
The endpoint URL carries a token that identifies your account, and that URL plus the verification token is enough for someone to forge deliveries. Both values are admin-only for that reason. Rotating the endpoint token also clears the stored verification token and invalidates the old URL, so re-create the subscription in Notion whenever you rotate.
:::

---

## Step 6: Create the automation

In the portal's fleet settings, open **Automations**, click **+ New Automation**, name the rule, and choose **Notion** as the trigger type. (Saving your connection already seeded one rule — **Assigned to SideButton Agent (Notion)** — so you may prefer to edit that instead of starting from scratch.)

Every filter you set must match at once (AND); a filter left at "Any" matches everything.

| Filter | Matches | Notes |
|--------|---------|-------|
| **Data source** | The board the card lives on | *Any data source* matches every board this connection can see. |
| **Type** | An option of the board's mapped type column | Most boards have no type column at all — then there is nothing to filter on and playbook routing falls back to your default. |
| **Assignee** | A Notion user | Pick from the suggestion list so it resolves to a real user; free-typed text can never match. Pick the integration's own bot entry to build "assign the agent, start the run". |
| **Status** | An option of the board's mapped status column | An empty picker is a real answer, not a loading state: the board has no status column, has two with nothing to break the tie, or — most often — uses a plain **select** rather than Notion's **Status** type. See [Good to know](#good-to-know). |
| **Trigger on events** | *Card created* / *Card updated (properties)* | Default when none are checked: created + updated. **Comment added** is disabled — page polling cannot deliver comment events. |

::: tip Assigning someone is a property change
Notion has no "assigned" event. Dropping a person into a card's people property arrives as *Card updated (properties)*, never as a create — so leave that box checked on any assign-the-agent rule.
:::

Then choose the action. **Playbook** runs a multi-step, gated playbook against the card and is the recommended way to work a board end-to-end; **Workflow** dispatches a single one-shot job. The playbook options — **Run via** (task pool or run immediately), **Approval** (auto-approve or hold for review), **Sync ticket status**, a static **hint**, and the **effort tier** — behave exactly as they do on the [Linear trigger](/linear-automations#step-5-set-the-playbook-options).

---

## Step 7: Watch it run

Move a card that matches your filters — assign the agent, or drag it into the status you filtered on. Then verify in the portal:

1. **Tasks** — the card appears as a pooled task (*Waiting*, or *Pending* if you chose Hold for review).
2. **Jobs / Playbooks** — a run starts once the task is approved and unblocked.
3. **Notion** — the page collects one comment per step, and with **Sync ticket status** on it moves through your board's status column as the run advances.

---

## Good to know

- **About three requests per second, per connection.** That is Notion's ceiling, and every sweep, enrichment read and schema discovery draws on the same budget. SideButton paces itself to stay under it, so a large board syncs gradually rather than in one burst — expect a big first discovery to take a moment, not to fail.
- **The workflow column has to be a Status property.** Notion's dedicated **Status** type carries To-do / In progress / Complete groups, and those groups are how SideButton knows what "done" means on your board. An ordinary **select** column used as a kanban grouping has no groups to read, and guessing is not on the table — calling an unclassifiable option "new" would push finished cards back into the pool. So a select-grouped board is flagged as a question in the property map, its status picker comes back empty, and reads, card creation and status moves against it are declined rather than acted on. Converting the column to a **Status** property is the supported shape; type, assignee and comment behaviour are unaffected either way.
- **Resolving a comment thread does not lose the verdict.** Notion returns only un-resolved comments through its API, so a tidy-up in the UI would otherwise erase a step's verdict from view. That is why the agent writes the verdict twice: the human-readable comment, plus a machine-readable line in the **Verdict ledger** column, where nothing in the Notion UI can resolve it away. A board with no ledger column still works — verdicts just stay comment-only, and a resolved thread hides them.
- **Dependencies carry over.** A card's *"blocked by"* relation becomes a task dependency when the blocking card is pooled too; links to cards outside the pool never hold a run back.
- **No self-triggering, no duplicate runs.** Edits made by the connection's own bot identity are skipped before an event is ever synthesized, and a card that already has an active run never starts a second one.
- **Comments are ordinary Notion comments.** They appear in the page's thread under your integration's name, so the board doubles as the audit trail — every step, every verdict, every hand-off is a comment your team can read after the fact.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|-------|
| Test says connected, but **Shared databases** is empty | No database has been connected to the integration yet. Notion access is per-resource — see Step 2. |
| A step posts nothing, or a gate never sees a verdict | The connection is missing **Insert comments** or **Read comments**. Both are off by default, and Test does not check them. |
| The assignee picker comes back empty | The **User information** capability was never granted. |
| A board, card or relation reports as missing | It was never shared with the connection. A relation whose target database is unshared vanishes from the property map entirely rather than erroring. |
| The status picker is empty, and the board refuses reads or moves | The board's workflow column is a plain **select** rather than Notion's **Status** type. Convert it, then **Re-discover**. |
| An automation stopped matching after a board tidy-up | Status and type **options** are matched by name, exactly. Renaming an option orphans every saved rule that filtered on it — re-pick the new name in the rule. |
| Nothing fires for cards that already existed | The sweep never backfills — its floor is the moment you bound the board. Add older cards from **Tasks**. |
| **Comment added** cannot be checked | Page polling cannot see comments; the box unlocks only for rules delivered over a webhook subscription. |
| Card changes take a few minutes to land | That is the polling sweep's cycle. Add a webhook subscription for near-instant delivery. |
| Fires on the wrong cards | Filters are ANDed and unset filters match everything. Bind the rule to a specific **Data source** if the connection can see several boards. |
| Matched, but no run started | The card already has an active run, or the task is pooled awaiting approval or its dependencies. |
| Runs land in the wrong repository | Bind the data source to the intended workspace (**Workspaces** → edit → **Work intake**). |

---

## Related Documentation

- [Orchestrating Agents](/workflows/orchestration) — workflows, playbooks and gates explained
- [Working with Tasks](/workflows/tasks) — review and approve the cards automations pool
- [Create a cloud agent (AWS)](./cloud/aws-setup.md) · [Hetzner](./cloud/hetzner-setup.md) · [GCP](./cloud/gcp-setup.md)
- [Linear Automations](./linear-automations.md) — the same trigger model on Linear issue events
- [Jira Integration](./jira-setup.md)
