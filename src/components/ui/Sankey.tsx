import { useMemo } from 'react';
import { STAGES, type StageFlow } from '../../lib/insights';

const COLORS: Record<string, string> = {
  Wishlist: '#A99175',
  Applied: '#38BDF8',
  'In Review': '#A78BFA',
  Interviewing: '#FB923C',
  Offer: '#34D399',
  Closed: '#FF7E7E',
};

/**
 * Stage-flow diagram, hand-rolled SVG in the same spirit as Charts.tsx.
 *
 * Unlike the funnel, this shows real movement — including backward moves, which
 * are drawn in a warmer tone because Interviewing → Closed is the single most
 * informative edge in the chart.
 */
export default function Sankey({ flow, height = 260 }: { flow: StageFlow; height?: number }) {
  const width = 640;
  const nodeWidth = 13;
  const gap = 10;

  const layout = useMemo(() => {
    const columns = STAGES.filter(s => flow.totals[s] > 0 || flow.links.some(l => l.from === s || l.to === s));
    if (!columns.length) return null;

    const step = columns.length > 1 ? (width - nodeWidth) / (columns.length - 1) : 0;
    const maxTotal = Math.max(1, ...columns.map(s => flow.totals[s] || 0));
    const usable = height - 40;

    const nodes = columns.map((stage, i) => {
      const value = flow.totals[stage] || 0;
      const h = Math.max(14, (value / maxTotal) * (usable - gap));
      return {
        stage,
        x: i * step,
        y: 20 + (usable - h) / 2,
        h,
        value,
      };
    });

    const byStage = new Map<string, (typeof nodes)[number]>(nodes.map(n => [n.stage as string, n]));

    // Stack the ribbons leaving and entering each node so they don't overlap.
    const outCursor = new Map<string, number>();
    const inCursor = new Map<string, number>();

    const ribbons = flow.links
      .filter(l => byStage.has(l.from) && byStage.has(l.to))
      .map(link => {
        const from = byStage.get(link.from)!;
        const to = byStage.get(link.to)!;
        const outTotal = flow.links.filter(l => l.from === link.from).reduce((s, l) => s + l.count, 0) || 1;
        const inTotal = flow.links.filter(l => l.to === link.to).reduce((s, l) => s + l.count, 0) || 1;
        const thickness = Math.max(2, (link.count / Math.max(outTotal, inTotal)) * Math.min(from.h, to.h));

        const oy = from.y + (outCursor.get(link.from) || 0);
        const iy = to.y + (inCursor.get(link.to) || 0);
        outCursor.set(link.from, (outCursor.get(link.from) || 0) + thickness);
        inCursor.set(link.to, (inCursor.get(link.to) || 0) + thickness);

        const x1 = from.x + nodeWidth;
        const x2 = to.x;
        const mid = (x1 + x2) / 2;

        return {
          key: `${link.from}-${link.to}`,
          d:
            `M${x1},${oy} C${mid},${oy} ${mid},${iy} ${x2},${iy} ` +
            `L${x2},${iy + thickness} C${mid},${iy + thickness} ${mid},${oy + thickness} ${x1},${oy + thickness} Z`,
          color: link.backward ? '#FF7E7E' : COLORS[link.from] || '#FB923C',
          opacity: link.backward ? 0.32 : 0.24,
          label: `${link.from} → ${link.to}: ${link.count}`,
        };
      });

    return { nodes, ribbons };
  }, [flow, height]);

  if (!layout) {
    return (
      <p className="text-sm text-light-500 dark:text-dark-400 py-8 text-center">
        Move a few cards between stages and their real path will show up here.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto no-scrollbar">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[34rem]" style={{ height }} role="img" aria-label="Stage flow">
        {layout.ribbons.map(r => (
          <path key={r.key} d={r.d} fill={r.color} opacity={r.opacity}>
            <title>{r.label}</title>
          </path>
        ))}
        {layout.nodes.map(n => (
          <g key={n.stage}>
            <rect x={n.x} y={n.y} width={nodeWidth} height={n.h} rx={3} fill={COLORS[n.stage] || '#FB923C'}>
              <title>{`${n.stage}: ${n.value}`}</title>
            </rect>
            <text
              x={n.x + nodeWidth / 2}
              y={12}
              textAnchor="middle"
              fontSize="9.5"
              className="fill-light-600 dark:fill-dark-300"
            >
              {n.stage}
            </text>
            <text
              x={n.x + nodeWidth / 2}
              y={n.y + n.h + 12}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              className="fill-light-900 dark:fill-white"
            >
              {n.value}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex items-center gap-4 mt-1 text-[10px] text-light-500 dark:text-dark-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm bg-primary-400/40" /> Forward moves
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm bg-accent-400/50" /> Moved backward
        </span>
      </div>
    </div>
  );
}
