/**
 * Hand-drawn empty states — inline line-art SVG, no image hosting and no asset
 * pipeline. `currentColor` throughout, so each one inherits the theme.
 */

type ArtProps = { className?: string; size?: number };

const STROKE = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function EmptyInbox({ className = '', size = 96 }: ArtProps) {
  return (
    <svg viewBox="0 0 120 96" width={size} height={size * 0.8} className={className} aria-hidden>
      <g {...STROKE}>
        <path d="M18 46 33 22h54l15 24v28a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6V46Z" />
        <path d="M18 46h24l6 10h24l6-10h24" />
        <path d="M46 14c4-5 10-7 14-3M70 12c3-4 8-5 11-2" strokeDasharray="3 4" />
      </g>
      <circle cx="60" cy="62" r="2.4" fill="currentColor" opacity=".5" />
    </svg>
  );
}

export function EmptyTasks({ className = '', size = 96 }: ArtProps) {
  return (
    <svg viewBox="0 0 120 96" width={size} height={size * 0.8} className={className} aria-hidden>
      <g {...STROKE}>
        <rect x="26" y="14" width="68" height="70" rx="8" />
        <path d="M40 32h34M40 48h34M40 64h20" />
        <path d="M33 32l4 4 6-8M33 48l4 4 6-8" opacity=".55" />
        <path d="M94 24c6-3 12 1 12 7s-6 9-12 6" strokeDasharray="3 4" />
      </g>
    </svg>
  );
}

export function EmptyCalendar({ className = '', size = 96 }: ArtProps) {
  return (
    <svg viewBox="0 0 120 96" width={size} height={size * 0.8} className={className} aria-hidden>
      <g {...STROKE}>
        <rect x="22" y="20" width="76" height="64" rx="8" />
        <path d="M22 38h76M40 20v-8M80 20v-8" />
        <path d="M36 52h10M56 52h10M76 52h8M36 68h10M56 68h10" opacity=".6" />
      </g>
      <circle cx="80" cy="68" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 3" />
    </svg>
  );
}

export function EmptyContacts({ className = '', size = 96 }: ArtProps) {
  return (
    <svg viewBox="0 0 120 96" width={size} height={size * 0.8} className={className} aria-hidden>
      <g {...STROKE}>
        <circle cx="46" cy="36" r="13" />
        <path d="M24 78c0-13 10-22 22-22s22 9 22 22" />
        <circle cx="82" cy="42" r="9" opacity=".6" />
        <path d="M68 76c0-9 6-16 14-16s14 7 14 16" opacity=".6" />
      </g>
    </svg>
  );
}

export function EmptyNotes({ className = '', size = 96 }: ArtProps) {
  return (
    <svg viewBox="0 0 120 96" width={size} height={size * 0.8} className={className} aria-hidden>
      <g {...STROKE}>
        <path d="M30 14h44l16 16v56a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6V20a6 6 0 0 1 6-6Z" />
        <path d="M74 14v16h16" />
        <path d="M38 46h38M38 58h38M38 70h24" opacity=".6" />
      </g>
    </svg>
  );
}

export function EmptyChart({ className = '', size = 96 }: ArtProps) {
  return (
    <svg viewBox="0 0 120 96" width={size} height={size * 0.8} className={className} aria-hidden>
      <g {...STROKE}>
        <path d="M22 78h80M22 78V16" />
        <path d="M34 66h10v12H34zM54 52h10v26H54zM74 38h10v40H74z" opacity=".55" />
        <path d="M30 42c10-8 20 4 30-8s22 2 32-12" strokeDasharray="4 4" />
      </g>
    </svg>
  );
}

export function EmptyTrophy({ className = '', size = 96 }: ArtProps) {
  return (
    <svg viewBox="0 0 120 96" width={size} height={size * 0.8} className={className} aria-hidden>
      <g {...STROKE}>
        <path d="M44 16h32v18a16 16 0 0 1-32 0V16Z" />
        <path d="M44 20H32v6a12 12 0 0 0 12 12M76 20h12v6a12 12 0 0 1-12 12" />
        <path d="M60 50v14M46 78h28M52 64h16l3 14H49l3-14Z" />
        <path d="M24 12l-4-4M96 12l4-4M20 30h-6M100 30h6" opacity=".5" strokeDasharray="2 3" />
      </g>
    </svg>
  );
}

export function EmptySearch({ className = '', size = 96 }: ArtProps) {
  return (
    <svg viewBox="0 0 120 96" width={size} height={size * 0.8} className={className} aria-hidden>
      <g {...STROKE}>
        <circle cx="54" cy="42" r="22" />
        <path d="M70 58l20 22" />
        <path d="M44 42h20M54 32v20" opacity=".4" />
      </g>
    </svg>
  );
}

export const EMPTY_ART = {
  inbox: EmptyInbox,
  tasks: EmptyTasks,
  calendar: EmptyCalendar,
  contacts: EmptyContacts,
  notes: EmptyNotes,
  chart: EmptyChart,
  trophy: EmptyTrophy,
  search: EmptySearch,
};

export type EmptyArtName = keyof typeof EMPTY_ART;

/** The standard empty state: art, a line, a hint, and optionally one action. */
export default function EmptyState({
  art = 'inbox',
  title,
  hint,
  action,
}: {
  art?: EmptyArtName;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  const Art = EMPTY_ART[art];
  return (
    <div className="py-12 px-6 text-center">
      <Art className="mx-auto mb-3 text-light-400 dark:text-dark-600" />
      <h3 className="text-light-900 dark:text-white font-semibold">{title}</h3>
      {hint && <p className="text-sm text-light-600 dark:text-dark-300 mt-1 max-w-sm mx-auto leading-relaxed">{hint}</p>}
      {action && <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">{action}</div>}
    </div>
  );
}
