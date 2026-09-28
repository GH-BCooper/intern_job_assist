import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotificationCenter from './NotificationCenter';
import { emitUi } from '../lib/uiBus';
import { avatarGradient, initials } from '../lib/format';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/insights', label: 'Insights', icon: TrendingUp },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/workspace', label: 'Workspace', icon: FolderKanban },
  { to: '/automations', label: 'Automations', icon: Zap },
];

export default function Navbar() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const displayName = (user?.user_metadata?.name as string | undefined) || user?.email || '';

  return (
    <nav className="fixed top-0 left-0 right-0 z-[80] bg-light-100/85 dark:bg-dark-950/85 backdrop-blur-xl border-b border-light-300 dark:border-dark-800">
      <div className="max-w-[110rem] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          <Link to={user ? '/dashboard' : '/'} className="flex items-center gap-2.5 group flex-shrink-0">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-soft group-hover:shadow-glow transition-shadow">
              <Sparkles size={16} className="text-white" />
            </span>
            <span className="font-bold text-light-900 dark:text-white text-lg tracking-tight">
              Intern<span className="text-gradient">Track</span>
            </span>
          </Link>

          {user && (
            <div className="hidden md:flex items-center gap-1 flex-1">
              {NAV.map(item => {
                const Icon = item.icon;
                const active = location.pathname === item.to;
                return (
                  <Link key={item.to} to={item.to} className={`tab ${active ? 'tab-active' : ''}`}>
                    <Icon size={14} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {user ? (
              <>
                <button
                  onClick={() => emitUi({ type: 'open-palette' })}
                  className="btn-ghost btn-icon hidden sm:inline-flex"
                  title="Search everything  (⌘K)"
                  aria-label="Search"
                >
                  <Search size={17} />
                </button>
                <NotificationCenter />
                <button
                  onClick={toggleTheme}
                  className="btn-ghost btn-icon"
                  title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                  aria-label="Toggle theme"
                >
                  {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
                </button>
                <Link
                  to="/settings"
                  className={`btn-ghost btn-icon hidden sm:inline-flex ${
                    location.pathname === '/settings' ? 'text-primary-600 dark:text-primary-400' : ''
                  }`}
                  title="Settings"
                  aria-label="Settings"
                >
                  <SettingsIcon size={17} />
                </Link>

                <div className="hidden lg:flex items-center gap-2 pl-2 ml-1 border-l border-light-300 dark:border-dark-800">
                  <span
                    className={`w-7 h-7 rounded-lg bg-gradient-to-br ${avatarGradient(displayName)} flex items-center justify-center text-white text-[11px] font-bold`}
                  >
                    {initials(displayName)}
                  </span>
                  <button onClick={handleSignOut} className="btn-ghost btn-icon" title="Sign out" aria-label="Sign out">
                    <LogOut size={16} />
                  </button>
                </div>

                <button
                  onClick={() => setMobileOpen(o => !o)}
                  className="btn-ghost btn-icon md:hidden"
                  aria-label="Menu"
                  aria-expanded={mobileOpen}
                >
                  {mobileOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
              </>
            ) : (
              <>
                <button onClick={toggleTheme} className="btn-ghost btn-icon" aria-label="Toggle theme">
                  {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
                </button>
                <Link to="/login" className="btn-ghost text-sm">
                  Log in
                </Link>
                <Link to="/register" className="btn-primary !px-4 !py-2">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {user && mobileOpen && (
        <div className="md:hidden border-t border-light-300 dark:border-dark-800 bg-light-100 dark:bg-dark-950 animate-fade-in">
          <div className="px-4 py-3 space-y-1">
            {[...NAV, { to: '/settings', label: 'Settings', icon: SettingsIcon }].map(item => {
              const Icon = item.icon;
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium ${
                    active
                      ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300'
                      : 'text-light-700 dark:text-dark-200'
                  }`}
                >
                  <Icon size={15} />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
