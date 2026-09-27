# InternTrack - Internship Application Management Platform

A full internship-search workspace: track applications, interview rounds and learnings, see what is actually converting, and hand the busywork to an AI assistant that can read and change your whole pipeline.

Built with React, TypeScript and Supabase — and designed so that running it costs nothing.

**[Live Demo](https://intern-job-assist.vercel.app)** · **[What's new in v2](versionTwo.md)** · **[Report Bug](https://github.com/GH-BCooper/intern_job_assist/issues)**

## Features

- ✨ **Scout, the AI assistant** - 34 tools give it real read/write access: add and update applications, move pipeline stages, schedule follow-ups, run analytics, draft emails, even drive the interface. Runs on your own free-tier key (Gemini, Groq, OpenRouter) or a local Ollama model.
- 🗂️ **Kanban pipeline** - Drag applications across Wishlist → Applied → In Review → Interviewing → Offer → Closed, with statuses kept in sync.
- 🔭 **Four views** - Board, Cards, sortable Table and Timeline, with saveable filter views.
- 📊 **Insights** - Conversion funnel, per-platform interview rates, 12-week cadence, activity heatmap, streaks, momentum score and goal tracking.
- 🔔 **Follow-ups that fire** - Quiet applications get flagged, reminders arrive as native browser notifications, interviews count down.
- 🗓️ **Calendar** - Interviews, reminders and application dates on one month view.
- 🧰 **Workspace** - Tasks, reminders, markdown notes, contacts, resume versions, tags and an activity log.
- ⌘ **Command palette** - ⌘K to jump to any application, page, view or action.
- 📅 **Interview rounds** - Multiple rounds per application with countdown timers.
- 📄 **Documents** - Upload resumes and cover letters, with PDF text extraction.
- 💾 **Exports** - PDF, DOCX, CSV, JSON and bulk ZIP with attachments; JSON import.
- 📲 **Installable PWA** - Works offline via a service worker.
- 🌙 **Light & dark** - A bright, warm light mode and a low-glare dark mode.
- 🔐 **Secure authentication** - Email/password and Google sign-in via Supabase.
- 📱 **Responsive** - Desktop, tablet and mobile.

## Cost

Every layer runs on a permanent free tier — Vercel Hobby, the Supabase free tier, your own free AI key (or local Ollama), hand-rolled SVG charts and native browser notifications. There is no paid dependency anywhere in the stack.

## Tech Stack

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **React Router** - Routing
- **Lucide React** - Icons

### Backend & Database
- **Supabase** - PostgreSQL database + authentication
- **Supabase Storage** - File uploads (resumes, cover letters)
- **Local-first store** - Tags, reminders, tasks, notes, contacts, goals and AI threads are kept per-user in the browser, so v2 needs no schema change and no extra quota

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

### Build Tools
- **Vite** - Build tool & dev server
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
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

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
├── components/          # Reusable React components
│   ├── ApplicationCard.tsx
│   ├── ApplicationDetail.tsx
│   ├── ApplicationForm.tsx
│   ├── Navbar.tsx
│   └── PrintAllButton.tsx
├── context/            # React Context (Auth, Theme)
│   ├── AuthContext.tsx
│   └── ThemeContext.tsx
├── pages/              # Page components
│   ├── Dashboard.tsx
│   ├── Home.tsx
│   ├── Login.tsx
│   └── Register.tsx
├── lib/
│   └── supabase.ts     # Supabase client & types
├── utils/              # Utility functions
│   ├── exportUtils.ts
│   ├── pdfUtils.ts
│   └── zipExportUtils.ts
├── App.tsx             # Main app component
├── main.tsx            # Entry point
└── index.css           # Global styles

supabase/
└── migrations/         # Database migrations
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
