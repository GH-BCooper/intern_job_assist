# InternTrack v4 — what shipped

v4 works through [ROADMAP.md](ROADMAP.md) section by section. The roadmap's one
hard rule held: **nothing below costs anything**, ever. No new paid service, no
card, and only one new dependency in the whole release (`playwright-core`, a dev
dependency for the browser smoke test, which drives the Chrome you already have
rather than downloading one).

Written for: anyone picking this repo up — what exists now, where it lives, and
the three things that still need a human.

---

## The ten highest-impact items (§16 of the roadmap)

All ten, in the roadmap's own ranking:

1. **Undo toast** — delete, archive and every stage move push a restore closure
   (`src/lib/undo.ts`). The toast offers Undo for five seconds; the stack keeps
   the last twenty.
2. **Offline write queue** — the real gap behind the old banner. Writes now go
   through an IndexedDB outbox (`src/lib/outbox.ts`), are applied optimistically
   offline, and flush in order on reconnect. `NetworkBanner` reports how many are
   waiting and can push them on demand. Genuine rejections are *not* queued, so a
   bad payload still surfaces as an error instead of retrying forever.
3. **.ics calendar export** — hand-rolled RFC 5545 (`src/lib/ics.ts`), with
   folding, escaping and alarms. One button on the dashboard exports everything;
   each application exports its own rounds.
4. **Company logo chips** — `logo.clearbit.com` then Google's favicon service,
   both keyless, with the existing gradient-initials avatar as the fallback on a
   404 (`src/components/ui/CompanyLogo.tsx`).
5. **Confetti + Weekly Wrapped** — a hand-rolled canvas burst and a Web Audio
   chime on reaching Offer (`src/lib/fx.ts`), plus a shareable Wrapped card
   rendered to PNG with the `html2canvas` already in the stack.
6. **Manual actions logged to Activity** — `setStage` now records both a stage
   transition and an activity entry, so a drag on the board shows up in the log
   exactly like something Scout did.
7. **Voice input and spoken replies** — `SpeechRecognition` dictates into the
   composer and `speechSynthesis` reads answers back (`src/lib/speech.ts`). Both
   degrade to "unsupported" rather than erroring.
8. **Achievement badges** — fourteen, computed from existing records
   (`src/lib/badges.ts`), so importing history unlocks them retroactively.
9. **Runtime accent themes** — `primary` and `accent` are now CSS custom
   properties that Tailwind resolves through `rgb(var(--…) / <alpha>)`. Five
   palettes swap live, no rebuild (`src/lib/accent.ts`).
10. **Resume ↔ JD match score** — TF-IDF-flavoured overlap over two documents,
    entirely local (`src/lib/match.ts`). Reports coverage, cosine similarity, the
    terms covered and the terms the posting leans on that your resume never says.

---

## §1 Pipeline & application management

- Undo toast (above).
- **Custom pipeline stages** — rename, reorder and set a per-column WIP limit in
  Settings → Pipeline & board. Renaming is presentation only: stored overrides,
  automations and analytics keep the canonical names, so a rename can never
  orphan a record.
- **Kanban swimlanes** — group cards within a column by platform, tag or
  priority, from a toolbar control.
- **Keyboard-only stage moves** — arrows navigate, ⌥/Shift+arrow or 1–6 move the
  focused card, Enter opens, `?` lists the bindings. Drag-and-drop is no longer
  the only way to work the board.
- **WIP limits** — a soft cap warms the column header and explains itself, rather
  than blocking.
- **Side-by-side comparison** — pick two or three applications (or click the
  Offers tile) for a parallel view that ticks the leading column where the
  comparison is numeric.
- **Priority / interest score** — a 1–5 flame rating, deliberately separate from
  the star, which reads as "shortlisted". Drives a sort, a swimlane and an
  automation condition.
- **Duplicate detection** — trigram similarity (`src/lib/duplicates.ts`) warns on
  add, powers a Scout tool, and holds near-duplicates back during CSV import.
- Company logo chips (above).
- **Referral field** — link a saved contact to an application; the card shows
  "via Priya".
- **Application templates** — save an application's shape and spawn new ones from
  the dashboard in one click.
- Manual actions logged to Activity (above).
- **Per-application stage history** — every transition is recorded with a
  timestamp and an actor, and rendered as a journey stepper.

## §2 Interview prep & learning tools

- **Spaced-repetition trainer** — SM-2 in ~60 lines of arithmetic
  (`src/lib/srs.ts`), on a new `/prep` route. Your recorded interview questions
  become flashcards; grading adjusts ease and interval. Works entirely offline.
- **STAR story bank** — reusable Situation/Task/Action/Result stories tagged by
  competency, with a one-click "ask Scout to tighten this to 90 seconds".
- **Mock interview mode** — a system-prompt variant that has Scout roleplay the
  interviewer, one question at a time, with tools withheld so it stays in
  character.
