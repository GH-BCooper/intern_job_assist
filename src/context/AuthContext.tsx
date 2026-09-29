import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { setStoreScope } from '../lib/store';

type Result = { error: string | null };

/**
 * True when nothing a consumer could care about differs between two users.
 *
 * Supabase hands over a brand-new `User` object on every auth event (token
 * refresh, tab refocus, cross-tab sync). Keeping the previous reference when the
 * identity is unchanged stops every context and effect keyed on `user` from
 * re-running, which used to refetch the whole pipeline and flash the board.
 */
function sameUser(a: User | null, b: User | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.updated_at === b.updated_at &&
    JSON.stringify(a.user_metadata ?? {}) === JSON.stringify(b.user_metadata ?? {})
  );
}

function mapError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already registered') || m.includes('already exists')) {
    return 'An account with this email already exists.';
  }
  if (m.includes('invalid login credentials')) return 'Invalid email or password.';
  if (m.includes('email not confirmed')) return 'Please verify your email before signing in.';
  if (m.includes('token has expired') || m.includes('otp_expired') || m.includes('expired')) {
    return 'That code has expired. Request a new one.';
  }
  if (m.includes('invalid otp') || m.includes('invalid token') || m.includes('token is invalid')) {
    return 'That code is incorrect. Double-check it and try again.';
  }
  if (m.includes('same_password')) return 'That is your current password. Choose a different one.';
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts. Wait a moment before trying again.';
  }
  return message;
}

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;

  // core auth
  signUp: (email: string, password: string, name: string) => Promise<Result & { sessionCreated: boolean }>;
  signIn: (email: string, password: string) => Promise<Result>;
  signInWithGoogle: () => Promise<Result>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;

  // signup OTP verification
  verifySignupOtp: (email: string, token: string) => Promise<Result>;
  resendSignupOtp: (email: string) => Promise<Result>;

  // forgot / reset password (OTP-based recovery)
  requestPasswordReset: (email: string) => Promise<Result>;
  verifyPasswordResetOtp: (email: string, token: string) => Promise<Result>;
  resendPasswordResetOtp: (email: string) => Promise<Result>;
  setNewPassword: (newPassword: string) => Promise<Result>;

  // change email while signed in — dual OTP (current inbox + new inbox)
  requestEmailChange: (newEmail: string) => Promise<Result>;
  verifyEmailChangeOtp: (email: string, token: string) => Promise<Result>;
  resendEmailChangeOtp: () => Promise<Result>;
  cancelEmailChange: () => void;

  // change password while signed in — reauthentication OTP
  requestPasswordChangeOtp: () => Promise<Result>;
  confirmPasswordChange: (token: string, newPassword: string) => Promise<Result>;

  // profile
  updateDisplayName: (name: string) => Promise<Result>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  /** Adopts a user without replacing an identical one (see `sameUser`). */
  const adoptUser = useCallback((next: User | null) => setUser(prev => (sameUser(prev, next) ? prev : next)), []);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 8000);

    const apply = (next: Session | null) => {
      // Scope the per-user store *before* any screen for this user renders.
      // Doing it later, in an effect, let the first render read the anonymous
      // store — so a returning user briefly looked like a first-time one and got
      // the onboarding wizard again.
      setStoreScope(next?.user?.id);
      setSession(prev => (prev && next && prev.access_token === next.access_token ? prev : next));
      adoptUser(next?.user ?? null);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      apply(session);
    }).catch(() => {
      clearTimeout(timeout);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => apply(session));

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [adoptUser]);

  const signUp = async (email: string, password: string, name: string): Promise<Result & { sessionCreated: boolean }> => {
    // A stray space (mobile keyboards add one after autocomplete) fails validation
    // with an unhelpful message, so every address is trimmed on the way in.
    email = email.trim();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) return { error: mapError(error.message), sessionCreated: false };
    return { error: null, sessionCreated: !!data.session };
  };

  const signIn = async (email: string, password: string): Promise<Result> => {
    email = email.trim();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: mapError(error.message) };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const signOutEverywhere = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    // Say so if other devices could not be signed out; "signed out everywhere"
    // must not be assumed from a request that failed.
    if (error) throw new Error(error.message);
  };

  const signInWithGoogle = async (): Promise<Result> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  // --- signup OTP ---

  const verifySignupOtp = async (email: string, token: string): Promise<Result> => {
    email = email.trim();
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    if (error) return { error: mapError(error.message) };
    return { error: null };
  };

  const resendSignupOtp = async (email: string): Promise<Result> => {
    email = email.trim();
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) return { error: mapError(error.message) };
    return { error: null };
  };

  // --- forgot / reset password ---

  const requestPasswordReset = async (email: string): Promise<Result> => {
    email = email.trim();
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return { error: mapError(error.message) };
    return { error: null };
  };

  const verifyPasswordResetOtp = async (email: string, token: string): Promise<Result> => {
    email = email.trim();
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
    if (error) return { error: mapError(error.message) };
    return { error: null };
  };

  const resendPasswordResetOtp = async (email: string): Promise<Result> => {
    email = email.trim();
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return { error: mapError(error.message) };
    return { error: null };
  };

  const setNewPassword = async (newPassword: string): Promise<Result> => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: mapError(error.message) };
    return { error: null };
  };

  // --- change email (secure, dual OTP) ---

  const requestEmailChange = async (newEmail: string): Promise<Result> => {
    newEmail = newEmail.trim();
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) return { error: mapError(error.message) };
    return { error: null };
  };

  const verifyEmailChangeOtp = async (email: string, token: string): Promise<Result> => {
    email = email.trim();
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email_change' });
    if (error) return { error: mapError(error.message) };
    const { data } = await supabase.auth.getUser();
    if (data.user) adoptUser(data.user);
    return { error: null };
  };

  const resendEmailChangeOtp = async (): Promise<Result> => {
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email;
    if (!email) return { error: 'You must be signed in.' };
    const { error } = await supabase.auth.resend({ type: 'email_change', email });
    if (error) return { error: mapError(error.message) };
    return { error: null };
  };

  const cancelEmailChange = () => {
    // Supabase has no client-side "cancel"; the pending change simply expires
    // on its own (email OTPs are short-lived) if never confirmed.
  };

  // --- change password (reauthentication OTP) ---

  const requestPasswordChangeOtp = async (): Promise<Result> => {
    const { error } = await supabase.auth.reauthenticate();
    if (error) return { error: mapError(error.message) };
    return { error: null };
  };

  const confirmPasswordChange = async (token: string, newPassword: string): Promise<Result> => {
    const { error } = await supabase.auth.updateUser({ password: newPassword, nonce: token });
    if (error) return { error: mapError(error.message) };
    return { error: null };
  };

  // --- profile ---

  const updateDisplayName = async (name: string): Promise<Result> => {
    const { data, error } = await supabase.auth.updateUser({ data: { name } });
    if (error) return { error: mapError(error.message) };
    if (data.user) adoptUser(data.user);
    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
        signOutEverywhere,
        verifySignupOtp,
        resendSignupOtp,
        requestPasswordReset,
        verifyPasswordResetOtp,
        resendPasswordResetOtp,
        setNewPassword,
        requestEmailChange,
        verifyEmailChangeOtp,
        resendEmailChangeOtp,
        cancelEmailChange,
        requestPasswordChangeOtp,
        confirmPasswordChange,
        updateDisplayName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
