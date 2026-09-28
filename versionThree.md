# InternTrack v3 — Automations

v3's focus: turn InternTrack from a tool you operate into one that acts on your
behalf. Everything below runs in the browser, checked every 60 seconds, at
**zero cost** — no new backend, no paid tier, no data removed from prior
versions.

## 1. Automation rules engine

A "when X happens, do Y" system, built from scratch this session.

**Triggers**
- `stale_no_response` — no reply N days after applying (re-fires every N days while still quiet)
- `interview_upcoming` — an interview is within N days
- `task_overdue` — a checklist task passes its due date
- `no_activity_days` — an application has had no logged activity for N days
- `application_created` — a new application is added (from this rule's creation date on)
- `stage_is` — an application enters a specific pipeline stage
- `weekly_digest` — a fixed weekday/hour, once a week

**Actions**
- `add_reminder`, `add_task`, `add_tag`, `add_note`, `archive`, `set_stage`
- `notify` — in-app toast + native browser notification
- `webhook` — POSTs JSON to any URL: **Discord/Slack incoming webhooks, Zapier, Make, or IFTTT are all free tiers** and this is the integration point into all of them

Every match is deduplicated (per rule + application + time bucket) so nothing
ever fires twice for the same event. Rules, run counts and a 300-entry run log
persist in the existing local-first store — no schema change, no Supabase
migration.

Files: `src/lib/automation.ts` (engine + 6 ready-made templates), additions to
`src/lib/store.ts` (`AutomationRule`, `AutomationLogEntry`, CRUD),
`src/hooks/useAutomations.ts` (the interval runner).

## 2. Automations page

New `/automations` route: one-click templates (auto follow-up nudge, interview
prep reminder, stale-pipeline alert, auto-archive on rejection, overdue-task
alert, weekly webhook digest), a live rule list with enable/disable/delete, a
webhook-URL field, and a recent-runs feed. Linked from the navbar and ⌘K.

## 3. Scout can build automations, not just actions

Five new AI tools — `create_automation`, `list_automations`, `toggle_automation`,
`delete_automation`, `run_automations_now` — so a request like *"remind me
automatically whenever an application goes quiet"* creates a standing rule
instead of a one-off reminder. Scout's system prompt and quick-prompt list
were updated to reach for this.

## Cost

Identical to v2: Vercel free hosting, Supabase free tier, bring-your-own free
AI key, and now free-tier webhook relays (Discord/Slack/Zapier/Make/IFTTT) for
external notifications. **Total: $0.**

## Data

No existing table, row, or v2 local-store field was touched or removed.
Automation state is additive: `automationRules`, `automationLog`,
`automationSeen`, and two new preference flags (`automationsEnabled`,
`webhookUrl`).
