/**
 * Self-contained exports you can hand to someone else.
 *
 * A single HTML file (no assets, no CDN, no account) summarising the search for
 * a career centre or mentor, and a printable career-fair leave-behind list of
 * target companies. Both are generated in the browser from data already loaded.
 */

import type { Application, InterviewDate } from './supabase';
import type { StoreShape } from './store';
import type { Analytics } from './insights';
import { stageOf } from './insights';
import { fmtDate } from './format';

function esc(value: string): string {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STYLE = `
  :root { color-scheme: light dark; --ink:#231C11; --muted:#7C6851; --line:#F3E7D3; --bg:#FEF7EC; --card:#fff; --brand:#FB923C; --brand2:#FF7E7E; }
  @media (prefers-color-scheme: dark) {
    :root { --ink:#F7F1E8; --muted:#A9A0A0; --line:#3A3324; --bg:#1B170E; --card:#2A2417; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:40px 20px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background:var(--bg); color:var(--ink); line-height:1.5; }
  .wrap { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 30px; margin:0 0 4px; letter-spacing:-.02em; }
  h2 { font-size: 15px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:36px 0 12px; }
  .sub { color:var(--muted); margin:0 0 28px; font-size:14px; }
  .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(130px,1fr)); gap:12px; }
  .tile { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px 16px; }
  .tile b { display:block; font-size:26px; line-height:1.1; font-variant-numeric: tabular-nums; }
  .tile span { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
  table { width:100%; border-collapse:collapse; font-size:13px; background:var(--card); border:1px solid var(--line); border-radius:14px; overflow:hidden; }
  th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); padding:10px 12px; border-bottom:1px solid var(--line); }
  td { padding:10px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
  tr:last-child td { border-bottom:none; }
  .bar { height:8px; border-radius:99px; background:linear-gradient(90deg,var(--brand),var(--brand2)); }
  .track { height:8px; border-radius:99px; background:var(--line); overflow:hidden; }
  .pill { display:inline-block; padding:2px 8px; border-radius:99px; font-size:11px; font-weight:600; background:var(--line); }
  footer { margin-top:40px; padding-top:16px; border-top:1px solid var(--line); font-size:11px; color:var(--muted); }
  .note { font-size:13px; color:var(--muted); margin:6px 0 0; }
  @media print { body { background:#fff; padding:0; } .tile, table { border-color:#ddd; } }
`;

export type PortfolioOptions = {
  ownerName: string;
  /** Company names only, no notes or contacts — this file may be shared onward. */
  includeCompanies: boolean;
  title?: string;
};

/**
 * A shareable one-file summary of the search.
 *
 * Deliberately excludes notes, contacts and salary details: the point is to
 * show effort and results to a mentor without handing over private records.
 */
export function buildPortfolioHtml(
  applications: Application[],
  analytics: Analytics,
  store: StoreShape,
  opts: PortfolioOptions,
): string {
  const title = opts.title || `${opts.ownerName || 'My'} internship search`;

  const stats = [
    ['Applications', analytics.total],
    ['Interviews', analytics.interviews],
    ['Offers', analytics.offers],
    ['Interview rate', `${analytics.interviewRate}%`],
    ['Best streak', `${analytics.bestStreak}d`],
    ['Momentum', analytics.momentum],
  ] as [string, string | number][];

  const platforms = analytics.byPlatform.slice(0, 8);
  const maxPlatform = Math.max(1, ...platforms.map(p => p.total));

  const companies = opts.includeCompanies
    ? applications
        .slice()
        .sort((a, b) => a.company_name.localeCompare(b.company_name))
        .map(app => ({
          name: app.company_name,
          role: app.role_applied_to,
          stage: stageOf(app, store.stageOverrides),
          applied: fmtDate(app.date_applied),
        }))
    : [];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <h1>${esc(title)}</h1>
  <p class="sub">Generated ${esc(fmtDate(new Date().toISOString()))} from InternTrack · figures are counts, not estimates</p>

  <h2>At a glance</h2>
  <div class="grid">
    ${stats.map(([label, value]) => `<div class="tile"><b>${esc(String(value))}</b><span>${esc(label)}</span></div>`).join('\n    ')}
  </div>

  <h2>Pipeline</h2>
  <table>
    <tr><th>Stage</th><th>Applications</th><th></th></tr>
    ${Object.entries(analytics.byStage)
      .map(([stage, count]) => {
        const pct = analytics.total ? Math.round((count / analytics.total) * 100) : 0;
        return `<tr><td>${esc(stage)}</td><td>${count}</td><td style="width:45%"><div class="track"><div class="bar" style="width:${pct}%"></div></div></td></tr>`;
      })
      .join('\n    ')}
  </table>

  ${platforms.length
    ? `<h2>Where the applications went</h2>
  <table>
    <tr><th>Platform</th><th>Applications</th><th>Interviews</th><th>Rate</th><th></th></tr>
    ${platforms
      .map(
        p =>
          `<tr><td>${esc(p.platform)}</td><td>${p.total}</td><td>${p.interviews}</td><td>${p.rate}%</td>` +
          `<td style="width:30%"><div class="track"><div class="bar" style="width:${Math.round((p.total / maxPlatform) * 100)}%"></div></div></td></tr>`,
      )
      .join('\n    ')}
  </table>`
    : ''}

  ${analytics.topRoles.length
    ? `<h2>Roles targeted</h2>
  <p>${analytics.topRoles.map(r => `<span class="pill">${esc(r.role)} · ${r.count}</span>`).join(' ')}</p>`
    : ''}

  ${companies.length
    ? `<h2>Companies (${companies.length})</h2>
  <table>
    <tr><th>Company</th><th>Role</th><th>Stage</th><th>Applied</th></tr>
    ${companies
      .map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.role)}</td><td>${esc(c.stage)}</td><td>${esc(c.applied)}</td></tr>`)
      .join('\n    ')}
  </table>`
    : ''}

  <footer>
    Exported from InternTrack. Contains no notes, contacts or compensation details.
  </footer>
</div>
</body>
</html>`;
}

/** The career-fair leave-behind: target companies and why, printable on one page. */
export function buildLeaveBehindHtml(
  targets: { company: string; role: string; why: string }[],
  ownerName: string,
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(ownerName || 'My')} target companies</title>
<style>${STYLE}
  .target { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px 16px; margin-bottom:10px; }
  .target h3 { margin:0 0 2px; font-size:15px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>${esc(ownerName || 'My')} target companies</h1>
  <p class="sub">${targets.length} companies · prepared ${esc(fmtDate(new Date().toISOString()))}</p>
  ${targets
    .map(
      t => `<div class="target">
    <h3>${esc(t.company)}${t.role ? ` — ${esc(t.role)}` : ''}</h3>
    <p class="note">${esc(t.why || 'Shortlisted in my tracker.')}</p>
  </div>`,
    )
    .join('\n  ')}
  <footer>Generated by InternTrack</footer>
</div>
</body>
</html>`;
}

/** Everything schedulable about the search, as a static HTML download. */
export function downloadHtml(filename: string, html: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.html') ? filename : `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens a print dialog for a generated document without leaving the app. */
export function printHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const done = () => {
    setTimeout(() => frame.remove(), 500);
  };
  frame.contentWindow?.addEventListener('afterprint', done);
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(done, 3000);
  }, 250);
}

/** Interview counts per application, used by the one-pager PDF header. */
export function roundCount(interviewsMap: Record<string, InterviewDate[]>, id: string): number {
  return (interviewsMap[id] || []).length;
}
