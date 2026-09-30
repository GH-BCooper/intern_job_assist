# Bug-fix pass — 30 Sep 2026

The whole of v4 was tested end to end in a real browser (Chrome, driven by
`playwright-core`) against an in-memory Supabase fake, at desktop and phone width, in
light and dark, and with a 300-application pipeline for performance. That surfaced
defects the 280 existing tests could not, because jsdom has no layout, no focus
model and no real timing. Everything below was fixed and has a regression test or an
`npm run e2e` check behind it.

Tests: 280 → 355. `npm run e2e` (new) drives the signed-in app in a real browser; `npm run e2e:monkey` throws random input at it.

## Data loss and correctness

| Bug | Effect | Fix |
|---|---|---|
| Editing an application replaced all its interview dates with an empty list | Any edit silently deleted every interview and calendar entry | The form loads existing rounds; saves diff by id and keep exact timestamps |
| Undo after delete re-created the record under a new id, without interviews | Undo was lossy; tags/notes/priority came back detached | Restores the original id, interviews and learnings |
| Ctrl/Cmd+Z was documented but never wired; undo stack survived sign-out | Shortcut did nothing; another account could trigger the previous user's restore | Wired, ignored in text fields and behind the lock; cleared on user change |
| Week buckets, heatmap, period comparisons, calendar grid used `n × 24h` | After a daylight-saving change the calendar showed a duplicated date and shifted every cell; Monday applications landed in the wrong week | Calendar arithmetic (`addDays`) |
| Monthly reminders: Jan 31 → Mar 3, then stuck on the 28th | Drifting due dates | Clamp to month end and remember the original day |
| ZIP export put two applications at one company in the same folder | The second silently overwrote the first — a backup missing an application | Unique folder names (role, then counter) |
| "Wipe my data" cleared the browser, ignored a failed delete, said "deleted" | Data left on the server while the UI claimed it was gone; files and share links never removed | Remote first (files, share links, rows), browser only after success |
| Blank interview date saved the application, then failed on the interview | Confusing partial save | Validated up front |
| Add-interview offline failed with a raw network error | Contradicted the offline promise | Queued like every other write |
| Offline queue was shared by every account on the browser | One user's queued writes replayed under the next user | Items are owned and filtered |
| Overlapping automation passes | A rule could fire twice | Passes are serialised |
| Learnings/interviews kept after deleting an application | Phantom countdowns until reload | Cleared with the record |

## Loading and lag

