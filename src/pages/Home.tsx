import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle, ArrowRight, BarChart2, Shield, FileText } from 'lucide-react';

const FEATURES = [
  {
    icon: <BarChart2 size={20} className="text-green-400" />,
    title: 'Track every application',
    desc: 'Log companies, dates, statuses, and responses — all in one organized dashboard.',
  },
  {
    icon: <CheckCircle size={20} className="text-green-400" />,
    title: 'Monitor interview progress',
    desc: 'Know exactly which companies offered interviews, your final standing, and next steps.',
  },
  {
    icon: <FileText size={20} className="text-green-400" />,
    title: 'Upload & manage documents',
    desc: 'Keep track of resumes and cover letters with PDF uploads and organized storage.',
  },
  {
    icon: <Shield size={20} className="text-green-400" />,
    title: 'Track interview dates',
    desc: 'Record multiple interview rounds per application with countdown timers.',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-light-50 dark:bg-dark-900 transition-colors">
      {/* Hero */}
      <section className="flex-1 flex items-center justify-center px-4 pt-24 pb-20 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-green-500/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/4 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-3xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-sm font-medium mb-8">
            <BookOpen size={14} />
            Your internship command center
          </div>

          {/* Heading */}
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-light-900 dark:text-white leading-tight mb-6">
            Intern<span className="text-gradient">Track</span>
          </h1>

          <p className="text-xl sm:text-2xl text-light-600 dark:text-slate-400 font-light mb-4 leading-relaxed">
            Your internship journey,{' '}
            <span className="text-light-900 dark:text-slate-200 font-normal">organized and effortless.</span>
          </p>

          <p className="text-light-700 dark:text-slate-500 text-base mb-10 max-w-xl mx-auto">
            Stop losing track of applications in spreadsheets and sticky notes. InternTrack
            gives you a clean, fast dashboard to manage your entire internship search.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-green-500 hover:bg-green-400 text-white font-semibold rounded-xl transition-all duration-200 text-base shadow-lg shadow-green-500/20 hover:shadow-green-500/30 hover:-translate-y-0.5"
            >
              Log In / Try It Out
              <ArrowRight size={18} />
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-light-200 dark:bg-dark-700 hover:bg-light-300 dark:hover:bg-dark-600 text-light-900 dark:text-slate-200 font-semibold rounded-xl border border-light-300 dark:border-dark-600 hover:dark:border-green-500/30 transition-all duration-200 text-base hover:-translate-y-0.5"
            >
              Create Free Account
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-light-100 dark:bg-dark-800/50 border-t border-light-300 dark:border-dark-700 transition-colors">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-light-600 dark:text-slate-500 text-sm font-medium uppercase tracking-widest mb-3">
            Everything you need
          </p>
          <h2 className="text-center text-3xl font-bold text-light-900 dark:text-white mb-12">
            Built for serious applicants
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {FEATURES.map(({ icon, title, desc }) => (
              <div
                key={title}
                className="card p-6 border-light-300 dark:border-dark-600 hover:border-green-500/20 dark:hover:border-green-500/20 hover:shadow-lg hover:shadow-green-500/5 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center mb-4">
                  {icon}
                </div>
                <h3 className="font-semibold text-light-900 dark:text-white text-base mb-2">{title}</h3>
                <p className="text-light-600 dark:text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-light-900 dark:text-white mb-4">Ready to get organized?</h2>
          <p className="text-light-600 dark:text-slate-400 mb-8">
            Create your free account and start tracking your first application in under a minute.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-green-500 hover:bg-green-400 text-white font-semibold rounded-xl transition-all duration-200 text-base shadow-lg shadow-green-500/20 hover:-translate-y-0.5"
          >
            Get Started — It's Free
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-light-300 dark:border-dark-700 py-8 px-4 transition-colors">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-green-400" />
            <span className="font-semibold text-light-900 dark:text-white text-sm">
              Intern<span className="text-green-400">Track</span>
            </span>
          </div>
          <p className="text-light-600 dark:text-slate-600 text-sm">
            Built to help students land great internships.
          </p>
        </div>
      </footer>
    </div>
  );
}
