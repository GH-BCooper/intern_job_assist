# InternTrack — Roadmap: Features, Integrations & a v4 UI Vision

> ## ✅ Built — see [versionFour.md](versionFour.md)
>
> This document has been worked through. **Every section from §1 to §15 has
> shipped**, including all ten items in §16 and the full UI vision. §17 stayed
> excluded, on purpose.
>
> One step still needs a human, because it needs a credential this repo does not
> hold: a Supabase access token, which unlocks both the share-link migration and
> the calendar-feed deploy. Everything downstream of it is automated —
> `npm run setup:supabase -- sbp_your_token`. [versionFour.md](versionFour.md)
> maps each section below to where it landed in the code.
>
> The rest of this document is kept as written, as the record of the thinking.

---

This is a brainstorm, not a commitment — a wide net of everything InternTrack could
become next, written after a full pass over the current codebase (v3: Kanban board,
Scout the AI assistant with 34 tools, the automation engine, insights, calendar,
workspace, PWA/offline). Nothing here breaks the project's one hard rule:

> **Every idea in this document can be built and run at $0, forever, on the same
> stack InternTrack already uses** (Vercel Hobby, Supabase free tier, a bring-your-own
> free AI key or local Ollama, hand-rolled SVG, browser-native APIs). Where something
> would normally cost money, the free-tier or client-side workaround is spelled out
> next to it. A handful of ideas that *can't* be done for free are listed at the very
> end, explicitly excluded, so they don't get built by accident.

**Legend**

| Tag | Meaning |
|---|---|
| Effort `S` | A focused single session — a few hooks/components, no schema change |
| Effort `M` | A day or two — new local-store fields, a new page/panel, or a new tool group |
| Effort `L` | Multi-session — new architecture (e.g. IndexedDB migration, share links) |
| 💸 `$0` | Uses only what's already in the stack (no new dependency, no new service) |
| 🆓 `$0*` | Needs a new *free-tier* service/library, named explicitly |

## Table of contents

