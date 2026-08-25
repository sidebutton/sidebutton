<!-- sidebutton:tracker-access:v2:begin -->
## Issue tracker access (Jira / Linear / Notion)

When a task references a ticket, read and write it non-interactively — never through the browser:

1. Prefer the installed issue-tracker MCP tools (atlassian for Jira, linear for Linear, notion for Notion) when available.
2. Otherwise call the tracker REST API with credentials already present in your environment:
   - Jira (Basic): `$JIRA_URL` with `$JIRA_USER_EMAIL` + `$JIRA_API_TOKEN`.
   - Jira (app token): send `Authorization: Bearer $JIRA_BEARER_TOKEN` to `$JIRA_BASE_URL` (an `api.atlassian.com/ex/jira/...` gateway). On EVERY Bearer call also send BOTH `Accept-Language: en-US` and `X-Force-Accept-Language: true` — the app principal's locale is not English, and unforced responses come back localized, silently breaking status/type-name matching. `$JIRA_SITE_URL` is for human `/browse/` links only, never for REST.
   - Linear: `$LINEAR_ACCESS_TOKEN`.
   - Notion: send `Authorization: Bearer $NOTION_TOKEN` to `https://api.notion.com/v1` and pin `Notion-Version: 2026-03-11` on EVERY call — the header is required, and the version decides which surfaces exist: an older one predates the database→data-source split, so `/v1/data_sources/{id}/query` (the way to read a board's rows) 404s under it. A card's rows live on the **data source** inside the database, and a 404 on a page usually means the database has not been shared with the connection, not that it is missing. `$NOTION_API_KEY` is the operator's own name — use it only when `$NOTION_TOKEN` is absent.
3. The browser is a last resort only when every credential above is missing: the VM Chrome carries no tracker session and its login wall cannot be passed non-interactively.

If the ticket cannot be read by any available path, stop and report the error in your final message or ticket comment.
<!-- sidebutton:tracker-access:v2:end -->
