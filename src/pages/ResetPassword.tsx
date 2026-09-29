import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { Sparkles, Loader2, ArrowLeft, KeyRound, Check } from 'lucide-react';
import OtpInput from '../components/ui/OtpInput';
import PasswordStrengthMeter from '../components/ui/PasswordStrengthMeter';
import { useCooldown } from '../hooks/useCooldown';
import { toast } from '../lib/uiBus';

function Logo() {
  return (
    <Link to="/" className="inline-flex items-center gap-2 group">
      <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-soft group-hover:shadow-glow transition-shadow">
        <Sparkles size={20} className="text-white" />
      </span>
      <span className="font-bold text-light-900 dark:text-white text-2xl tracking-tight">
        Intern<span className="text-gradient">Track</span>
      </span>
    </Link>
  );
}

type Mode = 'request' | 'verify' | 'done';

export default function ResetPassword() {
  usePageTitle('Reset password');
  const { requestPasswordReset, verifyPasswordResetOtp, resendPasswordResetOtp, setNewPassword } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resending, setResending] = useState(false);
  const cooldown = useCooldown(45);

  const submitRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Enter the email on your account.');
      return;
    }
    setError('');
    setSending(true);
    const { error: err } = await requestPasswordReset(email.trim());
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    setMode('verify');
    cooldown.start();
  };

  const handleResend = async () => {
    if (cooldown.active) return;
    setResending(true);
    setError('');
    const { error: err } = await resendPasswordResetOtp(email.trim());
    setResending(false);
    if (err) {
      setError(err);
      return;
    }
    cooldown.start();
    toast('A new code is on its way.', 'success');
  };

  const submitVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (code.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    if (newPw.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      setError('Passwords do not match.');
      return;
    }
    setResetting(true);
    const { error: verifyErr } = await verifyPasswordResetOtp(email.trim(), code);
    if (verifyErr) {
      setResetting(false);
      setError(verifyErr);
      return;
    }
    const { error: pwErr } = await setNewPassword(newPw);
    setResetting(false);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    setMode('done');
    toast('Password updated.', 'success');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Logo />
          {mode === 'request' && (
            <>
              <h1 className="mt-6 text-2xl font-bold text-light-900 dark:text-white">Reset your password</h1>
              <p className="text-light-600 dark:text-dark-400 text-sm mt-1">We'll email you a 6-digit code</p>
            </>
          )}
          {mode === 'verify' && (
            <>
              <h1 className="mt-6 text-2xl font-bold text-light-900 dark:text-white">Enter the code</h1>
              <p className="text-light-600 dark:text-dark-400 text-sm mt-1">
                Sent to <span className="font-semibold text-light-800 dark:text-dark-200">{email}</span>
              </p>
            </>
          )}
          {mode === 'done' && (
            <>
              <h1 className="mt-6 text-2xl font-bold text-light-900 dark:text-white">All set</h1>
              <p className="text-light-600 dark:text-dark-400 text-sm mt-1">Your password has been updated</p>
            </>
          )}
        </div>

        <div className="card p-8">
          {mode === 'request' && (
            <form onSubmit={submitRequest} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">Email Address</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {error && (
                <div className="text-red-700 dark:text-red-400 text-sm bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-4 py-2.5">
                  {error}
                </div>
              )}

              <button type="submit" disabled={sending} className="btn-primary w-full py-3">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                {sending ? 'Sending code...' : 'Send reset code'}
              </button>

              <Link
                to="/login"
                className="w-full flex items-center justify-center gap-1.5 text-xs text-light-500 dark:text-dark-400 hover:text-light-800 dark:hover:text-dark-200"
              >
                <ArrowLeft size={12} /> Back to sign in
              </Link>
            </form>
          )}

          {mode === 'verify' && (
            <form onSubmit={submitVerify} className="space-y-5">
              <OtpInput value={code} onChange={setCode} disabled={resetting} />

              <div>
                <label className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">New password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Min. 6 characters"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  autoComplete="new-password"
                />
                <PasswordStrengthMeter password={newPw} />
              </div>

              <div>
                <label className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">Confirm new password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Repeat password"
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <div className="text-red-700 dark:text-red-400 text-sm bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-4 py-2.5">
                  {error}
                </div>
              )}

              <button type="submit" disabled={resetting} className="btn-primary w-full py-3">
                {resetting && <Loader2 size={16} className="animate-spin" />}
                {resetting ? 'Updating...' : 'Update password'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={cooldown.active || resending}
                  className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
                >
                  {resending ? 'Sending…' : cooldown.active ? `Resend code in ${cooldown.remaining}s` : 'Resend code'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMode('request');
                  setCode('');
                  setError('');
                }}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-light-500 dark:text-dark-400 hover:text-light-800 dark:hover:text-dark-200"
              >
                <ArrowLeft size={12} /> Use a different email
              </button>
            </form>
          )}

          {mode === 'done' && (
            <div className="space-y-5 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-300/50 dark:border-emerald-900 flex items-center justify-center">
                <Check size={22} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-sm text-light-600 dark:text-dark-300">
                You're signed in with your new password on this device.
              </p>
              <button onClick={() => navigate('/dashboard')} className="btn-primary w-full py-3">
                Go to dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
