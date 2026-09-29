import { Component, Suspense, lazy, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { DataProvider } from './context/DataContext';
import { AIProvider } from './context/AIContext';
import Navbar from './components/Navbar';
import AssistantPanel from './components/AssistantPanel';
import CommandPalette from './components/CommandPalette';
import Toaster from './components/ui/Toaster';
import NetworkBanner from './components/NetworkBanner';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import { emitDeferrable, onUi } from './lib/uiBus';
import { useNotificationEngine } from './hooks/useAlerts';
import { useAutomationEngine } from './hooks/useAutomations';
import { useAutoLock } from './hooks/useAutoLock';
import { consumeAddHash } from './lib/bookmarklet';
import { peekUndo, runUndo } from './lib/undo';
import LockScreen from './components/LockScreen';

// Secondary pages load on demand — the dashboard is the only route most sessions need.
const Insights = lazy(() => import('./pages/Insights'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const Workspace = lazy(() => import('./pages/Workspace'));
const Settings = lazy(() => import('./pages/Settings'));
const Automations = lazy(() => import('./pages/Automations'));
const Prep = lazy(() => import('./pages/Prep'));
const Shared = lazy(() => import('./pages/Shared'));

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  state = { hasError: false, error: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8">
          <div className="max-w-md text-center card p-8">
            <h1 className="text-xl font-bold text-light-900 dark:text-white mb-2">Something went wrong</h1>
            <p className="text-sm text-light-600 dark:text-dark-300 mb-4 font-mono bg-light-200 dark:bg-dark-900 p-3 rounded-lg border border-light-300 dark:border-dark-700 break-words">
              {this.state.error}
            </p>
            <button onClick={() => window.location.reload()} className="btn-primary">
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return !user ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

/** Bridges UI-bus navigation and theme events into router/theme state. */
function UiBridge() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  useNotificationEngine();
  useAutomationEngine();

  useEffect(
    () =>
      onUi(e => {
        if (e.type === 'navigate') navigate(e.to);
        else if (e.type === 'set-theme' && e.theme !== theme) setTheme(e.theme);
      }),
    [navigate, theme, setTheme],
  );

  /**
   * Ctrl/Cmd+Z reverses the last destructive action (a delete, a stage move).
   *
   * The undo stack existed and its toast offered the button, but the keyboard
   * shortcut its own header promises was never wired. Inside a text field the
   * key is left alone so it still undoes typing.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (!peekUndo()) return;
      e.preventDefault();
      void runUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /**
   * Handoff from the bookmarklet or the browser extension.
   *
   * They pass extracted fields in the URL hash — never sent to a server — and
   * this turns it into the same prefilled new-application form the app uses
   * everywhere else. `emitDeferrable` covers the case where the dashboard has
   * not mounted yet.
   */
  useEffect(() => {
    const prefill = consumeAddHash();
    if (!prefill) return;
    navigate('/dashboard');
    emitDeferrable({ type: 'new-application', prefill });
  }, [navigate]);

  return null;
}

/** Session auto-lock: re-prompts for the vault passphrase after idle time. */
function IdleLock() {
  const { locked, unlock } = useAutoLock();
  if (!locked) return null;
  return <LockScreen onUnlocked={unlock} />;
}

function AppShell() {
  const { user } = useAuth();

  return (
    <>
      <UiBridge />
      <Navbar />
      <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <Register />
            </PublicOnlyRoute>
          }
        />
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* Public, read-only, no account needed. */}
        <Route path="/shared/:token" element={<Shared />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/insights"
          element={
            <ProtectedRoute>
              <Insights />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <CalendarPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workspace"
          element={
            <ProtectedRoute>
              <Workspace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/automations"
          element={
            <ProtectedRoute>
              <Automations />
            </ProtectedRoute>
          }
        />
        <Route
          path="/prep"
          element={
            <ProtectedRoute>
              <Prep />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to={user ? '/dashboard' : '/'} replace />} />
      </Routes>
      </Suspense>

      {user && (
        <>
          <CommandPalette />
          <AssistantPanel />
          <IdleLock />
        </>
      )}
      <Toaster />
      <NetworkBanner />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <DataProvider>
              <AIProvider>
                <AppShell />
              </AIProvider>
            </DataProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
