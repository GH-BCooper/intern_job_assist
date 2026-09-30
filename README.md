# InternTrack - Internship Application Management Platform

A full internship-search workspace: track applications, interview rounds and learnings, see what is actually converting, and hand the busywork to an AI assistant that can read and change your whole pipeline.

Built with React, TypeScript and Supabase — and designed so that running it costs nothing.

**[Live Demo](https://intern-job-assist.vercel.app)** · **[What's new in v4](versionFour.md)** · **[Roadmap](ROADMAP.md)** · **[Report Bug](https://github.com/GH-BCooper/intern_job_assist/issues)**

## Features

- ✨ **Scout, the AI assistant** - 46 tools give it real read/write access: add and update applications, move pipeline stages, schedule follow-ups, run analytics, draft emails, score your resume, build automations, even drive the interface. Streams its replies, takes voice input, reads answers aloud, and can read a screenshot of a job posting. Runs on your own free-tier key (Gemini, Groq, OpenRouter) or a local Ollama model.
- 🗂️ **Kanban pipeline** - Drag applications across Wishlist → Applied → In Review → Interviewing → Offer → Closed, with statuses kept in sync. Fully keyboard-operable, with swimlanes, soft WIP limits, and stages you can rename and reorder.
- 🔭 **Four views** - Board, Cards, sortable Table and Timeline, with saveable filter views. The table virtualises past 80 rows.
- 📊 **Insights** - Conversion funnel, a stage-flow Sankey that shows the backward moves a funnel can't, per-platform interview rates, 12-week cadence, day-of-week patterns, an offer projection, a momentum breakdown, activity heatmap, streaks and goal tracking.
- ↩️ **Undo** - Delete, archive and every stage move can be taken back from the toast.
- 📶 **Genuinely offline** - Writes made offline are queued in IndexedDB and flushed in order on reconnect, not lost.
- 🧠 **Prep trainer** - Your recorded interview questions become spaced-repetition flashcards (SM-2), alongside a reusable STAR story bank and a mock-interview mode.
- 🎯 **Resume ↔ job-description match** - A local keyword-coverage score naming what the posting leans on that your resume never says. No API, no upload.
- ⚡ **Automations** - 11 triggers, 12 actions, AND/OR conditions, quiet hours, a dry-run preview and 16 one-click templates. Runs entirely in your browser.
- 🔔 **Follow-ups that fire** - Quiet applications get flagged, reminders arrive as native browser notifications and can recur, interviews count down.
- 🗓️ **Calendar** - Interviews, reminders and application dates on one month view, plus .ics export into Google, Apple or Outlook.
- 🧰 **Workspace** - Tasks, reminders, markdown notes, contacts, resume versions with real files, cover-letter merge templates, tags and an activity log.
- ⌘ **Command palette** - ⌘K to jump to any application, page, view or action — or type a question and get an inline answer.
- 🎨 **Make it yours** - Five accent palettes swapped at runtime, a high-contrast variant, a base font-size slider, optional interface sounds and a guided first run.
- 🏆 **Momentum** - Achievement badges, a shareable Weekly Wrapped card, confetti on an offer, and a persistent "now" strip showing the single most relevant thing.
- 🔗 **Share read-only** - A link to your aggregate insights for a mentor or career centre. Never the applications themselves.
- 📅 **Interview rounds** - Multiple rounds per application with countdown timers and per-round timezones.
- 📄 **Documents** - Upload resumes and cover letters with PDF text extraction, served through time-limited signed URLs.
- 💾 **Exports & imports** - PDF, one-pager briefs, DOCX, CSV, JSON, .ics, a self-contained HTML portfolio and bulk ZIP; import from Huntr, Teal, Simplify or LinkedIn.
- 🔌 **Add from anywhere** - A bookmarklet that needs no extension store, or an unpacked browser extension.
- 🔐 **Privacy** - A passphrase-gated idle lock screen (checked with Web Crypto, never stored), TOTP two-factor login, backups that leave your API keys out, and a one-button data wipe that also removes uploaded files and share links. Note the passphrase locks the screen; it does not encrypt the data held in the browser.
- 📲 **Installable PWA** - Works offline via a service worker, with background sync where the browser supports it.
- 🌙 **Light & dark** - A bright, warm light mode and a low-glare dark mode.
- 🔐 **Secure authentication** - Email/password and Google sign-in via Supabase.
- 📱 **Responsive** - Desktop, tablet and mobile.

## Cost

Every layer runs on a permanent free tier — Vercel Hobby, the Supabase free tier, your own free AI key (or local Ollama), hand-rolled SVG charts, and native browser APIs for notifications, speech, audio, crypto and storage. There is no paid dependency anywhere in the stack, and [ROADMAP.md](ROADMAP.md) lists the handful of ideas that *cannot* be done for free, excluded on purpose so they don't get built by accident.

## Tech Stack

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **React Router** - Routing
- **Lucide React** - Icons

### Backend & Database
- **Supabase** - PostgreSQL database + authentication (email/password, Google, one-time codes, TOTP MFA)
- **Supabase Storage** - File uploads (resumes, cover letters, resume-version files), served through signed URLs
- **Supabase Edge Functions** - One optional function, for the subscribable calendar feed
- **Local-first store** - Tags, reminders, tasks, notes, contacts, goals, prep cards, STAR stories, templates, stage history, seasons and AI threads are kept per-user in the browser, so the whole feature set needs one optional schema change and no extra quota
- **IndexedDB** - The offline write outbox

### AI
- **Google Gemini** - native function calling (`gemini-2.0-flash`)
- **Groq / OpenRouter / Ollama** - OpenAI-compatible tool calling
- Keys are stored in your browser and sent only to the provider you pick

### Export & PDF
- **jsPDF** - PDF generation
- **DOCX** - Word document generation
- **JSZip** - ZIP file creation
- **file-saver** - File downloads
- **pdfjs-dist** - PDF text extraction

### Browser APIs used instead of dependencies
- **Web Speech** - Voice input and spoken replies
- **Web Audio** - Synthesized interface sounds, so there are no audio files to host
- **Web Crypto** - passphrase verification for the idle lock
- **Web Workers** - Analytics off the main thread for large histories
- **Background Sync** - Automation passes when the tab isn't focused
- **Canvas** - Hand-rolled confetti

### Build Tools
- **Vite** - Build tool & dev server
- **Vitest + Testing Library** - 370 tests, plus a real-browser end-to-end run
- **ESLint** - Code linting
- **PostCSS + Autoprefixer** - CSS processing

## Quick Start

### Prerequisites
- Node.js 16+ and npm
- Git

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/intern_job_assist.git
cd intern_job_assist
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Get these from your Supabase project settings → API.

4. **Start the development server**
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally (port 4173)
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking
- `npm test` - Run the test suite (370 tests)
- `npm run test:coverage` - Tests with a coverage report
- `npm run test:all` - typecheck + lint + tests + build, in that order
- `npm run smoke` - Drive the built app in your installed Chrome (run `npm run preview` first)
- `npm run e2e` - Build the app against an in-memory Supabase fake and drive the **signed-in** screens in your installed Chrome: drag and drop, undo, switch geometry, phone-width overflow, a 300-application performance check and a console-error gate. Needs no account, no network and no credentials.
- `npm run e2e:monkey` - A randomised session against the same build (`MONKEY_STEPS`, `MONKEY_SEED`): random clicks, keystrokes and form input across every page, failing on any crash, error boundary, blank page or console error.
- `npm run setup:supabase -- sbp_token` - Apply pending migrations and deploy the calendar feed
- `npm run icons:extension` - Regenerate the browser extension's icons from the PWA icon

### Supabase setup (already applied to the hosted project)

Share links and the subscribable calendar feed need one migration and one Edge
Function. Both are automated behind a single token, and re-running is safe:

1. Open <https://supabase.com/dashboard/account/tokens> and generate a token
2. `npm run setup:supabase -- sbp_your_token_here`

It applies every pending migration through the Management API (so no database
password is needed), deploys `calendar-feed` with `--use-api` (so Docker isn't
needed either), then writes a real share row, reads it back through both public
surfaces and deletes it — proving the whole path rather than assuming it. The
token is used for that run only and is never written to disk.

If it hasn't been run against a given project, everything else still works;
share links simply explain that they aren't set up yet.

## Database Schema

### Applications Table
```sql
- id (uuid, primary key)
- user_id (uuid, foreign key)
- company_name (varchar)
- role_applied_to (varchar)
- platform_applied_on (varchar) - LinkedIn, Company Website, etc.
- company_description (text)
- response_status (varchar) - Pending, Viewed, Rejected, Shortlisted, Offered
- final_status (varchar) - In Progress, Rejected, Accepted, Withdrawn
- date_applied (date)
- salary_info (text)
- interview_questions (text)
- tasks_to_complete (text)
- interview_offered (boolean)
- resume_used (varchar)
- resume_path (varchar)
- cover_letter_used (varchar)
- cover_letter_path (varchar)
- created_at, updated_at (timestamptz)
```

### Interview Dates Table
```sql
- id (uuid, primary key)
- application_id (uuid, foreign key)
- user_id (uuid, foreign key)
- interview_date (date)
- label (varchar) - Round 1, Round 2, etc.
- created_at (timestamptz)
```

### Interview Learnings Table
```sql
- id (uuid, primary key)
- application_id (uuid, foreign key)
- user_id (uuid, foreign key)
- learnings (text) - What you learned from the interview
- questions_asked (text) - Questions you were asked
- created_at, updated_at (timestamptz)
```

## Project Structure

```
src/
├── components/               # UI
│   ├── ApplicationCard/Detail/Form.tsx
│   ├── AssistantPanel.tsx    # Scout: streaming, voice, images, provider A/B
│   ├── CommandPalette.tsx    # ⌘K, with inline Scout answers
│   ├── BoardView/TableView/TimelineView (views/)
│   ├── NowStrip.tsx          # the persistent "most relevant thing" bar
│   ├── FocusMode.tsx         # distraction-free prep, with a Pomodoro
│   ├── CompareView.tsx       # side-by-side offer comparison
│   ├── WrappedCard.tsx       # shareable week in review (PNG)
│   ├── QuickAdd.tsx          # paste a posting, get a filled form
│   ├── Onboarding.tsx        # guided first run
│   ├── LockScreen.tsx        # idle auto-lock
│   └── ui/                   # BentoTile, Charts, Sankey, JourneyStepper,
│                             # CompanyLogo, MatchScore, BadgeShelf,
│                             # AccentPicker, EmptyArt, Toaster, Markdown
├── context/                  # Auth, Theme (+ accent/contrast/font), Data, AI
├── pages/                    # Home, Login, Register, ResetPassword, Dashboard,
│                             # Insights, CalendarPage, Workspace, Prep,
│                             # Automations, Settings, Shared
├── hooks/                    # useStore, useAlerts, useAutomations, useAnalytics,
│                             # useAutoLock, useOnlineStatus, useCooldown
├── lib/
│   ├── store.ts              # the local-first store (types + mutations)
│   ├── insights.ts           # analytics, Sankey, timing, projection, wrapped
│   ├── automation.ts         # the rules engine
│   ├── outbox.ts             # IndexedDB offline write queue
│   ├── undo.ts               # undo stack
│   ├── ics.ts                # RFC 5545 calendar generation
│   ├── match.ts              # resume ↔ JD scoring
│   ├── srs.ts                # SM-2 spaced repetition
│   ├── badges.ts  accent.ts  fx.ts  vault.ts  speech.ts  i18n.ts
│   ├── logo.ts  duplicates.ts  importPresets.ts  portfolio.ts  onePager.ts
│   ├── share.ts  bookmarklet.ts  tips.ts  uiBus.ts  format.ts
│   ├── analytics.worker.ts   # computeAnalytics off the main thread
│   ├── ai/                   # agent.ts, providers.ts, tools.ts (46 tools)
│   └── supabase.ts           # client, types, storage helpers
├── utils/                    # export, pdf and zip helpers
├── App.tsx  main.tsx  index.css
└── *.test.ts(x)              # 370 tests, colocated with what they cover

extension/                    # unpacked MV3 "Add to InternTrack" extension
supabase/
├── migrations/               # database migrations
└── functions/calendar-feed/  # optional subscribable .ics feed
```

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com)
3. Import your GitHub repository
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy!

