import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Briefcase,
  CalendarDays,
  Download,
  FolderKanban,
  LayoutDashboard,
  Moon,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { useStore } from '../hooks/useStore';
import { emitUi, onUi } from '../lib/uiBus';
import { stageOf } from '../lib/insights';
import { downloadText, toCsv } from '../lib/ai/tools';
import { fmtDate } from '../lib/format';

type Command = {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  group: string;
  run: () => void;
};

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const { applications, refresh } = useData();
  const { theme, toggleTheme } = useTheme();
  const store = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => onUi(e => e.type === 'open-palette' && setOpen(true)), []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      navigate(to);
      setOpen(false);
    };
    const base: Command[] = [
      { id: 'ask', label: 'Ask Scout', hint: 'AI assistant', icon: Sparkles, group: 'Assistant', run: () => { emitUi({ type: 'open-assistant' }); setOpen(false); } },
      { id: 'review', label: 'Ask Scout to review my pipeline', icon: Sparkles, group: 'Assistant', run: () => { emitUi({ type: 'open-assistant', prompt: 'Review my whole pipeline and tell me the three things I should do this week.' }); setOpen(false); } },
      { id: 'followups', label: 'Schedule follow-ups for quiet applications', icon: Bell, group: 'Assistant', run: () => { emitUi({ type: 'open-assistant', prompt: 'Find every application that has gone quiet and schedule follow-up reminders for each.' }); setOpen(false); } },
      { id: 'new', label: 'Add application', hint: 'N', icon: Plus, group: 'Actions', run: () => { navigate('/dashboard'); emitUi({ type: 'new-application' }); setOpen(false); } },
      { id: 'dash', label: 'Go to Dashboard', icon: LayoutDashboard, group: 'Navigate', run: go('/dashboard') },
      { id: 'insights', label: 'Go to Insights', icon: TrendingUp, group: 'Navigate', run: go('/insights') },
      { id: 'calendar', label: 'Go to Calendar', icon: CalendarDays, group: 'Navigate', run: go('/calendar') },
      { id: 'workspace', label: 'Go to Workspace', hint: 'notes, tasks, contacts', icon: FolderKanban, group: 'Navigate', run: go('/workspace') },
      { id: 'automations', label: 'Go to Automations', hint: 'rules that run themselves', icon: Zap, group: 'Navigate', run: go('/automations') },
      { id: 'settings', label: 'Go to Settings', icon: SettingsIcon, group: 'Navigate', run: go('/settings') },
      { id: 'board', label: 'View: Board', icon: FolderKanban, group: 'Views', run: () => { navigate('/dashboard'); emitUi({ type: 'set-view', view: 'board' }); setOpen(false); } },
      { id: 'grid', label: 'View: Cards', icon: LayoutDashboard, group: 'Views', run: () => { navigate('/dashboard'); emitUi({ type: 'set-view', view: 'grid' }); setOpen(false); } },
      { id: 'table', label: 'View: Table', icon: LayoutDashboard, group: 'Views', run: () => { navigate('/dashboard'); emitUi({ type: 'set-view', view: 'table' }); setOpen(false); } },
      { id: 'timeline', label: 'View: Timeline', icon: LayoutDashboard, group: 'Views', run: () => { navigate('/dashboard'); emitUi({ type: 'set-view', view: 'timeline' }); setOpen(false); } },
      { id: 'theme', label: theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode', icon: theme === 'light' ? Moon : Sun, group: 'Actions', run: () => { toggleTheme(); setOpen(false); } },
      { id: 'csv', label: 'Export applications as CSV', icon: Download, group: 'Actions', run: () => { downloadText('interntrack.csv', toCsv(applications), 'text/csv'); setOpen(false); } },
      { id: 'json', label: 'Export applications as JSON', icon: Download, group: 'Actions', run: () => { downloadText('interntrack.json', JSON.stringify(applications, null, 2), 'application/json'); setOpen(false); } },
      { id: 'refresh', label: 'Reload from Supabase', icon: ArrowRight, group: 'Actions', run: () => { void refresh(); setOpen(false); } },
    ];

    const appCommands: Command[] = applications.slice(0, 200).map(a => ({
      id: `app-${a.id}`,
      label: a.company_name,
      hint: [a.role_applied_to, stageOf(a, store.stageOverrides), fmtDate(a.date_applied)].filter(Boolean).join(' · '),
      icon: Briefcase,
      group: 'Applications',
      run: () => {
        navigate('/dashboard');
        emitUi({ type: 'open-application', id: a.id });
        setOpen(false);
      },
    }));

    return [...base, ...appCommands];
  }, [applications, navigate, theme, toggleTheme, refresh, store.stageOverrides]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? commands.filter(c => `${c.label} ${c.hint || ''} ${c.group}`.toLowerCase().includes(q))
      : commands.filter(c => c.group !== 'Applications').concat(commands.filter(c => c.group === 'Applications').slice(0, 5));
    return filtered.slice(0, 40);
  }, [commands, query]);

  // Group by name — commands of one group are not always contiguous — and keep a
  // flat list in the same order so keyboard navigation and rendering agree.
  const { grouped, ordered } = useMemo(() => {
    const byGroup = new Map<string, Command[]>();
    results.forEach(c => {
      const existing = byGroup.get(c.group);
      if (existing) existing.push(c);
      else byGroup.set(c.group, [c]);
    });
    const groups = [...byGroup.entries()].map(([group, items]) => ({ group, items }));
    return { grouped: groups, ordered: groups.flatMap(g => g.items) };
  }, [results]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!open) return null;

  let flat = 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center pt-[12vh] px-4 animate-fade-in">
      <div className="absolute inset-0 bg-light-900/25 dark:bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl card !bg-light-100 dark:!bg-dark-950 shadow-lift overflow-hidden animate-scale-in">
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-light-300 dark:border-dark-800">
          <Search size={17} className="text-light-500 dark:text-dark-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex(i => Math.min(i + 1, ordered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex(i => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                ordered[index]?.run();
              }
            }}
            placeholder="Search applications, jump to a page, run a command…"
            className="flex-1 bg-transparent text-sm text-light-900 dark:text-white placeholder-light-500 dark:placeholder-dark-500 focus:outline-none"
          />
          <span className="kbd">esc</span>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
          {ordered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-light-500 dark:text-dark-400">No matches.</p>
          )}
          {grouped.map(g => (
            <div key={g.group} className="mb-1">
              <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-light-500 dark:text-dark-500">
                {g.group}
              </p>
              {g.items.map(c => {
                const i = flat;
                flat += 1;
                const active = i === index;
                const Icon = c.icon;
                return (
                  <button
                    key={c.id}
                    data-active={active}
                    onMouseEnter={() => setIndex(i)}
                    onClick={c.run}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      active ? 'bg-primary-50 dark:bg-primary-950/40' : ''
                    }`}
                  >
                    <Icon size={15} className={active ? 'text-primary-600 dark:text-primary-400' : 'text-light-500 dark:text-dark-400'} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-light-900 dark:text-white truncate">{c.label}</span>
                      {c.hint && <span className="block text-[11px] text-light-500 dark:text-dark-400 truncate">{c.hint}</span>}
                    </span>
                    {active && <ArrowRight size={13} className="text-primary-500 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 px-4 h-9 border-t border-light-300 dark:border-dark-800 text-[10px] text-light-500 dark:text-dark-500">
          <span className="flex items-center gap-1">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> navigate
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">↵</span> run
          </span>
          <span className="ml-auto flex items-center gap-1">
            <span className="kbd">⌘K</span> anywhere
          </span>
        </div>
      </div>
    </div>
  );
}
