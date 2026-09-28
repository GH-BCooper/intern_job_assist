import { scorePassword } from '../../lib/password';

export default function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const { score, label, color } = scorePassword(password);

  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i < score ? color : 'bg-light-300 dark:bg-dark-700'}`}
          />
        ))}
      </div>
      {label && <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1">{label}</p>}
    </div>
  );
}