The app uses a `vercel.json` configuration for proper SPA routing.

### Other Platforms

For deployment to other platforms (Netlify, GitHub Pages, etc.), ensure:
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables are configured in your deployment platform

## Usage

### Creating an Application
1. Click "Add Application" on the dashboard
2. Fill in the application details:
   - Company name (required)
   - Role applied to
   - Platform applied on (LinkedIn, Company Website, etc.)
   - Upload resume and/or cover letter
   - Set response status and final status
   - Add interview dates if offered
3. Click "Add Application"

### Searching & Filtering
- **Search** by company name
- **Filter** by response status
- **Filter** by platform applied on
- **Sort** by recent, oldest, or interview dates

### Exporting
- **Single Application**: Click the application detail → "Download ZIP"
- **All Applications**: Click "Export All" button → choose PDF or DOCX

## Security & Privacy

- All data is encrypted in transit (HTTPS)
- Row-level security (RLS) ensures users can only access their own data
- Authentication is handled by Supabase Auth
- Files are stored securely in Supabase Storage

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with [React](https://react.dev)
- Database by [Supabase](https://supabase.com)
- UI components with [Lucide](https://lucide.dev)
- Styling with [Tailwind CSS](https://tailwindcss.com)
- Deployed on [Vercel](https://vercel.com)

## Support

If you have any questions or need help, please:
- Open an issue on GitHub
- Check existing issues for similar problems
- Read the Supabase documentation

---

© 2026 Made with ❤️ by Brett Cooper
