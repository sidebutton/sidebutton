---
name: Notion (REST API)
match: ["*"]
enabled: false
provider: notion
---

# Notion Integration — REST API

Notion is reached over its REST API at `https://api.notion.com/v1`. The token identifies the
workspace, so there is no site URL and no email — unlike Jira. Use it for the agent's own reads and
writes on the customer's board: query a data source, update a page's properties, post a comment.

⚠️ **No `issues.*` steps route to Notion.** This connector advertises none: the workflow engine has no
Notion provider class, so `issues.create` / `issues.get` / … are Jira/Linear only. Notion work is
direct REST (below) or the `mcp__notion__*` tools when the Notion MCP server is present.

## Authentication

Every request carries **two** headers:

```bash
curl -s https://api.notion.com/v1/users/me \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H "Notion-Version: 2026-03-11"
```

- **`NOTION_TOKEN`** — the connection's token, delivered into `~/.agent-env` by the portal for an
  account with a Notion connection. It is **portal-owned**: every config push rewrites it and the
  health report never persists a copy, so do not hand-edit it — the next push would overwrite the edit.
- **`NOTION_API_KEY`** — the reserved **operator** name. Nothing in the portal ever writes or strips
  it, so that is where a self-managed integration token belongs. If both are set, prefer
  `NOTION_TOKEN`; fall back to `NOTION_API_KEY` when the portal delivers nothing.

Every example below writes `$NOTION_TOKEN` for brevity. On a self-managed box that is the name the
portal never fills, so run them as `Bearer ${NOTION_TOKEN:-$NOTION_API_KEY}` — an empty Bearer header
returns the same `401` a wrong token does, which reads as "invalid credential" for a perfectly valid one.

**Pin `Notion-Version: 2026-03-11` on EVERY call.** A request with no version header is rejected, and
the version decides which surfaces exist at all: `2025-09-03` is the floor for the database →
data-source split below AND for the Views API (older versions 404 `/v1/data_sources/*`), while the
Markdown page-content endpoints (`/v1/pages/{id}/markdown`) need `2026-03-11`. Pin `2026-03-11` and
neither floor ever comes up — it is what this repo pins portal-side (`NOTION_VERSION` in
`website/src/lib/trackers/notion-client.ts`) and the version every live probe in
`docs/integrations/platforms/notion.md` §S11 ran under, so it is the one whose response shapes are
actually verified here. A `400`/`404` on `/v1/data_sources/*`, `/v1/views` or a `…/markdown` path is
a VERSION symptom first — check the header before reaching for the sharing trap below.

(The `mcp__notion__*` tools need none of this: the MCP server sends its own per-operation version.)

## Databases vs data sources — the one structural surprise

Since API version `2025-09-03`:

| Object | What it holds | Endpoint |
|---|---|---|
| **Database** | the container: title, icon, parent, trash state, and a `data_sources[]` array | `GET /v1/databases/{database_id}` |
| **Data source** | the **schema and the rows** — one database may have several | `GET /v1/data_sources/{data_source_id}` |
| **Page** | one row (a card on the board) | `GET /v1/pages/{page_id}` |

So the id in a Notion URL is a *database* id, and almost every useful call needs the *data source* id
underneath it:

```bash
# database container -> its data sources
curl -s "https://api.notion.com/v1/databases/$DATABASE_ID" \
  -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2026-03-11" | jq '.data_sources'

# the schema the property map is built from
curl -s "https://api.notion.com/v1/data_sources/$DATA_SOURCE_ID" \
  -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2026-03-11" | jq '.properties'
```

`POST /v1/databases/{id}/query` is **deprecated** — query the data source instead. Page creation takes
`parent: { "type": "data_source_id", "data_source_id": "…" }`, and a relation property points at a
data source, not a database.

## The property map — address properties by id, never by label

Notion exposes whatever schema the customer built: their "status" column may be called *Stage*, their
key column *ID* or *Ticket*. The workspace binding therefore stores a **property map** (portal side,
`project_settings`) resolving each role — `title`, `key`, `status`, `assignee`, `blockedBy`, `parent` —
to a property **id** and type. Ids survive a column rename; names do not. Read the map from the
binding when one is available, else derive it from the schema:

1. `GET /v1/data_sources/{id}` → the property inventory with types and ids.
2. Exactly one `title` property exists; at most one `unique_id` and one `status` in most schemas.
3. `people` → assignee; a self-relation → dependencies; a relation to another data source → parent tier.
4. The database's **board view** is the customer's own answer for "which property is status" — but it
   takes TWO calls: `GET /v1/views?database_id={database_id}` (a QUERY parameter; the nested path
   `/v1/databases/{id}/views` `400`s) returns **id-only stubs**, so retrieve the board view by id to
   get `configuration.group_by` — `property_id`, the property `type`, and, for `status`, a nested
   `group_by: "group" | "option"` display mode. A stub with no `configuration` is the list shape, not
   a view without grouping.

## Query rows

```bash
curl -s -X POST "https://api.notion.com/v1/data_sources/$DATA_SOURCE_ID/query" \
  -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2026-03-11" \
  -H 'Content-Type: application/json' \
  -d '{
        "filter": { "property": "Status", "status": { "equals": "In progress" } },
        "sorts":  [{ "timestamp": "last_edited_time", "direction": "descending" }],
        "page_size": 50
      }'
```