| Bug | Fix |
|---|---|
| Whole pipeline refetched on **every page change** (router `navigate` in `refresh`'s deps) and on every token refresh | `refresh` depends on the user id only; one atomic, parallel load; background refreshes no longer flash the skeleton |
| Returning users were shown the onboarding wizard on load (store scoped after first render) | Scoped synchronously in the auth provider |
| Search typing: ~110 ms per keystroke at 300 applications | Deferred query, memoised cards reading only their own store slice (long tasks while typing 530 ms → 0) |
| Board, card grid and timeline mounted every row | Paged (9.5k → 5.5k DOM nodes) |
| Notification and automation engines rebuilt timers on every store write | Stable refs |

## Security and privacy

- **Backups contained API keys.** `exportStore` wrote AI keys, webhook URLs, bot and share tokens into a file the app nudges you to save and share. Scrubbed by default; a merge import no longer blanks the credentials already on the device.
- **The assistant could delete on hidden instructions.** The delete tool's only guard was a `confirm: true` argument the model supplies itself, so text in a stored job posting could induce it. The user's own latest message must now ask for the deletion.
- **A full browser quota silently dropped every later change.** Now trims disposable data (old chats, logs) and warns; chat history is capped.
- **"Time-limited document links"** was ignored by the application panel, which still used permanent public URLs.
- **The "vault" encrypted nothing.** Only the idle lock uses the passphrase; notes and contacts are plaintext in the browser. The UI and README claimed otherwise and now say what it really does. *(Decision for you: real at-rest encryption would need an async store — say so if you want it.)*
- **Idle lock could not lock after sleep** (timer-based; refocusing counted as activity). Now measured against the wall clock.

## UI

- **Every toggle switch was drawn wrong** (knob outside its track when on, at the wrong end when off). One shared `Switch`.
- Application form sat under the navbar (z-index) and threw away typing on a stray click. Now a proper dialog: Escape, focus trap, discard confirmation.
- Bento grid holes; clipped pipeline labels ("In Revie"); Insights overflowed sideways on phones; Sankey labels clipped and drawn as fake bars with no data.
- Insights charts ignored the user's renamed stages; timeline called wishlist items "Applied"; table sorted stages alphabetically; "Quietest" and "Interview soonest" sorts were wrong.
- Stale "v2" copy; home page offered "Start tracking" to signed-in users; every page now sets its own title; follows the OS theme on first visit.
- Board: Firefox could not drag; arrow keys were hijacked page-wide; digits and Enter acted while a modal was open; Enter on the star button opened the card; table rows unreachable by keyboard; hover-only controls invisible to keyboard and touch.

## Assistant and integrations

- Every prompt was sent to the model **twice**. Gemini rejected parallel tool calls (results must share one turn). Requests had no timeout, so a hung provider left "Thinking…" forever. A retired model was offered as the fallback. The free-tier meter counted calls that never left the browser.
- "Import CSV" parsed the file and then did nothing; it now imports (with duplicate detection and a preview). Bulk imports run a few at a time.
- Export menu gains CSV and JSON and reads data already in memory instead of refetching with an ever-growing `in (...)` URL; export failures now say so.
- Clearbit's retired logo endpoint removed (one failed request per card). ICS line folding counted characters, not octets, and could split an emoji.
- Prep drill never re-checked the clock, so "Later" never came back.
- OTP inputs inserted instead of replacing a typed-over digit; emails with a stray space failed sign-in.

## Not changed, worth knowing

- The `calendar-feed` Edge Function got the ICS folding fix in source but is **not redeployed** (`npm run setup:supabase -- sbp_token`).
- Gemini 2.0 Flash is still the default model; the app cannot tell whether Google has retired it. A 404 now says so and points at Settings.
- Analytics count wishlist items in "applications this week" (by date saved). Debatable rather than wrong; left as designed.

## Second sweep (same day)

Found by continuing the browser run at more viewport widths, reading the components
that had no coverage, and a randomised "monkey" session (`npm run e2e:monkey`, 2,000+
random clicks, keystrokes and form inputs, zero crashes).

- **The navbar overflowed the screen below ~1,100px.** At 820 px "Automations" was cut off and
  notifications, settings, theme and sign-out were all off-screen, and between 768 and 1,023 px
  there was no menu button either — no way to sign out on a tablet. The menu now takes over
  below `xl`; an e2e check asserts it fits and is reachable at five widths.
- **The language picker did nothing.** Settings stored a locale (and advertised "Español — 60%
  translated") but no code ever called the translator. Navbar, dashboard tiles and buttons, stage
  names, empty states and the undo button now follow it, and `<html lang>` is set.
- **Focus-mode timer ran slow in a background tab** (it decremented once per tick; browsers
  throttle background timers to about one a minute). It now counts down to a deadline.
- **Discord webhooks were rejected** (the request went out as `text/plain`) while the calendar
  action sent JSON that Slack's missing CORS preflight blocks. One helper picks the right encoding
  per service.
- Activity log never said *which application* a stage move was about (a no-op stub); read-aloud
  showed "Stop" on every message and never reset; Enter confirmed an IME candidate **and** sent the
  message/added the item (Japanese, Chinese, Korean) in every "Enter to add" input; the assistant
  re-started a smooth scroll on every streamed token; header icons in the assistant were swapped.
- "Move earlier" on the first pipeline stage swapped it with the last one; a saved model that had left
  the list was shown as the first option while requests kept using the old one; the keyboard help
  described the old page-wide arrow keys.
- Removing an automation was permanent (and took its history); it is now undoable with the same
  rule id, so it does not re-fire everything.
- Public share page kept a previous link's error after the token changed; week-in-review ended a day
  early in the spring-forward week; comparison and week-in-review cards did not close on Escape;
  the offline pill covered the "Ask Scout" button.

## Security found late in the pass

- **Stored XSS in the Markdown renderer.** It escaped `<`, `>` and `&` but not quotes, and a link URL
  is placed inside `href="…"` afterwards, so `[x](https://a.com/"onmouseover="…)` produced a live
  event-handler attribute. Markdown renders assistant replies, notes, briefings and imported
  workspace data, and this app keeps AI API keys in localStorage — so a hostile string could read them.
  Quotes are now escaped; four tests pin it (including `javascript:` links).
- **CSV formula injection.** Exports wrote a company name like `=HYPERLINK(…)` verbatim, which
  Excel/Sheets run when the file is opened. Such cells now get a leading apostrophe; import undoes it.
- **The assistant deleted "the first Stripe".** With two applications at one company it picked an
  arbitrary one. Deletion now needs an id or a name that matches exactly one record, and otherwise
  returns the candidates to ask the user about.
- Deployment: `vercel.json` gains `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and a
  `Permissions-Policy` (microphone stays allowed for dictation), long-lived caching for the hashed
  `/assets/*`, and `no-cache` for `sw.js`. No CSP: the app legitimately talks to Supabase, several AI
  providers and Google Fonts, and a wrong one would break it. The PWA manifest no longer locks the
  installed app to portrait.

Tests: 355 unit/integration, 22 e2e checks, plus the monkey run.
