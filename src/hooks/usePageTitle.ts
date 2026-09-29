import { useEffect } from 'react';

const DEFAULT_TITLE = 'InternTrack — Your Internship Search, Run Properly';

/**
 * Names the current screen in the tab and the history list.
 *
 * Without it the title stays on whatever index.html says, so every tab and every
 * history entry reads the same. Passing nothing restores the default, which is
 * what the marketing and auth pages want when you arrive from an app screen.
 */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · InternTrack` : DEFAULT_TITLE;
  }, [title]);
}
