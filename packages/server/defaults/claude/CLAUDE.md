<!-- sidebutton:tracker-access:v1:begin -->
## Issue tracker access (Jira / Linear)

When a task references a ticket, read and write it non-interactively — never through the browser:

1. Prefer the installed issue-tracker MCP tools (atlassian for Jira, linear for Linear) when available.
2. Otherwise call the tracker REST API with credentials already present in your environment:
   - Jira (Basic): `$JIRA_URL` with `$JIRA_USER_EMAIL` + `$JIRA_API_TOKEN`.
   - Jira (app token): send `Authorization: Bearer $JIRA_BEARER_TOKEN` to `$JIRA_BASE_URL` (an `api.atlassian.com/ex/jira/...` gateway). On EVERY Bearer call also send BOTH `Accept-Language: en-US` and `X-Force-Accept-Language: true` — the app principal's locale is not English, and unforced responses come back localized, silently breaking status/type-name matching. `$JIRA_SITE_URL` is for human `/browse/` links only, never for REST.
   - Linear: `$LINEAR_ACCESS_TOKEN`.
3. The browser is a last resort only when every credential above is missing: the VM Chrome carries no tracker session and its login wall cannot be passed non-interactively.

If the ticket cannot be read by any available path, stop and report the error in your final message or ticket comment.
<!-- sidebutton:tracker-access:v1:end -->
