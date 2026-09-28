export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
};

/** Lightweight heuristic scorer — no external deps, good enough to steer users away from weak passwords. */
export function scorePassword(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: '', color: 'bg-light-300 dark:bg-dark-700' };

  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;

  const capped = Math.min(4, Math.floor(score * 0.8)) as 0 | 1 | 2 | 3 | 4;

  const levels: Record<number, { label: string; color: string }> = {
    0: { label: 'Very weak', color: 'bg-red-500' },
    1: { label: 'Weak', color: 'bg-red-500' },
    2: { label: 'Fair', color: 'bg-amber-500' },
    3: { label: 'Good', color: 'bg-emerald-500' },
    4: { label: 'Strong', color: 'bg-emerald-600' },
  };

  return { score: capped, label: levels[capped].label, color: levels[capped].color };
}
