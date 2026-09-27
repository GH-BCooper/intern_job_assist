# InternTrack v2

Version 2 turns a single-page application log into a full internship-search workspace with an AI assistant that has real read/write access to it.

**Hard constraint: every layer runs on a permanent free tier. No paid dependency exists anywhere in the stack.**

Nothing was removed from the database. All v1 tables (`applications`, `interview_dates`, `interview_learnings`) and every row in them are untouched; v2 only reads and writes through the same schema.

---

## 1. Scout — the AI assistant

A tool-calling agent with genuine access to the entire app, not a chat widget.

**Providers (bring your own free key, stored only in your browser)**

| Provider | Free tier | Default model |
|---|---|---|
| Google Gemini | Generous daily quota, no card | `gemini-2.0-flash` |
| Groq | High rate limits, no card | `llama-3.3-70b-versatile` |
| OpenRouter | `:free` models cost nothing | `llama-3.3-70b-instruct:free` |
| Ollama | Fully local, no key, works offline | `llama3.1` |

Gemini uses native function calling; the other three use the OpenAI-compatible tool protocol. Both adapters are implemented, so any provider gets the full tool surface.

**34 tools across four groups**

- *Read* — `get_overview`, `list_applications`, `get_application`, `search`, `list_interviews`, `list_reminders`, `list_tasks`, `list_notes`, `list_contacts`, `get_analytics`, `get_activity`
- *Write* — `create_application`, `update_application`, `set_stage`, `bulk_update_stage`, `delete_application`, `add_interview_date`, `add_reminder`, `complete_reminder`, `schedule_follow_ups`, `add_task`, `add_note`, `add_contact`, `tag_application`, `star_application`, `set_goal`, `add_resume_version`
- *Interface* — `navigate`, `set_view`, `set_filters`, `open_application`, `open_new_application_form`, `set_theme`
- *Export* — `export_applications` (PDF / DOCX / CSV / JSON)

**Behaviour**

- Agent loop runs up to 8 tool rounds per turn, chaining read → act → confirm.
- Company references resolve fuzzily: id, exact name, partial name, or role.
- Natural-language dates: `today`, `tomorrow`, `next week`, `in 3 days`, `2026-10-14`.
- `delete_application` is refused unless the user agreed in an earlier turn and `confirm: true` is passed.
- Every tool call is shown in an expandable trace, badged read / write / fail.
- Conversation threads persist locally; ⌘J / Ctrl+J toggles the panel anywhere.
- Inline single-shot generation powers per-application actions (follow-up email, prep plan, cover letter, status summary) and the weekly briefing on Insights.
- All of it degrades cleanly: with no key configured, every non-AI feature still works and rule-based coaching fills the gap.

## 2. Pipeline, views and navigation

- **Kanban board** — drag applications across Wishlist → Applied → In Review → Interviewing → Offer → Closed. Moving a card writes the matching `response_status` / `final_status` / `interview_offered` back to Supabase, so board and record never disagree.
- **Four views** — Board, Cards, Table (sortable on 7 columns), Timeline (grouped by month).
- **Command palette** (⌘K) — jump to any application, page, view or action.
- **Filters** — search, response status, stage, platform, tag, starred-only, archived; saveable as named views.
- **Keyboard** — `⌘K` palette, `⌘J` assistant, `N` new application, `Esc` to close.

## 3. Insights

- Headline stats: total, response rate, interview rate, average days to first interview.
- Momentum gauge (0–100) blending conversion, cadence, streak and follow-up debt.
- Conversion funnel, stage donut, 12-week cadence bars, 6-month activity heatmap, application streaks.
- Per-platform performance table — which sources actually convert.
- Goals with progress rings (weekly or monthly).
- Rule-based "what to do next" that needs no API key, plus a one-click AI weekly briefing.

All charts are hand-rolled SVG. No charting library, no paid service, no server rendering.

## 4. Workspace

Seven tabs of everything around the applications: **Tasks**, **Reminders**, **Notes** (markdown), **Contacts** (with AI outreach drafting), **Resume versions**, **Tags**, and an **Activity log** that records both your changes and Scout's.

## 5. Calendar

