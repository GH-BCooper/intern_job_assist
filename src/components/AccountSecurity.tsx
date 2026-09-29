import { useState } from 'react';
import { Check, Eye, EyeOff, KeyRound, Loader2, LogOut, Mail, Pencil, ShieldCheck, UserCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import OtpInput from './ui/OtpInput';
import PasswordStrengthMeter from './ui/PasswordStrengthMeter';
import { useCooldown } from '../hooks/useCooldown';
import { toast } from '../lib/uiBus';

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Mail;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500/15 to-accent-500/15 border border-primary-300/50 dark:border-primary-900 flex items-center justify-center flex-shrink-0">
          <Icon size={16} className="text-primary-600 dark:text-primary-400" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-light-900 dark:text-white">{title}</h2>
          <p className="text-xs text-light-600 dark:text-dark-300 mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ResendLink({ onResend, cooldown }: { onResend: () => void; cooldown: ReturnType<typeof useCooldown> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (cooldown.active || busy) return;
        setBusy(true);
        await onResend();
        setBusy(false);
      }}
      disabled={cooldown.active || busy}
      className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
    >
      {busy ? 'Sending…' : cooldown.active ? `Resend code in ${cooldown.remaining}s` : 'Resend code'}
    </button>
  );
}

export default function AccountSecurity() {
  const {
    user,
    updateDisplayName,
    requestEmailChange,
    verifyEmailChangeOtp,
    resendEmailChangeOtp,
    requestPasswordChangeOtp,
    confirmPasswordChange,
    signOutEverywhere,
  } = useAuth();

  const displayName = (user?.user_metadata?.name as string | undefined) || '';
  const currentEmail = user?.email || '';

  /* ---------------- display name ---------------- */
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const [savingName, setSavingName] = useState(false);

  const saveName = async () => {
    if (!nameInput.trim()) return;
    setSavingName(true);
    const { error } = await updateDisplayName(nameInput.trim());
    setSavingName(false);
    if (error) {
      toast(error, 'error');
      return;
    }
    setEditingName(false);
    toast('Name updated.', 'success');
  };

  /* ---------------- change email (dual OTP) ---------------- */
  type EmailStep = 'idle' | 'enter' | 'verify';
  const [emailStep, setEmailStep] = useState<EmailStep>('idle');
  const [newEmail, setNewEmail] = useState('');
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [oldCode, setOldCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [oldVerified, setOldVerified] = useState(false);
  const [newVerified, setNewVerified] = useState(false);
  const [verifyingOld, setVerifyingOld] = useState(false);
  const [verifyingNew, setVerifyingNew] = useState(false);
  const emailCooldown = useCooldown(45);

  const resetEmailFlow = () => {
    setEmailStep('idle');
    setNewEmail('');
    setEmailError('');
    setOldCode('');
    setNewCode('');
    setOldVerified(false);
    setNewVerified(false);
  };

  const submitNewEmail = async () => {
    const trimmed = newEmail.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setEmailError('Enter a valid email address.');
      return;
    }
    if (trimmed.toLowerCase() === currentEmail.toLowerCase()) {
      setEmailError('That is already your email.');
      return;
    }
    setEmailError('');
    setEmailSubmitting(true);
    const { error } = await requestEmailChange(trimmed);
    setEmailSubmitting(false);
    if (error) {
      setEmailError(error);
      return;
    }
    setEmailStep('verify');
    emailCooldown.start();
    toast('Confirmation codes sent to both addresses.', 'success');
  };

  const verifyOld = async () => {
    if (oldCode.length !== 6) return;
    setVerifyingOld(true);
    setEmailError('');
    const { error } = await verifyEmailChangeOtp(currentEmail, oldCode);
    setVerifyingOld(false);
    if (error) {
      setEmailError(error);
      return;
    }
    setOldVerified(true);
  };

  const verifyNew = async () => {
    if (newCode.length !== 6) return;
    setVerifyingNew(true);
    setEmailError('');
    const { error } = await verifyEmailChangeOtp(newEmail.trim(), newCode);
    setVerifyingNew(false);
    if (error) {
      setEmailError(error);
      return;
    }
    setNewVerified(true);
  };

  const bothVerified = oldVerified && newVerified;

  /* ---------------- change password (reauth OTP) ---------------- */
  type PwStep = 'idle' | 'requesting' | 'verify';
  const [pwStep, setPwStep] = useState<PwStep>('idle');
  const [pwCode, setPwCode] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwShow, setPwShow] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const pwCooldown = useCooldown(45);

  const resetPwFlow = () => {
    setPwStep('idle');
    setPwCode('');
    setPwNew('');
    setPwConfirm('');
    setPwError('');
  };

  const startPwChange = async () => {
    setPwStep('requesting');
    setPwError('');
    const { error } = await requestPasswordChangeOtp();
    if (error) {
      setPwStep('idle');
      setPwError(error);
      return;
    }
    setPwStep('verify');
    pwCooldown.start();
    toast('A verification code was sent to your email.', 'success');
  };

  const submitPwChange = async () => {
    setPwError('');
    if (pwCode.length !== 6) {
      setPwError('Enter the 6-digit code.');
      return;
    }
    if (pwNew.length < 6) {
      setPwError('Password must be at least 6 characters.');
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError('Passwords do not match.');
      return;
    }
    setPwSubmitting(true);
    const { error } = await confirmPasswordChange(pwCode, pwNew);
    setPwSubmitting(false);
    if (error) {
      setPwError(error);
      return;
    }
    toast('Password changed.', 'success');
    resetPwFlow();
  };

  /* ---------------- sign out everywhere ---------------- */
  const [signingOutAll, setSigningOutAll] = useState(false);

  return (
    <>
      <Section icon={UserCircle2} title="Profile" description="How your name appears across InternTrack.">
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              className="input-field"
              placeholder="Your name"
              autoFocus
            />
            <button onClick={() => void saveName()} disabled={savingName} className="btn-primary btn-sm flex-shrink-0">
              {savingName ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-light-900 dark:text-white font-medium">{displayName || 'Add your name'}</span>
            <button
              onClick={() => {
                setNameInput(displayName);
                setEditingName(true);
              }}
              className="btn-ghost btn-sm"
            >
              <Pencil size={12} /> Edit
            </button>
          </div>
        )}
      </Section>

      <Section
        icon={Mail}
        title="Email address"
        description="Changing your email requires confirming a code from both your current and new inbox."
      >
        {emailStep === 'idle' && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-light-900 dark:text-white font-medium truncate">{currentEmail}</span>
            <button onClick={() => setEmailStep('enter')} className="btn-secondary btn-sm flex-shrink-0">
              Change
            </button>
          </div>
        )}

        {emailStep === 'enter' && (
          <div className="space-y-3">
            <div>
              <label className="label">New email address</label>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="input-field"
                placeholder="you@newdomain.com"
                autoFocus
              />
            </div>
            {emailError && (
              <div className="text-red-700 dark:text-red-400 text-xs bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
                {emailError}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => void submitNewEmail()} disabled={emailSubmitting} className="btn-primary btn-sm">
                {emailSubmitting ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                {emailSubmitting ? 'Sending codes…' : 'Send confirmation codes'}
              </button>
              <button onClick={resetEmailFlow} className="btn-ghost btn-sm">
                Cancel
              </button>
            </div>
          </div>
        )}

        {emailStep === 'verify' && (
          <div className="space-y-4">
            <p className="text-xs text-light-600 dark:text-dark-300">
              Enter both codes to confirm the change from <strong className="text-light-900 dark:text-white">{currentEmail}</strong> to{' '}
              <strong className="text-light-900 dark:text-white">{newEmail.trim()}</strong>.
            </p>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="label !mb-0">Code sent to current email</label>
                {oldVerified && <Check size={13} className="text-emerald-500" />}
              </div>
              {oldVerified ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Confirmed</p>
              ) : (
                <div className="flex items-center gap-2">
                  <OtpInput value={oldCode} onChange={setOldCode} onComplete={() => void verifyOld()} disabled={verifyingOld} autoFocus={false} />
                  <button
                    onClick={() => void verifyOld()}
                    disabled={verifyingOld || oldCode.length !== 6}
                    className="btn-secondary btn-sm flex-shrink-0"
                  >
                    {verifyingOld ? <Loader2 size={13} className="animate-spin" /> : 'Confirm'}
                  </button>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="label !mb-0">Code sent to new email</label>
                {newVerified && <Check size={13} className="text-emerald-500" />}
              </div>
              {newVerified ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Confirmed</p>
              ) : (
                <div className="flex items-center gap-2">
                  <OtpInput value={newCode} onChange={setNewCode} onComplete={() => void verifyNew()} disabled={verifyingNew} autoFocus={false} />
                  <button
                    onClick={() => void verifyNew()}
                    disabled={verifyingNew || newCode.length !== 6}
                    className="btn-secondary btn-sm flex-shrink-0"
                  >
                    {verifyingNew ? <Loader2 size={13} className="animate-spin" /> : 'Confirm'}
                  </button>
                </div>
              )}
            </div>

            {emailError && (
              <div className="text-red-700 dark:text-red-400 text-xs bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
                {emailError}
              </div>
            )}

            {bothVerified ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                <Check size={15} /> Email updated to {newEmail.trim()}
                <button onClick={resetEmailFlow} className="btn-ghost btn-sm ml-auto">
                  Done
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <ResendLink onResend={async () => { const { error } = await resendEmailChangeOtp(); if (error) toast(error, 'error'); else toast('Codes resent.', 'success'); }} cooldown={emailCooldown} />
                <button onClick={resetEmailFlow} className="btn-ghost btn-sm">
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section icon={KeyRound} title="Password" description="Changing your password sends a one-time code to your email first.">
        {pwStep === 'idle' && (
          <button onClick={() => void startPwChange()} className="btn-secondary btn-sm">
            <KeyRound size={13} /> Change password
          </button>
        )}
        {pwStep === 'requesting' && (
          <button disabled className="btn-secondary btn-sm">
            <Loader2 size={13} className="animate-spin" /> Sending code…
          </button>
        )}
        {pwStep === 'verify' && (
          <div className="space-y-3">
            <p className="text-xs text-light-600 dark:text-dark-300">Enter the code we emailed you, then choose a new password.</p>
            <OtpInput value={pwCode} onChange={setPwCode} disabled={pwSubmitting} autoFocus={false} />

            <div>
              <label className="label">New password</label>
              <div className="relative">
                <input
                  type={pwShow ? 'text' : 'password'}
                  value={pwNew}
                  onChange={e => setPwNew(e.target.value)}
                  className="input-field pr-10"
                  placeholder="Min. 6 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setPwShow(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-light-500 dark:text-dark-500"
                >
                  {pwShow ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <PasswordStrengthMeter password={pwNew} />
            </div>

            <div>
              <label className="label">Confirm new password</label>
              <input
                type={pwShow ? 'text' : 'password'}
                value={pwConfirm}
                onChange={e => setPwConfirm(e.target.value)}
                className="input-field"
                placeholder="Repeat password"
                autoComplete="new-password"
              />
            </div>

            {pwError && (
              <div className="text-red-700 dark:text-red-400 text-xs bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
                {pwError}
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button onClick={() => void submitPwChange()} disabled={pwSubmitting} className="btn-primary btn-sm">
                  {pwSubmitting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {pwSubmitting ? 'Updating…' : 'Update password'}
                </button>
                <button onClick={resetPwFlow} className="btn-ghost btn-sm">
                  Cancel
                </button>
              </div>
              <ResendLink onResend={async () => { const { error } = await requestPasswordChangeOtp(); if (error) toast(error, 'error'); else toast('New code sent.', 'success'); }} cooldown={pwCooldown} />
            </div>
          </div>
        )}
      </Section>

      <Section icon={LogOut} title="Sessions" description="Sign out of InternTrack everywhere — every browser and device — if a session may be compromised.">
        <button
          onClick={async () => {
            setSigningOutAll(true);
            try {
              await signOutEverywhere();
            } catch (e) {
              toast(
                `Could not sign out other devices: ${e instanceof Error ? e.message : 'try again'}. Change your password if you think a session is compromised.`,
                'error',
              );
            } finally {
              setSigningOutAll(false);
            }
          }}
          disabled={signingOutAll}
          className="btn-secondary btn-sm !text-red-600 dark:!text-red-400 !border-red-300 dark:!border-red-900"
        >
          {signingOutAll ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
          Sign out everywhere
        </button>
      </Section>
    </>
  );
}
