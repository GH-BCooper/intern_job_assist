import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { Sparkles, Loader2, Eye, EyeOff, Mail, ArrowLeft, ShieldCheck } from 'lucide-react';
import OtpInput from '../components/ui/OtpInput';
import PasswordStrengthMeter from '../components/ui/PasswordStrengthMeter';
import { useCooldown } from '../hooks/useCooldown';
import { toast } from '../lib/uiBus';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.23c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

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

export default function Register() {
  usePageTitle('Create account');
  const { signUp, signInWithGoogle, verifySignupOtp, resendSignupOtp } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<'form' | 'otp'>('form');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const cooldown = useCooldown(45);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email || !password) {
      setError('All fields are required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const { error: err, sessionCreated } = await signUp(email, password, name.trim());
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    if (sessionCreated) {
      // Email confirmation is off for this project — the account is ready immediately.
      navigate('/dashboard');
      return;
    }
    setStep('otp');
    cooldown.start();
  };

  const handleVerify = async (value?: string) => {
    const token = value ?? code;
    if (token.length !== 6) return;
    setError('');
    setVerifying(true);
    const { error: err } = await verifySignupOtp(email, token);
    setVerifying(false);
    if (err) {
      setError(err);
      return;
    }
    toast('Email verified — welcome to InternTrack.', 'success');
    navigate('/dashboard');
  };

  const handleResend = async () => {
    if (cooldown.active) return;
    setResending(true);
    setError('');
    const { error: err } = await resendSignupOtp(email);
    setResending(false);
    if (err) {
      setError(err);
      return;
    }
    cooldown.start();
    toast('A new code is on its way.', 'success');
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    const { error: err } = await signInWithGoogle();
    if (err) {
      setError(err);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Logo />
          {step === 'form' ? (
            <>
              <h1 className="mt-6 text-2xl font-bold text-light-900 dark:text-white">Create your account</h1>
              <p className="text-light-600 dark:text-dark-400 text-sm mt-1">Free forever -- start tracking in seconds</p>
            </>
          ) : (
            <>
              <h1 className="mt-6 text-2xl font-bold text-light-900 dark:text-white">Check your email</h1>
              <p className="text-light-600 dark:text-dark-400 text-sm mt-1">
                Enter the 6-digit code we sent to <span className="font-semibold text-light-800 dark:text-dark-200">{email}</span>
              </p>
            </>
          )}
        </div>

        <div className="card p-8">
          {step === 'form' ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <button
                type="button"
                onClick={handleGoogle}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 px-5 py-3 bg-white dark:bg-dark-700 border border-light-300 dark:border-dark-600 rounded-lg text-light-900 dark:text-dark-200 font-medium text-sm hover:bg-light-100 dark:hover:bg-dark-600 hover:border-light-400 dark:hover:border-dark-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {googleLoading ? <Loader2 size={18} className="animate-spin" /> : <GoogleIcon />}
                Sign up with Google
              </button>

              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-light-300 dark:bg-dark-600" />
                <span className="text-xs text-light-500 dark:text-dark-500 font-medium">or</span>
                <div className="flex-1 h-px bg-light-300 dark:bg-dark-600" />
              </div>

              <div>
                <label className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">Full Name</label>
                <input
                  className="input-field"
                  placeholder="Your name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">Email Address</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="input-field pr-10"
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-light-500 dark:text-dark-500 hover:text-light-900 dark:hover:text-dark-300 transition-colors"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <PasswordStrengthMeter password={password} />
              </div>

              <div>
                <label className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">Confirm Password</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input-field"
                  placeholder="Repeat password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <div className="text-red-700 dark:text-red-400 text-sm bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-4 py-2.5">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-primary-500/15 to-accent-500/15 border border-primary-300/50 dark:border-primary-900 flex items-center justify-center">
                <Mail size={20} className="text-primary-600 dark:text-primary-400" />
              </div>

              <OtpInput value={code} onChange={setCode} onComplete={handleVerify} disabled={verifying} />

              {error && (
                <div className="text-red-700 dark:text-red-400 text-sm bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-4 py-2.5 text-center">
                  {error}
                </div>
              )}

              <button
                onClick={() => handleVerify()}
                disabled={verifying || code.length !== 6}
                className="btn-primary w-full py-3"
              >
                {verifying ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                {verifying ? 'Verifying...' : 'Verify & continue'}
              </button>

              <div className="text-center">
                <button
                  onClick={handleResend}
                  disabled={cooldown.active || resending}
                  className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
                >
                  {resending ? 'Sending…' : cooldown.active ? `Resend code in ${cooldown.remaining}s` : 'Resend code'}
                </button>
              </div>

              <button
                onClick={() => {
                  setStep('form');
                  setCode('');
                  setError('');
                }}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-light-500 dark:text-dark-400 hover:text-light-800 dark:hover:text-dark-200"
              >
                <ArrowLeft size={12} /> Use a different email
              </button>
            </div>
          )}
        </div>

        {step === 'form' && (
          <p className="text-center text-light-600 dark:text-dark-500 text-sm mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
