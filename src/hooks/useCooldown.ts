import { useEffect, useRef, useState } from 'react';

/** Countdown in seconds for "resend code" style actions. */
export function useCooldown(seconds = 60) {
  const [remaining, setRemaining] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const start = (duration = seconds) => {
    setRemaining(duration);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          if (timer.current) clearInterval(timer.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  return { remaining, start, active: remaining > 0 };
}
