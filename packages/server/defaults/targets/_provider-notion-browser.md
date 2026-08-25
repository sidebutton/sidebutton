---
name: Notion (Browser)
match: ["*"]
enabled: false
provider: notion
---

# Notion Integration — Browser

This connector exists for **one** operation: creating a **webhook subscription** and pasting its one-time
`verification_token` back. Notion offers that nowhere but the connection-settings UI — there is no
create-subscription API, which is why `registerWebhook` answers with a declared refusal instead of a 501.

> ⚠️ **Do not drive Notion content through this connector.** Reading pages, querying data sources and
> writing properties all have real REST endpoints — use the **Notion REST API connector**, selectable
> in Settings → Integrations. Anything you do to a database through the UI is unattended-hostile and
> invisible to the property map. This lane is subscription setup, and stops there.
>
> Only one connector per provider is active at a time, so while this doc is in your target set the REST
> API connector's doc is not — it is not missing, it is behind the switch. If the task in front of you
> is reading or writing Notion content rather than setting up a subscription, that switch is the answer,
> not this lane.

**Important:** This connector assumes you are already logged in to Notion in the browser. If you
encounter a login page or authentication challenge, **stop and notify the user** — do not attempt to
authenticate.

## Browser Tools

Use the standard `browser.*` tools to interact with Notion:

| Tool | Usage |
|------|-------|
| `navigate` | Go to the workspace, integration, or connection-settings URL |
| `snapshot` | Capture current page for reading — see the redaction rule below |
| `click` | Click tabs, buttons, links |
| `fill` | **The only tool that may touch the verification-token field.** It logs the selector and nothing else |
| `type` | The callback URL only. **Never the verification token** — `type` writes the value it typed into the run log verbatim (see redaction) |

## ⚠️ Selectors are UNPROBED as of 2026-08-23

The Notion subscription UI has **never been probed from this VM**: the profile is signed out of Notion,
so the S4a precondition fails before any selector can be recorded (SCRUM-2022). No selector table is
published here because a guessed one is worse than none — it reads as verified and fails silently.

Until a probe lands: **navigate by visible text and role**, not by CSS class (Notion's classes are
generated and churn). Fail loudly on a control you cannot find — never fall through to the next step.
When you do complete a run, record what you saw into `docs/integrations/platforms/notion.md` S8 with
the date, so the next agent inherits a probed lane instead of repeating this notice.

## The flow

Four gates, in order. Each one can stop the lane; none of them may be skipped because a later one
"looks fine".

### Gate 1 — is it already done?

**This one runs first**, before the browser is pointed at Notion at all — it is the cheap check, and on
an already-verified connection opening Notion is itself the mistake. `workflows/notion_browser_probe_subscription_ui.yaml`
is ordered this way and its tests assert that no `browser.*` step runs ahead of it; follow the same order
by hand.

```bash
# Reads this account's endpoint URL and whether a verification token was already captured.
# NOTE: this MINTS the account's nwh_ token if there is not one yet — it is not a dry run.
curl -s -b "$PORTAL_COOKIE" https://<site>/api/settings/notion/webhook-token
# → { "success": true, "token": "nwh_…", "url": "https://<site-origin>/api/webhooks/notion?token=nwh_…", "verified": true }
```

`verified: true` ⇒ **stop and say so.** A blind re-run is the single most expensive mistake in this lane:
the capture is one-shot and the route refuses to overwrite a live secret, answering `200 Verification
token already captured`. So a second subscription would be created, signed with a token we never stored,
and every delivery would 401 behind a portal that still reads green.

