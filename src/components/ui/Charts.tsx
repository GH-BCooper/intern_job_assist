/**
 * Hand-rolled SVG charts — no charting dependency, theme-aware, accessible.
 * Colours come from the app's warm palette so everything reads as one system.
 */

export const SERIES = ['#FB923C', '#38BDF8', '#34D399', '#A78BFA', '#FF7E7E', '#FBBF24', '#22D3EE', '#F472B6'];

export function Sparkline({
  values,
  height = 40,
  className = '',
  stroke = '#FB923C',
}: {
  values: number[];
  height?: number;
  className?: string;
  stroke?: string;
}) {
  if (!values.length) return null;
  const w = 100;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, height - (v / max) * (height - 4) - 2]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={`w-full ${className}`} style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={`sg-${stroke.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${stroke.slice(1)})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function BarChart({
  data,
  height = 160,
  color = '#FB923C',
  valueSuffix = '',
}: {
  data: { label: string; count: number }[];
  height?: number;
  color?: string;
  valueSuffix?: string;
}) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="w-full">
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => (
          <div key={`${d.label}-${i}`} className="flex-1 flex flex-col items-center justify-end gap-1 group min-w-0">
            <span className="text-[10px] font-semibold text-light-700 dark:text-dark-200 opacity-0 group-hover:opacity-100 transition-opacity">
              {d.count}
              {valueSuffix}
            </span>
            <div
              className="w-full rounded-t-md transition-all duration-300 group-hover:opacity-80"
              style={{
                height: `${Math.max((d.count / max) * (height - 26), d.count ? 3 : 1)}px`,
                background: d.count ? `linear-gradient(180deg, ${color}, ${color}88)` : 'currentColor',
                opacity: d.count ? 1 : 0.15,
              }}
              title={`${d.label}: ${d.count}`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {data.map((d, i) => (
          <span
            key={`l-${d.label}-${i}`}
            className="flex-1 text-[9px] text-center text-light-500 dark:text-dark-400 truncate"
          >
            {i % Math.ceil(data.length / 7) === 0 ? d.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Funnel({ steps }: { steps: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...steps.map(s => s.value), 1);
  return (
    <div className="space-y-2.5">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const drop = prev && prev > 0 ? Math.round((s.value / prev) * 100) : null;
        return (
          <div key={s.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-light-700 dark:text-dark-200">{s.label}</span>
              <span className="flex items-center gap-2">
                <span className="font-bold text-light-900 dark:text-white tabular-nums">{s.value}</span>
                {drop !== null && (
                  <span className="text-[10px] text-light-500 dark:text-dark-400 tabular-nums">{drop}%</span>
                )}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-light-300/70 dark:bg-dark-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max((s.value / max) * 100, s.value ? 2 : 0)}%`, background: s.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Donut({
  segments,
  size = 148,
  thickness = 18,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 flex-shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} className="stroke-light-300 dark:stroke-dark-800" />
        {total > 0 &&
          segments.map(s => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className="min-w-0">
        {centerValue !== undefined && (
          <div className="mb-2">
            <p className="text-2xl font-bold text-light-900 dark:text-white leading-none tabular-nums">{centerValue}</p>
            <p className="text-xs text-light-500 dark:text-dark-400">{centerLabel}</p>
          </div>
        )}
        <ul className="space-y-1">
          {segments
            .filter(s => s.value > 0)
            .map(s => (
              <li key={s.label} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                <span className="text-light-700 dark:text-dark-200 truncate">{s.label}</span>
                <span className="ml-auto font-semibold text-light-900 dark:text-white tabular-nums">{s.value}</span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

export function Heatmap({ data }: { data: { date: string; count: number }[] }) {
  const weeks: { date: string; count: number }[][] = [];
  data.forEach((d, i) => {
    const w = Math.floor(i / 7);
    if (!weeks[w]) weeks[w] = [];
    weeks[w].push(d);
  });
  const max = Math.max(...data.map(d => d.count), 1);
  const level = (n: number) => {
    if (!n) return 0;
    return Math.min(4, Math.ceil((n / max) * 4));
  };
  const shades = [
    'bg-light-300/60 dark:bg-dark-800',
    'bg-primary-200 dark:bg-primary-900/60',
    'bg-primary-300 dark:bg-primary-700/70',
    'bg-primary-400 dark:bg-primary-600',
    'bg-primary-600 dark:bg-primary-400',
  ];
  return (
    <div className="overflow-x-auto no-scrollbar">
      <div className="flex gap-[3px] min-w-max">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map(d => (
              <span
                key={d.date}
                title={`${d.date}: ${d.count} application${d.count === 1 ? '' : 's'}`}
                className={`w-[11px] h-[11px] rounded-[3px] ${shades[level(d.count)]}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-light-500 dark:text-dark-400">
        <span>Less</span>
        {shades.map((s, i) => (
          <span key={i} className={`w-[11px] h-[11px] rounded-[3px] ${s}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

export function Gauge({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = 52;
  const c = Math.PI * r;
  const filled = (clamped / 100) * c;
  const tone = clamped >= 70 ? '#34D399' : clamped >= 40 ? '#FB923C' : '#FF7E7E';
  return (
    <div className="flex flex-col items-center">
      <svg width="136" height="80" viewBox="0 0 136 80">
        <path d="M16 70 A52 52 0 0 1 120 70" fill="none" strokeWidth="12" strokeLinecap="round" className="stroke-light-300 dark:stroke-dark-800" />
        <path
          d="M16 70 A52 52 0 0 1 120 70"
          fill="none"
          stroke={tone}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          style={{ transition: 'stroke-dasharray .6s cubic-bezier(.22,1,.36,1)' }}
        />
        <text x="68" y="64" textAnchor="middle" className="fill-light-900 dark:fill-white" fontSize="26" fontWeight="700">
          {clamped}
        </text>
      </svg>
      <p className="text-xs text-light-600 dark:text-dark-300 -mt-1">{label}</p>
    </div>
  );
}

export function ProgressRing({ value, target, label }: { value: number; target: number; label: string }) {
  const pctRaw = target > 0 ? (value / target) * 100 : 0;
  const pct = Math.min(100, pctRaw);
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90 flex-shrink-0">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-light-300 dark:stroke-dark-800" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          stroke={pct >= 100 ? '#34D399' : '#FB923C'}
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-light-900 dark:text-white tabular-nums">
          {value} <span className="text-light-500 dark:text-dark-400 font-normal">/ {target}</span>
        </p>
        <p className="text-xs text-light-600 dark:text-dark-300 truncate">{label}</p>
      </div>
    </div>
  );
}