- **Post-interview retro** — a new `interview_completed` automation trigger, with
  two templates built on it.
- **Prep checklist** — adding an interview now also offers a prep block the
  evening before, inline, for people who do not want to configure an automation.

## §3 Documents & resume intelligence

- Match score (above), surfaced in the application detail panel and as a Scout
  tool.
- **True versioned resume files** — a resume version can hold a real uploaded
  file on the same Supabase Storage quota, and its text is extracted at upload so
  scoring never re-parses a PDF.
- **Cover-letter merge templates** — `{{company}}`, `{{role}}`,
  `{{hiring_manager}}` and friends, filled per application, reusing the same
  placeholder convention the automation engine already interpolates.
- **One-pager PDF** — a branded single-page brief per application via the
  existing jsPDF: facts, rounds, prep notes, contacts, open tasks, your notes.

## §4 Analytics & insights

- **Month / quarter comparisons** — a toggle on the headline stats.
- **Stage-flow Sankey** — hand-rolled SVG showing how applications actually
  moved, including backward moves the linear funnel cannot express.
- **Day-of-week patterns** — with a deliberate refusal to claim a pattern from
  fewer than ten dated applications.
- **Offer projection** — transparent expected value from your own two conversion
  rates, and it says so.
- **Shareable snapshot** — the headline block to PNG via `html2canvas`.
- **Momentum breakdown** — the four inputs the score blends, so it reads as
  coaching rather than a mystery number.

## §5 Automation engine v4

- **New triggers**: `interview_completed`, `offer_deadline_approaching` (reads a
  linked `deadline` reminder, so no schema change), `goal_at_risk`,
  `contact_follow_up_due`.
- **New actions**: `duplicate_application`, `send_ics`, `telegram`, `email`
  (EmailJS, 200/month free).
- **AND/OR conditions** — five clause types, invertible, combined with all or
  any. A rule with no clauses behaves exactly as it did.
- **Quiet hours** — notification-shaped actions are *queued* in the store and
  replayed on the first tick after the window closes, not dropped.
- **Dry-run preview** — "preview matches" runs the same matcher with no actions
  and ignores the dedupe ledger, so it shows what the rule describes.
- **Ten more templates**, and the ones needing a channel say so up front.

## §6 Scout v3

Voice in and out, mock-interview mode, and:

- **Vision** — paste, drop or pick a screenshot of a posting; Gemini's free tier
  reads it.
- **Quick add from pasted text** — a dedicated button that calls Scout once,
  headless, and opens the prefilled form. It deliberately does not save.
- **Twelve new tools**: `score_resume_against_jd`, `find_duplicate_applications`,
  `suggest_next_companies`, `generate_ics_invite`, `remember_preference`,
  `set_priority`, `add_star_story`, `create_prep_cards`, `get_timing_patterns`,
  `get_projection`, `get_weekly_wrapped`, `log_contact_outreach`. That is 46 in
  total.
- **Streaming** — SSE on both Gemini and the OpenAI-compatible endpoints, so
  "Thinking…" becomes a token-by-token reply. Tool rounds stay buffered, because
  partial tool arguments are not actionable.
- **Free-tier usage meter** — a rolling per-provider daily count against each
  one's published ceiling, with a warning at 90% instead of a 429 after the fact.
- **Persistent memory** — "remember that…" writes a standing line into the system
  prompt, listed and removable in Settings.
- **Provider A/B** — re-run the last prompt on a second configured provider and
  read both answers side by side.

## §7 Calendar & reminders

- `.ics` export (above), per application and workspace-wide.
- **Subscribable feed** — `supabase/functions/calendar-feed/`, a free-tier Edge
  Function serving a token-scoped, auto-refreshing calendar. **Needs deploying**
  (see below).
- **Interview timezone** — per round, shown on the card, in focus mode and in the
  exported invite.
- **Recurring reminders** — daily, weekly or monthly. Completing one moves the
  same record forward from its previous due date, so a late completion does not
  drift, and long-neglected occurrences are skipped rather than firing in a burst.
- **Time-blocking** — the inline prep block described in §2.

## §8 Import, export & portability

- **Import presets** — Huntr, Teal HQ, Simplify.jobs, LinkedIn "My Data" and a
  best-effort generic mapper, over the CSV parser that already existed. Shows the
  counts and holds duplicates back before writing anything.
- **Bookmarklet** — no extension store, no developer fee. Settings →
  Integrations has a draggable button.
- **Browser extension** — `extension/`, an unpacked MV3 build with a popup and a
  context-menu item. See `extension/README.md`.
- **Backup nudge** — a configurable reminder, because the richest data lives only
  in this browser.
- **Portfolio export** — a single self-contained HTML file for a career centre,
  with no notes, contacts or compensation in it.

## §9 Collaboration & sharing

