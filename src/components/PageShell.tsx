import type { ReactNode } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';

export default function PageShell({
  title,
  subtitle,
  actions,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  usePageTitle(title);

  return (
    <div className="min-h-screen pt-16 flex flex-col">
      <div className={`flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 py-7 ${wide ? 'max-w-[110rem]' : 'max-w-7xl'}`}>
        <header className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-light-900 dark:text-white tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-light-600 dark:text-dark-300 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </header>
        {children}
      </div>
      <footer className="border-t border-light-300 dark:border-dark-800 py-6 px-4 mt-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 sm:pr-44">
          <p className="text-light-600 dark:text-dark-400 text-xs">
            © {new Date().getFullYear()} Made with ❤️ by Brett Cooper
          </p>
          <p className="text-light-600 dark:text-dark-400 text-[11px]">
            InternTrack v4 · runs entirely on free tiers
          </p>
        </div>
      </footer>
    </div>
  );
}
