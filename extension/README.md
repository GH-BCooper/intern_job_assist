# “Add to InternTrack” — browser extension and bookmarklet

Two ways to get a job posting into InternTrack from wherever you found it. Both
are free forever: the bookmarklet needs no install at all, and the extension is
loaded unpacked, so it never touches the Chrome Web Store's one-time $5
developer fee.

Both read **only what the page publishes about itself** — JSON-LD `JobPosting`
data, Open Graph tags, the document title — plus the visible page text you can
already see. Nothing is sent anywhere: the fields travel to InternTrack in the
URL **hash**, which browsers never transmit to a server, and the app clears it
from the address bar as soon as it reads it.

---

## Option 1 — the bookmarklet (no install)

1. Open InternTrack → **Settings → Integrations → Bookmarklet**.
2. Drag the **Add to InternTrack** button onto your bookmarks bar.
   (Or copy the code and create a bookmark whose URL is the copied text.)
3. On any job posting, click the bookmark. InternTrack opens with the form
   prefilled.

Works in every desktop browser, including Safari and Firefox, with no developer
account and no extension store.

## Option 2 — the extension (load unpacked)

Gives you a toolbar button and a right-click menu item instead of a bookmark.

### Chrome / Edge / Brave / Arc

1. Visit `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin the extension, open its popup once, and set **Your InternTrack URL** to
   wherever you run the app (defaults to the hosted demo).

Chromium keeps unpacked extensions across restarts, but shows a “developer mode
extensions” notice on launch — that is the free path, and it is expected.

### Firefox

Firefox lists extensions for free. To try it locally:

1. Visit `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on** → pick `extension/manifest.json`.

A temporary add-on is removed when Firefox closes; a permanent install needs a
free signature from `addons.mozilla.org`.

### Icons

`manifest.json` references `icon-16.png`, `icon-48.png` and `icon-128.png`. The
extension loads and works without them — Chromium substitutes a default icon and
logs a warning. Drop in three PNGs at those sizes (the app's `public/icon-192.png`
scaled down is the obvious source) to remove the warning.

---

## What gets captured

| Field | Source |
|---|---|
| Company | JSON-LD `hiringOrganization`, else `og:site_name`, else the hostname |
| Role | JSON-LD `title`, else the part of the page title before “at” / “-” |
| Platform | The site's hostname |
| Compensation | JSON-LD `baseSalary`, when the posting publishes one |
| Notes | The posting description plus the source URL |

Anything the page does not publish comes through blank — the form is yours to
finish. Nothing is ever saved without you submitting it.

## Not included, on purpose

Scraping LinkedIn or Indeed job pages is against their terms of service, so
neither the bookmarklet nor the extension tries to defeat a login wall or parse
private markup. On those sites, copy the posting text and use **Quick add** in
the app — Scout parses pasted text into the same fields.