Month view combining interviews, reminders and application dates, with a day detail panel, quick-reminder composer, an upcoming list, and a "plan my fortnight" AI action.

## 6. Notifications

- In-app notification centre: due reminders, imminent interviews, quiet applications, overdue tasks — urgent items first.
- Native browser notifications fire when a reminder comes due, deduplicated so each fires once.
- Configurable follow-up window (3–21 days) and reminder lead time (1–72 h).
- One click to hand the whole queue to Scout for prioritisation.

## 7. Interface

- **Light mode is substantially brighter** — surfaces moved to near-white warm neutrals (`#FFFFFF` / `#FFFDFA` / `#FEF7EC`) from the previous cream/tan palette.
- Rebuilt design system: gradient primary buttons, soft/lift/glow shadow scale, unified card, panel, badge, chip, tab and skeleton primitives, motion tokens with `prefers-reduced-motion` respected.
- Company avatars, stage indicators, interview countdowns, star and archive on every card.
- Rebuilt application detail: stage picker, AI actions, interview rounds, tags, reminders, notes, exports.
- Responsive navbar with mobile menu; toast system; focus-visible rings throughout.
- New landing page and brand-aligned auth pages.

## 8. Platform

- **PWA** — installable, standalone display, app shortcuts, generated icons (192/512/maskable).
- **Offline** — service worker: network-first for navigation, cache-first for hashed assets, never caches Supabase or AI traffic.
- **Import / export** — workspace JSON, applications CSV/JSON, plus the existing PDF/DOCX/ZIP exports.
- **Bundle** — initial JS cut from 1,336 kB to 182 kB (~145 kB gzipped total). Pages lazy-load; `pdfjs`, `docx`, `jspdf`, `html2canvas` and `jszip` now load only when actually used.

## 9. Bugs found and fixed

- **Missing `950` shades** in the custom `primary` / `accent` / `light` palettes meant 21 `dark:*-950` classes silently did nothing, leaving cards and badges rendering light-on-dark.
- **Timezone off-by-one**: bare `YYYY-MM-DD` values from Supabase were parsed as UTC midnight, so calendar cells, heatmap buckets and streaks landed a day out for anyone not on UTC. Date parsing is now local-midnight throughout.
- **Duplicate React keys** in the command palette — non-contiguous groups produced two "Actions" sections; grouping is now by name with a matching flat order so keyboard navigation and rendering agree.
- **Lost assistant intents**: when Scout navigated and acted in the same tick, the action fired before the dashboard mounted and was dropped. Deferrable intents are now parked and replayed once data is ready.
- Pre-existing type and lint errors in `AuthContext`, `exportUtils`, `zipExportUtils` and `pdfUtils` cleared. Typecheck and lint are error-free.

## 10. Architecture

```
src/
  context/    AuthContext · DataContext · AIContext · ThemeContext
  lib/
    ai/       providers.ts (4 adapters) · tools.ts (34 tools) · agent.ts (loop)
    store.ts    local-first store for all v2 entities
    insights.ts stage model + analytics + rule-based coaching
    format.ts   timezone-safe date handling
    uiBus.ts    UI intent bus with deferred replay
  components/ views/ (Board·Table·Timeline) · ui/ (Charts·Markdown·Toaster)
  pages/      Dashboard · Insights · Calendar · Workspace · Settings · Home · Login · Register
```

**Data split.** Applications, interview dates and learnings stay in Supabase, exactly as in v1. Everything v2 adds — tags, reminders, tasks, notes, contacts, goals, saved views, activity, AI threads, preferences — is stored locally per user, scoped by user id, and exports as JSON. That is what makes v2 free: it needs no schema migration, no new tables and no additional quota.

## Cost

| Layer | Service | Cost |
|---|---|---|
| Hosting | Vercel Hobby | Free |
| Database, auth, storage | Supabase free tier | Free |
| AI | Your own free-tier key, or local Ollama | Free |
| Charts | Hand-rolled SVG | Free |
| Notifications | Native browser API | Free |
| Offline | Service worker | Free |
| Icons | Generated at build time | Free |

**Total: $0.**

## Setup

Nothing is required — v2 runs as-is against the existing Supabase project. To enable Scout: Settings → AI assistant → pick a provider → paste a free key → Test connection.
