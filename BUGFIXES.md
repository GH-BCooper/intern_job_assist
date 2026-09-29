# Bug-fix pass — 30 Sep 2026

The whole of v4 was tested end to end in a real browser (Chrome, driven by
`playwright-core`) against an in-memory Supabase fake, at desktop and phone width, in
light and dark, and with a 300-application pipeline for performance. That surfaced
defects the 280 existing tests could not, because jsdom has no layout, no focus
model and no real timing. Everything below was fixed and has a regression test or an
`npm run e2e` check behind it.

Tests: 280 → 330+. `npm run e2e` (new) drives the signed-in app in a real browser.

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