1. [Pipeline & application management](#1-pipeline--application-management)
2. [Interview prep & learning tools](#2-interview-prep--learning-tools)
3. [Documents & resume intelligence](#3-documents--resume-intelligence)
4. [Analytics & insights](#4-analytics--insights)
5. [Automation engine v4](#5-automation-engine-v4)
6. [Scout (AI assistant) v3](#6-scout-ai-assistant-v3)
7. [Calendar & reminders](#7-calendar--reminders)
8. [Import, export & data portability](#8-import-export--data-portability)
9. [Collaboration & sharing](#9-collaboration--sharing)
10. [Gamification & motivation](#10-gamification--motivation)
11. [Accessibility & internationalization](#11-accessibility--internationalization)
12. [Performance & platform](#12-performance--platform)
13. [Security & privacy](#13-security--privacy)
14. [Integration catalog](#14-integration-catalog)
15. [UI/UX vision — InternTrack v4](#15-uiux-vision--interntrack-v4)
16. [If you only build ten things](#16-if-you-only-build-ten-things)
17. [Explicitly excluded (not free)](#17-explicitly-excluded-not-free)

---

## 1. Pipeline & application management

- **Undo toast for destructive actions** `S` 💸 — a 5-second "Undone ✕" toast after
  delete/archive/stage-move, restoring the previous record from an in-memory stack.
  The biggest usability win for the least code: right now delete has no safety net
  outside Scout's confirm-gate, and archiving/stage moves have none at all.
- **Custom pipeline stages** `M` 💸 — let users rename, reorder, or add columns
  beyond the fixed six (`STAGES` in `insights.ts`). Store the user's stage list and
  a mapping in `Preferences`; `stageOf`/`stagePatch` already isolate all the stage
  logic in one file, so this is a config change more than a rewrite.
- **Kanban swimlanes** `M` 💸 — group cards within a column by platform, tag, or
  priority (a toggle above the board). Pure client-side grouping of the same data
  `BoardView` already has.
- **Keyboard-only stage moves** `S` 💸 — an arrow-key / number-key way to move the
  focused card between stages, so the board doesn't require drag-and-drop. Doubles
  as the accessibility fix in [§11](#11-accessibility--internationalization).
- **WIP limits** `S` 💸 — an optional soft cap per column (e.g. "no more than 5 in
  Interviewing") with a warm color warning when exceeded — a light nudge against
  spreading interview prep too thin.
- **Side-by-side offer comparison** `M` 💸 — pick 2–3 applications and see salary,
  location, benefits notes, and your own notes in parallel columns. All fields
  already exist (`salary_info`, notes, contacts); this is a new comparison view, not
  new data.
- **Application priority / interest score** `S` 💸 — a 1–5 "how much do I want this"
  star-free rating, separate from the existing star (which reads more like
  "shortlisted"). Feeds a `priority` sort and an Insights cut ("are you prioritizing
  the right pipeline?").
- **Duplicate-detection warning** `S` 💸 — when adding an application, fuzzy-match
  company + role against existing records and warn before creating a near-duplicate
  (complements the "Duplicate application" action already shipped).
- **Company logo chips** `S` 🆓 `$0*` — `https://logo.clearbit.com/{domain}` (free,
  keyless) or a Google favicon endpoint, with the existing gradient-initials avatar
  as fallback on 404. Drop-in visual upgrade for cards, table rows and the command
  palette.
- **Referral relationship field** `S` 💸 — "referred by" linking a Contact to an
  application, surfaced on the card ("via Priya") — the data model (`Contact`,
  `application_id`) already supports the join; it's one field and one chip.
- **Application templates** `S` 💸 — save a prefilled "template" (recurring resume +
  platform + tags combo) and one-click spawn a new application from it, for people
  who apply to many similar roles.
- **Manual actions logged to Activity** `S` 💸 — right now `logActivity` is only
  called from Scout and automations; a manual drag-drop board move or a manual stage
  picker change in `ApplicationDetail` doesn't appear in the Workspace Activity tab.
  Worth closing so the activity log is a complete history, not just "what the AI
  did."
- **Per-application stage history** `M` 💸 — a small timeline of stage transitions
  with timestamps, built by logging every `setStage` call (ties into the point
  above) instead of only storing the current override.

## 2. Interview prep & learning tools

- **Spaced-repetition question trainer** `M` 💸 — turn `interview_questions` and
  `interview_learnings` into flashcards with a simple client-side SM-2 scheduler
  (no library needed, ~80 lines of math), stored per-question review state in the
  local store. Genuinely useful and entirely offline.
- **STAR story bank** `M` 💸 — a reusable library of "Situation/Task/Action/Result"
  stories tagged by competency (leadership, conflict, failure, etc.), referenced
  from any application's interview-prep panel instead of rewritten each time.
- **Mock interview mode with Scout** `S` 💸 — a quick-prompt that has Scout roleplay
  the interviewer for a specific application/round, asking one question at a time
  and critiquing the answer — no new infrastructure, just a system-prompt variant
  layered on the existing chat.
- **Auto-prompted post-interview retro** `S` 💸 — a new automation trigger,
  `interview_completed` (fires the day after a logged interview date), that nudges
  "How did it go?" and opens the learnings form pre-linked to that application.
- **Prep checklist generator** `S` 💸 — Scout already drafts prep plans on request;
  make it structural — a per-round checklist (resume reviewed, questions prepped,
  two questions ready, outfit/setup checked for virtual rounds) stored as `Task`s
  auto-created by the existing `interview_upcoming` automation trigger.

## 3. Documents & resume intelligence

- **Resume ↔ job-description match score** `M` 💸 — a client-side keyword-overlap
  score (TF-IDF style, no ML API) between a pasted job description and a resume
  version's stored text, surfaced as "62% keyword match — missing: Kubernetes, CI/CD."
  All computable in a `Web Worker` with plain JS, zero external calls.
- **True versioned resume files** `M` 🆓 `$0*` (uses existing Supabase Storage quota)
  — today `ResumeVersion` in the local store is text-only; extend it to hold an
  actual uploaded file per version (same storage bucket already used for
  `resume_path`), so "Backend v3" is a real, re-downloadable PDF, not just a label.
- **Cover-letter merge-field templates** `S` 💸 — save a cover letter with
  `{{company}}`, `{{role}}`, `{{hiring_manager}}` placeholders (the automation
  engine already has an `interpolate()` helper doing exactly this for rule text —
  reuse it) and let Scout or a one-click button fill them per application.
- **One-pager PDF per application** `S` 💸 — a branded single-page PDF (company,
  role, dates, key notes, contacts) generated with the `jsPDF` dependency already in
  the stack — handy to print before walking into an on-site interview.
- **In-browser PDF highlight/annotate** `M` 🆓 `$0*` — `pdf.js` is already a
  dependency (used for text extraction); its viewer + a canvas overlay can support
  highlighting your own resume PDF for review, no new library.

## 4. Analytics & insights

- **Month-over-month / season-over-season comparison** `S` 💸 — extend the existing
  `thisWeek`/`lastWeek` comparison in `insights.ts` to month and custom-range
  comparisons, surfaced as a toggle on the Insights headline stats.
- **Stage-flow Sankey diagram** `M` 💸 — a hand-rolled SVG flow chart (same
  philosophy as `Charts.tsx`) showing how applications actually move between stages
  over time, including backward moves (e.g. Interviewing → Closed), which the
  current funnel (strictly linear) can't show.
- **Day-of-week / time-of-day pattern analysis** `S` 💸 — "You hear back 2.3x faster
  when you apply Tuesday–Thursday" — a genuinely actionable insight computable from
  data already stored (`date_applied`, interview dates).
- **Predictive offer estimate** `S` 💸 — a simple Bayesian-ish projection ("at your
  current 8% interview rate and 30% interview→offer rate, ~14 more applications
  gets you to an expected first offer") — transparent math, no ML service.
- **Shareable analytics snapshot image** `S` 💸 — render the Insights headline
  stats to a PNG via `html2canvas` (already a dependency) for a "share your
  progress" button — feeds directly into the Weekly Wrapped card in [§10](#10-gamification--motivation).
- **Search health score breakdown** `S` 💸 — the existing `momentum` score is a
  single number; expose *why* (a small bar breakdown of the four inputs it already
  blends — conversion, cadence, streak, follow-up debt) so it reads as coaching, not
  a mystery number.

## 5. Automation engine v4

The engine (`src/lib/automation.ts`) already has 7 triggers, 8 actions, dedupe, and
a webhook escape hatch into Discord/Slack/Zapier/Make/IFTTT — all free. Natural next
steps, all additive to the same evaluator:

- **New triggers**: `interview_completed` (learnings retro nudge, see §2),
  `offer_deadline_approaching` (days left to respond to an offer — needs one new
  optional field on the application or a linked reminder), `goal_at_risk` (pace
  check against a weekly/monthly `Goal` partway through its period),
  `contact_follow_up_due` (haven't messaged a saved contact in N days).
- **New actions**: `duplicate_application` (spin off a new record, e.g. reapplying
  next cycle), `send_ics` (attach a calendar invite to a webhook payload — pairs
  with the ICS export in [§7](#7-calendar--reminders)), `move_workspace` (once
  [multi-season workspaces](#9-collaboration--sharing) exist).
- **AND/OR conditions per rule** `M` 💸 — today one rule = one trigger; letting a
  rule combine two conditions ("stale AND tagged `dream-company`") multiplies what
  6 trigger types can express without adding new ones.
- **Quiet hours** `S` 💸 — a global "don't fire `notify`/`webhook` between 10pm and
  8am" preference, queuing the action for the next allowed tick instead of dropping
  it.
- **Dry-run preview** `S` 💸 — a "preview matches" button on the rule editor that
  runs `findMatches` without executing actions, so users can sanity-check a new rule
  before enabling it (the pure matching logic is already cleanly separated from
  execution in the current code).
- **Template gallery expansion** `S` 💸 — the 6 built-in templates cover the
  obvious cases; 8–10 more (thank-you-note reminder after every interview,
  tag-and-notify on any Offer, weekly resume-refresh nudge if no update in 60 days,
  auto-tag by platform, birthday/anniversary nudges for saved contacts) are pure
  data, no engine changes.
- **Visual rule builder** `L` 💸 — replace the current form-field rule editor on
  `/automations` with a clause-based builder ("When [dropdown] ... Then [dropdown]
  ..."), closer to Zapier's own editor, still producing the same `AutomationRule`
  JSON.

## 6. Scout (AI assistant) v3

Scout already has 34 tools across read/write/interface/export, 4 free-tier
providers (Gemini native function calling; Groq/OpenRouter/Ollama via the
OpenAI-compatible tool protocol), an 8-round agent loop, and fuzzy company
resolution. Extensions that fit the same architecture:

- **Voice input** `S` 🆓 `$0*` — the browser's native `SpeechRecognition` API
  (Web Speech API, zero cost, ships in Chrome/Edge) to dictate a message into the
  assistant panel instead of typing.
- **Spoken replies** `S` 🆓 `$0*` — `speechSynthesis`, also browser-native and free,
  to read Scout's answer aloud — handy for the weekly briefing while doing something
  else.
- **Vision input for job postings** `M` 💸 (Gemini's free tier already supports
  image input) — paste a screenshot of a job posting and let Scout extract
  company/role/platform straight into `create_application`, instead of typing it
  out. The tool already exists; this only adds an image attachment to the chat
  message.
- **"Quick add from pasted text"** `S` 💸 — a dedicated button (not just a chat
  message) that takes a pasted job description and calls Scout once, headless, to
  populate a new-application form — formalizes something Scout can already do
  conversationally into a one-click affordance.
- **New tools**: `score_resume_against_jd` (surfaces the match score from §3 as a
  tool so Scout can reason about it), `find_duplicate_applications`,
  `suggest_next_companies` (pattern-matches your existing platforms/roles/tags to
  suggest where to apply next — no web search, just your own data),
  `generate_ics_invite` (ties into §7).
- **Streaming responses** `M` 💸 — both Gemini and the OpenAI-compatible endpoints
  support SSE streaming on the free tier; wiring it in turns "Thinking…" into a
  token-by-token reply, a meaningful perceived-latency win for zero added cost.
- **Free-tier usage meter** `S` 💸 — track a rolling request count per provider per
  day against each one's known free-tier ceiling (documented already in
  `providers.ts`) and warn *before* a 429, instead of surfacing the rate-limit error
  after the fact.
- **Persistent "remember this" notes for Scout** `S` 💸 — a short list of standing
  preferences ("always use my Backend resume for SWE roles", "I prefer async
  interviews") injected into `systemPrompt()` alongside the existing tag/route
  context, so Scout doesn't need to be told twice.
- **Provider A/B compare** `S` 💸 — since most users will configure more than one
  free key over time, a "try this with a second provider" button that re-runs the
  last prompt against a different configured provider side-by-side.

## 7. Calendar & reminders

- **.ics export** `S` 💸 — generate a downloadable `.ics` file for interviews and
  reminders (a well-understood ~100-line format, no library needed) so they land in
  Google/Apple/Outlook calendar. High value, genuinely free, and the most-requested
  kind of feature for a tracker like this.
- **Subscribable ICS feed** `L` 🆓 `$0*` — a Supabase Edge Function (free tier
  includes a generous invocation quota) serving a per-user, token-scoped `.ics` URL
  that calendar apps can *subscribe* to (auto-refreshing), rather than a one-time
  import. Needs a new tiny public-readable table keyed by a random share token —
  still $0, just a bit more plumbing than the static export above.
- **Interview timezone field** `S` 💸 — store timezone per interview date for
  remote/international roles, so the calendar and countdown are correct regardless
  of where the interviewer is.
- **Recurring reminders** `S` 💸 — "remind me every Monday to check in on my
  pipeline" as a reminder that re-schedules itself on completion, instead of only
  one-off dated reminders.
- **Time-blocking suggestion** `S` 💸 — when an interview is added, offer to also
  add a 30–60 minute "prep block" reminder the day before, as a checkbox on the
  add-interview flow (the automation template already does this via a trigger; this
  exposes the same idea inline, for people who don't want to set up automations).

## 8. Import, export & data portability

- **Import from other trackers** `M` 💸 — column-mapping presets for Huntr, Teal
  HQ, and Simplify.jobs CSV exports, reusing the CSV parser already written in
  `ai/tools.ts` (`parseCsv`). Removes the switching-cost barrier for anyone
  currently using a competitor.
- **LinkedIn "My Data" export mapping** `M` 💸 — LinkedIn lets any user download
  their own applied-jobs history as CSV for free; a mapping preset turns that into
  bulk-imported applications.
- **Browser bookmarklet: "Add to InternTrack"** `S` 💸 — a tiny bookmarklet (no
  extension store, no install, no $5 developer fee) that grabs the current page's
  title/URL and opens InternTrack's new-application form prefilled — works on any
  job board without a real browser extension.
- **Full browser extension** `L` — same idea as the bookmarklet but packaged as a
  Manifest V3 extension. Building and side-loading it is free; only *publishing* to
  the Chrome Web Store carries Google's one-time $5 developer fee, so ship it as a
  self-hosted "load unpacked" or Firefox (free listing) build if that fee is out of
  scope.
- **Scheduled local-backup nudge** `S` 💸 — a toast/reminder every N days
  ("Export your workspace — it's been 3 weeks") since the richest data (workspace
  JSON) lives only in this browser's `localStorage`.
- **Static "portfolio" export** `M` 💸 — a self-contained downloadable HTML file
  summarizing pipeline stats and target companies, suitable for handing to a career
  center or mentor without granting any account access.

## 9. Collaboration & sharing

- **Read-only share link** `L` 🆓 `$0*` — a new Supabase table
  (`shared_dashboards: token, user_id, scope, expires_at`) with an RLS policy that
  allows anonymous `SELECT` only by matching token, powering a public read-only
  `/shared/:token` route showing Insights (not raw application data) to a mentor or
  career coach. Still free-tier Supabase; the cost is a new table and one new route.
- **Multi-season workspaces** `M` 💸 — group applications into named seasons
  ("Summer 2026", "New Grad 2027") using the existing tag/archive mechanism under
  the hood, with a season switcher in the navbar instead of one flat pool.
- **Career-fair leave-behind list** `S` 💸 — a printable one-page list of target
  companies with a short "why" note per company, generated from starred/tagged
  Wishlist entries.

## 10. Gamification & motivation

- **Achievement badges** `S` 💸 — first application, first interview, first offer,
  30-day streak, 100 applications — all computable client-side from data the store
  already has, no new tracking needed.
- **Confetti on Offer** `S` 🆓 `$0*` — a burst animation when a card moves into the
  Offer stage. `canvas-confetti` is a ~3 KB MIT-licensed library, or it's easy to
  hand-roll with a dozen animated `<div>`s to keep the zero-new-dependency streak
  going.
- **"Weekly Wrapped" shareable card** `M` 💸 — a Spotify-Wrapped-style auto-generated
  image (applications sent, interviews landed, best-converting platform, streak),
  rendered to PNG via `html2canvas` (already a dependency) for sharing outside the
  app. Ties directly into the shareable-snapshot idea in §4.
- **Motivational tip of the day** `S` 💸 — a small bundled list of job-search tips
  rotated daily, no API, shown on the dashboard for days with no other alerts.

## 11. Accessibility & internationalization

- **Keyboard-operable Kanban** `S` 💸 — see §1; drag-and-drop alone locks out
  keyboard and many touch/assistive-tech users from the primary interaction of the
  app.
- **Live-region announcements** `S` 💸 — `aria-live` regions for toasts and stage
  changes so screen readers announce state changes that are currently purely visual.
- **High-contrast theme variant** `S` 💸 — a third theme option beyond light/dark,
  built on the same CSS-variable approach proposed in [§15](#15-uiux-vision--interntrack-v4).
- **Adjustable base font size** `S` 💸 — a Settings slider that scales a root CSS
  variable, respected by the existing `rem`-based Tailwind scale.
- **i18n scaffold** `M` 💸 — a simple key/dictionary system (no paid translation
  API — ship English + one or two community/AI-assisted translations to start,
  e.g. Spanish and Hindi given the target audience of interns) using the existing
  free AI key to *draft* translations for review, not a live translation service.

## 12. Performance & platform

- **Offline write queue** `M` 💸 — the real gap behind the current `NetworkBanner`:
  writes to Supabase currently just fail while offline (the banner only warns).
  An IndexedDB-backed outbox that queues `create`/`update`/`delete` calls made
  offline and flushes them on reconnect would make the PWA genuinely usable on a
  train or plane, not just for *reading* cached data.
- **IndexedDB migration for the local store** `L` 💸 — `localStorage` has a
  practical ~5–10 MB ceiling; as activity logs, AI threads, and the heatmap's daily
  buckets accumulate for long-time users, IndexedDB (free, built into every
  browser) removes that ceiling. The existing `read()`/`write()`/`mutate()` API in
  `store.ts` is already a clean seam to swap the backing store behind.
- **Virtualized lists** `S` 🆓 `$0*` — `react-window` (MIT, ~6 KB) for Table/Board
  columns once someone has hundreds of applications, keeping render cost flat.
- **Web Worker for analytics** `S` 💸 — move `computeAnalytics` off the main thread
  for users with large histories, so Insights never causes a visible stutter.
- **Background Sync for automations** `S` 💸 — where supported, register a
  Background Sync event so automation checks can run even when the tab isn't
  focused, instead of relying purely on the in-tab interval in `useAutomations`.

## 13. Security & privacy

- **Signed URLs for resume/cover-letter storage** `S` 💸 — `supabase.ts` currently
  calls `getPublicUrl` for uploaded files; Supabase Storage supports signed,
  time-limited URLs on the same free tier, which is a meaningfully better default
  for documents that may contain personal information.
- **Optional local "vault" encryption** `M` 🆓 `$0*` — the browser's native
  `crypto.subtle` (Web Crypto API, zero cost, zero dependency) can AES-GCM encrypt
  sensitive local-store fields (notes, contacts) behind a passphrase the user sets,
  for anyone sharing a device.
- **Session auto-lock** `S` 💸 — an optional "lock after N minutes idle" that
  re-prompts for the passphrase/password without a full sign-out.
- **TOTP two-factor login** `M` 💸 — Supabase Auth supports TOTP MFA on the free
  tier; today's OTP flow covers signup/email/password changes but not an ongoing
  second factor at login.
- **Self-service data wipe** `S` 💸 — one button in Settings that deletes the
  Supabase account *and* clears the local store, for a clean "right to be
  forgotten" exit.

---

## 14. Integration catalog

All free, no card required anywhere.

| Integration | What it enables | Cost | How |
|---|---|---|---|
| **Discord / Slack incoming webhooks** | Automation `webhook` action posts nudges into a channel | Free tier | Already supported — just needs a webhook URL pasted into Settings |
| **Telegram Bot API** | Personal chat notifications, no channel needed | Free, no card | New `telegram` automation action calling `api.telegram.org/bot<token>/sendMessage` |
| **Zapier / Make / IFTTT** | Chain InternTrack events into hundreds of other free-tier apps (Google Sheets, Notion, email, SMS via their free connectors) | Free tiers | Already the point of the generic `webhook` action — worth an explicit "recipes" doc section showing 2–3 concrete Zap/Make examples |
| **.ics calendar feed** | Interviews/reminders show up in Google/Apple/Outlook Calendar | Free, no card | Client-side `.ics` generation (§7); optional subscribable feed via a free Supabase Edge Function |
| **Clearbit Logo API / favicon services** | Real company logos instead of initials | Free, keyless | `https://logo.clearbit.com/{domain}`, fallback to existing gradient-initials avatar |
| **GitHub public API** | Optional contribution-graph badge on the dashboard for engineering applicants | Free, no auth needed for public data | Fetch a public username's contribution/stat data client-side |
| **Google Fonts** | Already in use (DM Sans, Playfair Display, JetBrains Mono) | Free | No change — confirms no paid font licensing risk |
| **EmailJS** | Send a weekly digest or a drafted follow-up straight from the browser, no backend | Free tier: 200 emails/month | Client-side SDK call from an automation action or a Settings-configured "email me" toggle |
| **Google Sheets / Notion (via Zapier/Make)** | Mirror your pipeline into a spreadsheet or Notion database automatically | Free tiers | Downstream of the existing generic webhook — document as a named recipe rather than new code |
| **Ollama (local)** | Fully offline AI, no key, no rate limit, no data leaving the machine | Free, self-hosted | Already supported as a provider |

---

## 15. UI/UX vision — InternTrack v4

The current design system is already a genuine point of view — warm gold-to-coral
gradients, Playfair Display headers over DM Sans body text, a soft/lift/glow shadow
scale, hand-rolled SVG charts, and a real dark mode (not an inverted light mode).
The ideas below build *on* that identity rather than replacing it, borrowing
specific, nameable moves from products known for being good at this:

- **Linear** — the command-palette-first, keyboard-native feel; motion that's fast
  and purposeful, never decorative.
- **Arc Browser** — bold single-accent color blocking, playful but restrained
  micro-interactions, a persistent glanceable status strip.
- **Raycast / macOS Spotlight** — instant fuzzy search with inline results, not just
  navigation.
- **Vercel & Stripe dashboards** — bento-grid stat layouts, clean data-dense tables,
  gradient-mesh hero backgrounds used sparingly.
- **Spotify Wrapped** — bold, shareable, personal-data-as-story recaps.
- **Cron / Fantastical** — glassy, soft-shadowed calendar surfaces with confident
  typography.
- **GitHub's contribution graph** — already InternTrack's own heatmap; a proof that
  "boring data, confidently designed" reads as premium.

### 15.1 Bento-grid dashboard

Redesign the Dashboard's top section as a bento box of variable-sized tiles — a
large "momentum" tile, a medium "next interview" countdown tile, small stat tiles,
a mini sparkline tile — instead of a uniform stat-tile row. Apple/Vercel-style bento
grids read as considered rather than generic, and every value shown already exists
in `computeAnalytics`.

### 15.2 Command bar with inline answers

Extend the existing `CommandPalette` (already excellent — fuzzy search, grouped
results, keyboard nav) so that typing a full question directly into it (rather than
a command) shows an inline one-line Scout answer beneath the results, Spotlight/
Raycast-AI style, without needing to open the full assistant panel for a quick fact
("how many applications this week?").

### 15.3 Kanban polish pass

- Glassmorphic column headers (`backdrop-blur` + translucent background — the app
  already uses `backdrop-blur-xl` on the navbar, so this is consistent, not new).
- A satisfying lift-and-tilt on drag start (a few lines of CSS transform, no
  animation library needed) instead of the current flat opacity-fade.
- Swimlane toggle and WIP-limit warning color from §1, made visually part of the
  column header rather than a separate control.

### 15.4 Timeline → "journey" view

The existing `TimelineView` already renders a nice month-grouped vertical stepper
with connector lines. Extend the *same visual language* one level deeper: opening
an application could show its own mini vertical journey (Wishlist → Applied →
Interviewing → rounds → Offer/Closed) as a compact stepper in the detail panel —
a shipment-tracker-style visualization of one application's story, reusing the
`before:absolute` connector-line trick already in `TimelineView.tsx`.

### 15.5 Runtime accent-color themes

Today `primary`/`accent` are Tailwind static color scales — great for consistency,
but fixed at build time. Migrating the handful of places that reference them to CSS
custom properties (`--color-primary-500`, etc., matching the pattern index.css
already uses for `--surface`/`--page`/`--ring`) would let Settings offer a small
curated set of accent presets — the current warm Coral, plus an Ocean blue, a
Forest green, a Grape violet, and a monochrome Slate — swapped at runtime with zero
rebuild and zero new dependency. Medium effort, high "this app feels mine" payoff.

### 15.6 Ambient motion, used sparingly

A subtle animated gradient-mesh background (CSS `conic-gradient` + a slow keyframe
rotation, or a lightweight canvas particle drift) behind the Home hero and auth
pages only — matching the grid-noise treatment already present, adding motion
without adding a library. Respect `prefers-reduced-motion`, which the codebase
already does globally in `index.css`.

### 15.7 Focus / Zen mode

A distraction-free single-application view — large type, minimal chrome, an
optional Pomodoro-style timer — for deep prep sessions, in the spirit of writing
apps like iA Writer or Bear. Reuses the existing `ApplicationDetail` data, just a
different shell around it.

### 15.8 Hand-drawn empty states

Replace the current icon+text empty states (Workspace tabs, Insights suggestions)
with small inline line-art SVGs — no image hosting, no new asset pipeline, just
more considered markup for a moment users hit constantly on a fresh account.

### 15.9 Guided onboarding

An animated multi-step first-run flow (pick an accent color, optionally connect a
free AI key, set a first goal, see the empty dashboard come alive) building on the
`onboarded` preference flag that already exists but currently isn't paired with any
actual onboarding UI.

### 15.10 A persistent "now" strip

A slim, always-visible bar (Arc's "little arc" / macOS Dynamic-Island energy)
showing the single most relevant thing right now — "Interview with Acme in 2
days" or "3 applications gone quiet" — so that signal doesn't require a trip to
Insights or the notification center to notice.

### 15.11 Optional sound design

Tiny synthesized UI sounds (a soft pop on task-complete, a rising chime on Offer)
generated with the Web Audio API's oscillator nodes — no audio files to host, off
by default, one Settings toggle.

### New components this implies

`BentoTile`, `AccentPicker`, `JourneyStepper` (per-application), `NowStrip`,
`FocusModeShell`, `WrappedCard`, `InlineAnswer` (for the command bar), and a
`useReducedMotionSafe` wrapper so every new animation automatically respects the
existing `prefers-reduced-motion` rule.

---

## 16. If you only build ten things

Ranked by impact ÷ effort, given everything above:

1. Undo toast for delete/archive/stage-move (§1)
2. Offline write queue (§12) — closes the biggest real gap in the "offline-first" story
3. .ics calendar export (§7)
4. Company logo chips via a free favicon API (§1)
5. Confetti + Weekly Wrapped shareable card (§10 + §4)
6. Manual actions logged to Activity (§1) — a one-line fix for a real blind spot
7. Voice input + spoken replies for Scout (§6) — free, novel, and works with zero setup
8. Achievement badges (§10)
9. Runtime accent-color themes (§15.5)
10. Resume ↔ job-description match score (§3)

---

## 17. Explicitly excluded (not free)

Listed so they don't get built by accident:

- **True Web Push to a closed browser/tab** — requires either a paid push
  infrastructure or a third-party service (OneSignal, etc.); the existing
  `Notification` API only fires while a tab/service worker is alive, which is
  already the free ceiling.
- **Publishing a browser extension to the Chrome Web Store** — Google charges a
  one-time $5 developer registration fee. The bookmarklet (§8) and a self-hosted
  "load unpacked" or Firefox listing (free) get the same functionality without it.
- **Any paid ATS-keyword or resume-scoring API** — the client-side TF-IDF approach
  in §3 gets most of the value without a subscription.
- **Scraping LinkedIn/Indeed job pages** — against their Terms of Service and not
  reliably free even where technically possible; "paste job text, let Scout parse
  it" (§6) is the compliant zero-cost equivalent.
- **A managed translation API for i18n** — use the already-configured free AI key
  to draft translations for human review instead of a paid translation service.
