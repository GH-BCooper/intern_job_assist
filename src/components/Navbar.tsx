import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { BookOpen, LogOut, LayoutDashboard, Sun, Moon } from 'lucide-react';

export default function Navbar() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-light-50 dark:bg-dark-900/95 backdrop-blur-sm border-b border-light-300 dark:border-dark-600 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
              <BookOpen size={18} className="text-green-400" />
            </div>
            <span className="font-semibold text-light-900 dark:text-white text-lg tracking-tight">
              Intern<span className="text-green-400">Track</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden sm:block text-light-600 dark:text-slate-400 text-sm">
                  {user.user_metadata?.name || user.email}
                </span>
                {location.pathname !== '/dashboard' && (
                  <Link to="/dashboard" className="btn-secondary py-2 px-4">
                    <LayoutDashboard size={15} />
                    Dashboard
                  </Link>
                )}
                <button onClick={signOut} className="btn-secondary py-2 px-4">
                  <LogOut size={15} />
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-light-700 dark:text-slate-300 hover:text-light-900 dark:hover:text-white text-sm font-medium transition-colors px-3 py-2"
                >
                  Log In
                </Link>
                <Link to="/register" className="btn-primary py-2 px-4">
                  Get Started
                </Link>
              </>
            )}

            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-light-700 dark:text-slate-400 hover:text-light-900 dark:hover:text-white hover:bg-light-200 dark:hover:bg-dark-700 transition-colors"
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
