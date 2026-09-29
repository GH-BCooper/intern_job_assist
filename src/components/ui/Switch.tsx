/**
 * The one on/off switch used across the app.
 *
 * The knob is pinned with `left-0` before it is translated. Without an explicit
 * left edge an absolutely-positioned child of a `<button>` sits at the button's
 * centred static position, so every knob was drawn 20px too far right — the
 * "on" knob hung outside its track and the "off" knob looked switched on.
 */
export default function Switch({
  checked,
  onChange,
  label,
  className = '',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name; required because the switch itself has no text. */
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-[22px] rounded-full flex-shrink-0 transition-colors ${
        checked ? 'bg-gradient-to-r from-primary-500 to-accent-500' : 'bg-light-300 dark:bg-dark-700'
      } ${className}`}
    >
      <span
        className={`absolute top-[3px] left-0 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[21px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}
