import { useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Loader2, Lock } from 'lucide-react';
import { unlock as unlockVault, verifyPassphrase } from '../lib/vault';
import { useAuth } from '../context/AuthContext';
import { play } from '../lib/fx';

/**
 * The idle lock. Re-prompts for the vault passphrase rather than signing out, so
 * nothing is lost and the session survives.
 */
export default function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const { user, signOut } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase) return;
    setBusy(true);
    setError('');
    try {
      const valid = await verifyPassphrase(passphrase);
      if (!valid) {
        setError('That passphrase does not match.');
        return;
      }
      unlockVault(passphrase);
      play('click');
      setPassphrase('');
      onUnlocked();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[200] bg-light-200 dark:bg-dark-950 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Locked"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="ambient-mesh" />
      </div>

      <form onSubmit={submit} className="relative card p-7 w-full max-w-sm text-center animate-scale-in">
        <span className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 flex items-center justify-center mx-auto mb-4">
          <Lock size={22} />
        </span>
        <h1 className="text-lg font-bold text-light-900 dark:text-white mb-1">Locked</h1>
        <p className="text-sm text-light-600 dark:text-dark-300 mb-5">
          Idle for a while. Enter your vault passphrase to carry on{user?.email ? ` as ${user.email}` : ''}.
        </p>

        <input
          type="password"
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
          autoFocus
          placeholder="Vault passphrase"
          className="input-field text-center"
        />

        {error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>}

        <button type="submit" disabled={busy || !passphrase} className="btn-primary w-full mt-4">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />} Unlock
        </button>

        <button
          type="button"
          onClick={() => void signOut()}
          className="btn-ghost btn-sm w-full mt-2 text-light-500 dark:text-dark-400"
        >
          Sign out instead
        </button>
      </form>
    </div>
  );
}
