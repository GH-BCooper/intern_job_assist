import { useEffect } from 'react';

/**
 * Calls `onEscape` when Escape is pressed while the calling component is mounted.
 *
 * Every overlay closes on Escape; the comparison and week-in-review cards were the
 * two that did not, which left a keyboard user with no way out but tabbing to the
 * close button.
 */
export function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape]);
}
