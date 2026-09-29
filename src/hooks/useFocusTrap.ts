import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps the keyboard inside a modal while it is open.
 *
 * On open it moves focus into the dialog (unless something in it already has
 * focus, e.g. an `autoFocus` input), Tab and Shift+Tab wrap at the ends instead
 * of walking out into the page behind, and on close focus returns to whatever
 * opened it. Without this, a keyboard user opening a card was left tabbing
 * through the dimmed board underneath.
 */
export function useFocusTrap(ref: RefObject<HTMLElement>, active = true) {
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const previous = document.activeElement as HTMLElement | null;
    if (!node.contains(document.activeElement)) {
      const first = node.querySelector<HTMLElement>(FOCUSABLE);
      if (first) first.focus({ preventScroll: true });
      else {
        node.tabIndex = -1;
        node.focus({ preventScroll: true });
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        el => el.offsetParent !== null || el === document.activeElement,
      );
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const inside = node.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      // Only hand focus back if nothing else has claimed it in the meantime.
      if (previous && document.contains(previous) && (!document.activeElement || document.activeElement === document.body || node.contains(document.activeElement))) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [ref, active]);
}
