import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * One cell of the bento dashboard.
 *
 * `span` maps onto the `.bento-wide` / `.bento-tall` helpers in index.css rather
 * than raw grid classes, so the tile stacks predictably at phone width.
 */
export default function BentoTile({
  label,
  icon: Icon,
  span = 'normal',
  accent,
  onClick,
  children,
  footer,
  className = '',
}: {
  label?: string;
  icon?: LucideIcon;
  span?: 'normal' | 'wide' | 'full' | 'tall' | 'wide-tall';
  /** Warms the tile with the accent gradient — for the one hero tile only. */
  accent?: boolean;
  onClick?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const spanClass =
    span === 'wide'
      ? 'bento-wide'
      : span === 'full'
        ? 'bento-full'
        : span === 'tall'
        ? 'bento-tall'
        : span === 'wide-tall'
          ? 'bento-wide bento-tall'
          : '';

  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      {...(onClick ? { onClick, type: 'button' as const } : {})}
      className={`card p-4 flex flex-col text-left ${spanClass} ${
        accent ? 'bg-gradient-to-br from-primary-50 to-accent-50 dark:from-primary-950/50 dark:to-accent-950/30 border-primary-200 dark:border-primary-900/70' : ''
      } ${onClick ? 'card-hover cursor-pointer' : ''} ${className}`}
    >
      {label && (
        <div className="flex items-center gap-2 mb-2">
          {Icon && <Icon size={13} className={accent ? 'text-primary-600 dark:text-primary-400' : 'text-light-500 dark:text-dark-400'} />}
          <p className="text-[11px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400">{label}</p>
        </div>
      )}
      <div className="flex-1 min-w-0">{children}</div>
      {footer && <div className="mt-2 pt-2 border-t border-light-300/70 dark:border-dark-800">{footer}</div>}
    </Tag>
  );
}

/** The plain number-and-label tile the grid uses most. */
export function StatTile({
  label,
  value,
  icon,
  tone = 'text-light-900 dark:text-white',
  hint,
  onClick,
  span,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: string;
  hint?: string;
  onClick?: () => void;
  span?: 'normal' | 'wide' | 'full' | 'tall' | 'wide-tall';
}) {
  return (
    <BentoTile label={label} icon={icon} onClick={onClick} span={span}>
      <p className={`text-2xl font-bold tabular-nums leading-none animate-count-up ${tone}`}>{value}</p>
      {hint && <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1.5 leading-snug">{hint}</p>}
    </BentoTile>
  );
}
