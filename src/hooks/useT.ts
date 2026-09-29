import { useMemo } from 'react';
import { useStoreSelector } from './useStore';
import { translator } from '../lib/i18n';

/**
 * The translator for the language chosen in Settings.
 *
 * Until this existed the language picker stored a choice that nothing read, so
 * selecting Spanish or Hindi changed nothing on screen.
 */
export function useT() {
  const locale = useStoreSelector(s => s.preferences.locale);
  return useMemo(() => translator(locale), [locale]);
}
