# InternTrack - Internship Application Management Platform

A modern, full-stack web application for tracking internship applications, interview dates, and learnings. Built with React, TypeScript, and Supabase, InternTrack helps you stay organized throughout your internship search journey.

**[Live Demo](https://intern-job-assist.vercel.app)** · **[Report Bug](https://github.com/yourusername/intern_job_assist/issues)**

## Features

- 🎯 **Track Applications** - Log companies, roles, platforms, dates, and response statuses
- 📅 **Monitor Interviews** - Track multiple interview rounds per application with countdown timers
- 📄 **Document Management** - Upload and store resumes and cover letters with PDF support
- 📊 **Dashboard Overview** - Visualize all applications with filters and sorting
- 💾 **Export Records** - Download applications as PDF or DOCX files, with bulk ZIP exports
- 🌙 **Dark Mode** - Built-in dark/light theme support
- 🔐 **Secure Authentication** - User authentication with Supabase
- 📱 **Responsive Design** - Works seamlessly on desktop, tablet, and mobile

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