Read `verified` off the envelope — gate on `success` first and treat every other response shape as an
error. `verified` is a boolean, so any "absent or false" idiom (`jq`'s `//`, a truthy test) collapses the
healthy signed-in-but-unverified case — the only state this lane is useful in — onto the failure branch.

### Gate 2 — the session

Navigate to `{NOTION_BROWSER_URL}`. A login page, an SSO redirect, or an MFA challenge means the lane is
**over**: report a named blocker and mutate nothing. The capability here is a live Chrome session, not a
credential — an agent cannot re-authenticate itself, and an authenticator-app factor is a hard wall.

Fail this gate **closed**. Only the first sign-in screen carries an email field: an emailed-code step
renders a one-time-code box, an enterprise SSO hop renders username/password, and a passkey prompt may
render no input at all. "I did not find a login form" is therefore not the same as "I am signed in" —
if you cannot positively recognise a signed-in workspace, say so and stop rather than reporting success.

### Gate 3 — create the subscription

Take `url` from Gate 2 **verbatim** — never retype it, never rebuild it by hand. Paste it as the
subscription's callback URL in the integration's connection settings, and create the subscription.

A mistyped URL does not merely fail: Notion auto-disables a subscription after sustained delivery
failure, so the subscription is burned and needs a fresh create.

### Gate 4 — paste the token back

Notion POSTs the one-time `verification_token` to the endpoint, which stores it. Poll for it:

```bash
# Admin-only, and it returns the secret unmasked — pasting it back is the endpoint's whole purpose.
curl -s -b "$PORTAL_COOKIE" https://<site>/api/settings/notion/webhook-verification
# → { "success": true, "captured": true, "verification_token": "…" }
```

`captured: false` means the POST has not landed. Wait and re-poll; if it never lands, the callback URL
Notion received is not the one Gate 1 printed. Paste the token into the subscription's verification
field with **`fill`, not `type`** (see redaction), and confirm.

Then check your work **in Notion**, not in the portal. Re-reading Gate 1 at this point proves nothing:
`verified` there means "Notion's verification POST reached our endpoint and we stored the token", which
became true the moment the subscription was created — before this paste-back. It is not a report of the
subscription's state in Notion. Confirm the subscription shows as verified in the connection settings.

## 🔒 Redaction — the one rule that is not about correctness

The verification token **is** a forgery credential: token plus endpoint URL is enough to sign deliveries
we will accept. It passes through a shell command's output and gets typed into a form field, so:

- **Paste it with `fill`, never with `type`.** This is the rule that is easiest to break by accident,
  because `type` is the obvious tool and the leak is invisible from the workflow. The engine records a
  detail line for every step, and for `browser.type` that line is ``<selector> ← "<the text typed>"``
  with the value already interpolated — so the token lands in the persisted run log, which
  `get_run_log` will happily print back. `browser.fill` has no such detail line: it logs the selector
  only. Same effect on the page, one of them leaks.
- **Snapshot before the paste, never after.** A `snapshot` or `screenshot` taken once the field is
  populated captures the secret into the run artifact permanently.
- Do not bind the token to a workflow variable that gets logged, echoed, or included in a summary.
  Note that `shell.run` logs its command line verbatim, so read the token with a command that keeps it
  out of the command string — never interpolate it into one.
- It must not appear in the ticket comment, the run log, or any published evidence.

## Re-running

| Situation | Act | Effect |
|---|---|---|
| Already `verified: true` | nothing | no-op — say so and exit |
| Subscription is fine, token needs re-capturing | `DELETE /api/settings/notion/webhook-verification` | re-opens the capture window, **URL unchanged** — verify again, no new subscription |

⚠️ That DELETE is not free. The refusal to overwrite a live secret is what stops anyone who has learned
the endpoint URL from installing a signing key of their own — the capture path cannot check a signature,
because it is the message that delivers the key. Blanking the column re-opens that window for as long as
it stays blank. Do it immediately before triggering Notion's verification, then confirm `verified: true`;
do not leave a connection sitting in that state.
| URL leaked, or which token Notion holds is unknown | `POST /api/settings/notion/webhook-token` | rotates the token **and** blanks the secret — the old URL is dead, so you must **re-create** the subscription, not merely re-verify |

Rotation and re-verification are not interchangeable. Rotating and then only re-verifying leaves a
subscription pointed at a URL that no longer resolves.

## Verifying the route before you start

```bash
# Reachability only: invokes the inbound handler with an unsigned synthetic body. Admin-only.
curl -s -X POST -b "$PORTAL_COOKIE" https://<site>/api/settings/notion/webhook-test
# → { "success": true, "message": "Webhook handler OK — Notion will POST to https://<site-origin>/api/webhooks/notion?token=nwh_…" }
```

`success: true` proves the route exists and is wired; it does **not** prove delivery. A real signed
delivery from Notion is the only end-to-end check.

## The manual path

Creating the subscription is one human action, and staying on that path is a legitimate outcome — not a
failure. Hand the operator the `url` from Gate 2 and ask them to add the subscription in the
integration's connection settings, then paste back the token from Gate 4. Everything after that is
identical; the account is not degraded by having taken this route.

## Authentication

Requires `NOTION_BROWSER_URL` in Settings > Environment Variables (e.g. `https://www.notion.so`). You
must be logged in to Notion in the connected browser. The portal calls above additionally need an
authenticated **admin** portal session (`$PORTAL_COOKIE`) — every `settings/notion/` route is admin-only,
because each of them exposes half of the forgery pair. A publisher session answers 403, which reads the
same as an expired one.

`PORTAL_SITE` and `PORTAL_COOKIE` are **not** Settings > Environment Variables. Those are delivered to
providers, not to shells: `shell.run` spawns `/bin/sh` with the workflow runner's own process
environment, so a value set in Settings never reaches a `curl` in a workflow step. They have to be in the
runner's environment (the `sidebutton.service` unit) — and because a portal session cookie expires, treat
"the portal read failed" as a live possibility on every run rather than a one-time setup error.
