/**
 * Copies text to the clipboard and reports whether it actually worked.
 *
 * `navigator.clipboard` is undefined on non-secure origins and rejects when the
 * page is not focused, and callers used to fire it and announce "Copied" either
 * way. This falls back to the legacy `execCommand` path and returns the truth so
 * the caller can say so.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