- **Read-only share link** — `/shared/:token`, aggregate insights only. Anonymous
  visitors read through one security-definer function that takes a single token,
  so a link can never be widened into a listing. **Needs one migration** (below).
- **Multi-season workspaces** — named seasons with a dashboard switcher that
  scopes the whole pipeline.
- **Career-fair leave-behind** — a printable page of starred companies and why.

## §10 Gamification

Badges, confetti, the Wrapped card, and a bundled tip of the day.

## §11 Accessibility & i18n

- Keyboard-operable Kanban (above).
- **Live-region announcements** — toasts and stage changes go through a permanent
  polite region.
- **High-contrast theme** — a third variant that hardens borders, drops
  translucency and removes the decorative page wash.
- **Adjustable base font size** — a Settings slider on a root variable; the
  rem-based Tailwind scale follows.
- **i18n scaffold** — English plus shell coverage in Spanish and Hindi, with
  honest per-locale coverage percentages and English fallback.

## §12 Performance & platform

- Offline write queue (above).
- **Web Worker analytics** — over 150 applications, `computeAnalytics` runs on a
  worker that imports the same function, so the two cannot drift.
- **Virtualised table** — past 80 rows the table windows itself with spacer rows.
  Hand-rolled, so no virtualisation dependency.
- **Background Sync** — the service worker wakes open clients for an automation
  pass on `sync` and `periodicsync`, plus a visibility-change catch-up. All three
  supplement the in-tab interval rather than replacing it.

## §13 Security & privacy

- **Signed URLs** — documents are served through time-limited signed URLs, with
  a fallback to public so an existing public bucket keeps working.
- **Local vault** — AES-GCM with a PBKDF2-derived key through the browser's own
  Web Crypto. The passphrase is never stored; only a verifier blob is.
- **Session auto-lock** — re-prompts for the passphrase after idle time without
  signing out.
- **TOTP two-factor** — enrolment, QR code and verification through Supabase
  Auth MFA.
- **Self-service wipe** — clears the local workspace and deletes your
  applications, behind a three-step confirmation.

## §14 Integrations

Discord/Slack/Zapier/Make/IFTTT webhooks (already there), Telegram, EmailJS,
`.ics`, Clearbit/favicon logos, and the bookmarklet — every one free with no
card. All configured in Settings → Integrations.

## §15 UI/UX — the v4 look

Bento dashboard, command-bar inline answers, glassmorphic column headers with a
lift-and-tilt drag, the journey stepper, runtime accent themes, an ambient
gradient-mesh behind hero and auth surfaces, focus/zen mode with a Pomodoro,
hand-drawn SVG empty states, guided onboarding, the persistent "now" strip, and
optional Web Audio sounds. Every animation respects `prefers-reduced-motion`,
which `index.css` already enforced globally.

New components: `BentoTile`, `AccentPicker`, `JourneyStepper`, `NowStrip`,
`FocusMode`, `WrappedCard`, `CompanyLogo`, `MatchScore`, `Sankey`, `BadgeShelf`,
`EmptyArt`, `Onboarding`, `QuickAdd`, `CompareView`, `LockScreen`.

---

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — no errors (ten pre-existing react-refresh warnings).
- `npm test` — **256 tests**, up from 99.
- `npm run build` — clean, and the analytics worker bundles separately.
- A browser smoke test drives the built app in real Chrome: public routes, the
  runtime accent variables, Tailwind resolving through them, the signed-out
  redirect, and the shared route's failure path.

Two genuine bugs were caught by the new tests and fixed:

- `stageFlow` drew **Interviewing → Closed as forward progress**, because
  `Closed` is last in `STAGES`. It now ranks by *progress*, where `Closed` is a
  regression — which is the single most informative edge in the chart.
- The bookmarklet minifier stripped `//` line comments and **ate the `//` in
  `https://`**, producing a broken URL. It now only collapses whitespace.

Testing Library's auto-cleanup was also never running (this project does not use
Vitest `globals`), so component tests would have stacked renders in one document.
`src/setupTests.ts` now registers `cleanup` explicitly.

---

## What still needs a human

Three things, all because they need credentials this repo does not hold:

1. **Apply the share-link migration.** `supabase/migrations/20260929000001_add_shared_dashboards.sql`
   creates the table, its RLS policies and the `public_shared_dashboard` function.
   Until it runs, Settings → Share and `/shared/:token` say so in plain language
   and everything else is unaffected.
2. **Deploy the calendar feed** if you want a *subscribable* calendar rather than
   the one-time export:
   `supabase functions deploy calendar-feed --no-verify-jwt`.
   The flag is required because calendar clients cannot send an auth header;
   security is the unguessable token, as with any secret calendar address.
3. **Add the extension icons** — `extension/icon-{16,48,128}.png`. The extension
   loads and works without them; Chromium just substitutes a default and logs a
   warning.

Nothing else is pending, and nothing in v4 changed the applications, interview
dates or learnings tables.
