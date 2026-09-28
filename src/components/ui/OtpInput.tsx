import { useEffect, useRef } from 'react';

const LENGTH = 6;

export default function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] || '');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDigit = (i: number, raw: string) => {
    const clean = raw.replace(/\D/g, '');
    if (!clean) {
      const next = value.slice(0, i) + value.slice(i + 1);
      onChange(next);
      return;
    }
    const chars = clean.split('');
    const next = (value.slice(0, i) + chars.join('') + value.slice(i + 1)).slice(0, LENGTH);
    onChange(next);
    const landing = Math.min(i + chars.length, LENGTH - 1);
    refs.current[landing]?.focus();
    if (next.length === LENGTH) onComplete?.(next);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < LENGTH - 1) {
      e.preventDefault();
      refs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    e.preventDefault();
    const clean = text.replace(/\D/g, '').slice(0, LENGTH);
    if (!clean) return;
    onChange(clean);
    const landing = Math.min(clean.length, LENGTH - 1);
    refs.current[landing]?.focus();
    if (clean.length === LENGTH) onComplete?.(clean);
  };

  return (
    <div className="flex items-center justify-center gap-2" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={LENGTH}
          value={d}
          disabled={disabled}
          onChange={e => setDigit(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          className="w-11 h-12 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-xl border border-light-300 dark:border-dark-600 bg-white dark:bg-dark-800 text-light-900 dark:text-white focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 outline-none transition-all disabled:opacity-50"
        />
      ))}
    </div>
  );
}