- `filter` / `sorts` take the property **name or id** — pass the id from the map when you have it.
- Paginate on `has_more` + `next_cursor` → `start_cursor`. `page_size` maxes at 100.
- The human key (`unique_id`, e.g. `KTS-4`) is **not** addressable as a path parameter: fetch a card by
  key with a filter — `{"property":"ID","unique_id":{"equals":4}}` — then use the returned page UUID.

## Write to a page

Properties are patched by name or id, each value shaped by its **type**:

```bash
curl -s -X PATCH "https://api.notion.com/v1/pages/$PAGE_ID" \
  -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2026-03-11" \
  -H 'Content-Type: application/json' \
  -d '{ "properties": {
          "Status":   { "status":   { "name": "In progress" } },
          "Owner":    { "people":   [{ "id": "<user-uuid>" }] },
          "Notes":    { "rich_text":[{ "text": { "content": "picked up by the agent" } }] }
      } }'
```

- **`status` carries groups**, not just options: To-do / In progress / Complete. A terminal transition
  means "an option inside the **Complete** group", resolved from the schema's `status.groups[]` —
  never a hardcoded name, because the customer renames columns.
- `select` takes `{ "name": … }` but `multi_select` takes an ARRAY of them — `[{ "name": … }]`;
  passing the bare object 400s (`multi_select should be an array`), which reads like a read-only
  property and is not. `relation` likewise takes `[{ "id": "<page-uuid>" }]`;
  `date` takes `{ "start": "2026-08-22" }`. `unique_id`, `formula`, `rollup`, `created_by` and
  `last_edited_by` are **read-only** — patching them 400s.
- Rich text is capped at **2000 characters** per element; a request may carry 1000 blocks / 500 KB, and
  at most 100 relations or 100 people.
- Assigning a `people` property fires a native Notion inbox mention — that is the intended "notify" act.

## Comments

```bash
# read a page's threads (needs the connection's "read comment" capability)
curl -s "https://api.notion.com/v1/comments?block_id=$PAGE_ID" \
  -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2026-03-11"

# post into the page's main thread (needs "insert comment")
curl -s -X POST https://api.notion.com/v1/comments \
  -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2026-03-11" \
  -H 'Content-Type: application/json' \
  -d '{ "parent": { "page_id": "'"$PAGE_ID"'" },
        "rich_text": [{ "text": { "content": "PASS — 4/4 checks green" } }] }'
```

Reply into an existing thread by sending `discussion_id` instead of `parent`. A **selected-text**
discussion cannot be created through the API, and a comment carries at most 3 attachments.

## Traps that cost the most time

- 🔴 **404 usually means "not shared", not "not found".** Notion access is per-resource: the customer
  must add the connection to the database (page ••• → **Connections** → add). Sharing a **parent page
  cascades** to its children, so the cheapest grant is one shared parent. Before concluding a page is
  missing, check whether it appears in `POST /v1/search` at all.
- 🔴 **`GET /v1/comments` returns UN-RESOLVED threads only.** Resolve a thread in the UI and the API
  reports zero comments for that page — verified live. Never treat "no comments" as "nothing was ever
  said", and never build a hand-off protocol that depends on reading a thread back after a human tidies
  the board; write the outcome to a **property** and use the comment as readable copy.
- **`POST /v1/search` matches titles only**, over content shared with the connection — no property
  filters, no full-text body search. Anything property-shaped belongs in a data-source query.
- **~3 requests/second** average per connection. A burst returns `429` with a **`Retry-After`** header
  (seconds) — honour it; treat `529` (overload) the same way. Batch reads rather than looping per row.
- **`last_edited_time` / `created_time` are minute-granular.** Comparing them naively across a sweep
  drops or double-counts edits inside the same minute; overlap the window and dedupe.
- **Capabilities are per-connection and default OFF** for both comment permissions (and page creation
  needs "insert content"). A 403 on comments is usually a connection setting, not a token problem.
- Notion IDs are UUIDs; the dashed and undashed forms are both accepted, and URLs carry the undashed
  one. Pass whichever you were given — do not reformat by hand.

## Quick verification

```bash
# 1. identity — must be the connection's bot user
curl -s https://api.notion.com/v1/users/me \
  -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2026-03-11" | jq '.type, .name'

# 2. what has actually been shared with the connection
curl -s -X POST https://api.notion.com/v1/search \
  -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2026-03-11" \
  -H 'Content-Type: application/json' \
  -d '{"filter":{"property":"object","value":"data_source"},"page_size":20}' | jq '.results[].id'
```

`users/me` returning `type: "bot"` proves the credential; an empty search result means **nothing has
been shared yet**, which is the failure to report — not "the database does not exist".

## Agent MCP tools

When the Notion MCP server is delivered (the portal ships the `notion` block together with
`NOTION_TOKEN`), the `mcp__notion__*` tools cover search, page reads/writes and comments interactively.
Prefer them for ad-hoc exploration; use the REST calls above for anything scripted, paginated, or
property-map-driven, where the exact request shape matters.
