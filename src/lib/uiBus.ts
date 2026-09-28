/**
 * Tiny pub/sub the AI assistant and command palette use to drive the UI
 * (navigate, open records, change views) without prop drilling.
 */

export type UiEvent =
  | { type: 'navigate'; to: string }
  | { type: 'open-application'; id: string }
  | { type: 'set-view'; view: string }
  | { type: 'set-filters'; filters: Record<string, string> }
  | { type: 'new-application'; prefill?: Record<string, unknown> }
  | { type: 'open-assistant'; prompt?: string }
  | { type: 'open-palette' }
  | { type: 'toast'; level: 'info' | 'success' | 'error'; message: string; undoId?: string }
  | { type: 'refresh' }
  | { type: 'set-theme'; theme: 'light' | 'dark' }
  /** Distraction-free single-application shell. */
  | { type: 'open-focus'; id: string }
  /** The shareable week-in-review card. */
  | { type: 'open-wrapped' }
  /** Side-by-side offer comparison for the given applications. */
  | { type: 'compare'; ids: string[] }
  /** Board grouping within a column. */
  | { type: 'set-swimlane'; swimlane: 'none' | 'platform' | 'tag' | 'priority' }
  /** Pre-filled quick-add from a pasted job description. */
  | { type: 'quick-add'; text: string }
  /** First-run guided onboarding. */
  | { type: 'open-onboarding' }
  /** Screen-reader announcement, routed to the app's aria-live region. */
  | { type: 'announce'; message: string };

type Handler = (e: UiEvent) => void;

const handlers = new Set<Handler>();

export function onUi(fn: Handler) {
  handlers.add(fn);
  return () => {
    handlers.delete(fn);
  };
}

export function emitUi(e: UiEvent) {
  handlers.forEach(h => {
    try {
      h(e);
    } catch {
      /* a broken listener must not stop the rest */
    }
  });
}

export function toast(message: string, level: 'info' | 'success' | 'error' = 'info') {
  emitUi({ type: 'toast', level, message });
}

/**
 * Announces a state change to assistive technology.
 *
 * Toasts and stage moves were purely visual; this routes the same words into a
 * polite aria-live region so screen readers hear them too.
 */
export function announce(message: string) {
  emitUi({ type: 'announce', message });
}

/**
 * Events aimed at the dashboard can arrive while another route is mounted — the
 * assistant navigates and acts in the same tick. Those are parked here and
 * replayed by the dashboard as soon as it mounts.
 */
const pending: UiEvent[] = [];

const DEFERRABLE = new Set([
  'open-application',
  'set-view',
  'set-filters',
  'new-application',
  'open-focus',
  'compare',
  'quick-add',
]);

let dashboardMounted = false;

/** The dashboard registers itself so deferrable events are only parked when it is absent. */
export function setDashboardMounted(value: boolean) {
  dashboardMounted = value;
}

export function emitDeferrable(e: UiEvent) {
  if (!dashboardMounted && DEFERRABLE.has(e.type)) pending.push(e);
  emitUi(e);
}

export function consumePending(): UiEvent[] {
  return pending.splice(0, pending.length);
}
