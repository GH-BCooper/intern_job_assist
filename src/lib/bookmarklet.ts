/**
 * The "Add to InternTrack" bookmarklet.
 *
 * A bookmarklet needs no extension store, no developer account and no $5 fee —
 * it is a bookmark whose URL is javascript. It reads only what the page
 * publishes about itself (JSON-LD JobPosting, Open Graph tags, the title) and
 * passes the fields in the URL **hash**, which browsers never send to a server.
 */

/** Source of the injected snippet, kept readable here and minified on export. */
const SOURCE = `(function(){
  function text(v){ return typeof v === 'string' ? v.trim() : ''; }
  function meta(sel){ var el = document.querySelector(sel); return el ? text(el.getAttribute('content')) : ''; }
  function fromJsonLd(){
    var nodes = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < nodes.length; i++) {
      var parsed;
      try { parsed = JSON.parse(nodes[i].textContent || ''); } catch (e) { continue; }
      var items = Array.isArray(parsed) ? parsed : [parsed].concat(parsed['@graph'] || []);
      for (var j = 0; j < items.length; j++) {
        var item = items[j];
        if (!item || typeof item !== 'object') continue;
        var type = item['@type'];
        var isJob = type === 'JobPosting' || (Array.isArray(type) && type.indexOf('JobPosting') >= 0);
        if (!isJob) continue;
        var org = item.hiringOrganization;
        var salary = item.baseSalary && item.baseSalary.value;
        var money = salary ? [salary.minValue, salary.maxValue].filter(Boolean).join('-') : '';
        return {
          company_name: text(typeof org === 'string' ? org : org && org.name),
          role_applied_to: text(item.title),
          salary_info: money,
          company_description: text(item.description).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').slice(0, 3000)
        };
      }
    }
    return null;
  }
  function fromMeta(){
    var title = meta('meta[property="og:title"]') || document.title || '';
    var site = meta('meta[property="og:site_name"]');
    var desc = meta('meta[property="og:description"]') || meta('meta[name="description"]');
    var parts = title.split(/\\s+(?:at|@|[-\\u2013|\\u00b7])\\s+/);
    return {
      company_name: text(parts[1]) || site || location.hostname.replace(/^www\\./, ''),
      role_applied_to: text(parts[0]),
      salary_info: '',
      company_description: desc
    };
  }
  var f = fromJsonLd() || fromMeta();
  var payload = {
    company_name: f.company_name || '',
    role_applied_to: f.role_applied_to || '',
    platform_applied_on: location.hostname.replace(/^www\\./, ''),
    salary_info: f.salary_info || '',
    company_description: [f.company_description, location.href].filter(Boolean).join('\\n\\n')
  };
  window.open('__ORIGIN__/dashboard#interntrack-add=' + encodeURIComponent(JSON.stringify(payload)), '_blank');
})();`;

/** Collapses the readable source into a single-line bookmarklet URL. */
export function bookmarkletCode(origin = typeof location !== 'undefined' ? location.origin : ''): string {
  const body = SOURCE.replace(/__ORIGIN__/g, origin.replace(/\/$/, ''))
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return `javascript:${encodeURIComponent(body)}`;
}

export const HASH_KEY = 'interntrack-add';

/**
 * Reads a bookmarklet or extension handoff out of `location.hash`.
 *
 * The hash is cleared straight away: it should never survive into a shared URL
 * or the browser history entry the user sees.
 */
export function consumeAddHash(): Record<string, string> | null {
  if (typeof location === 'undefined' || !location.hash) return null;
  const match = location.hash.match(new RegExp(`${HASH_KEY}=([^&]+)`));
  if (!match) return null;

  history.replaceState(null, '', `${location.pathname}${location.search}`);

  try {
    const parsed = JSON.parse(decodeURIComponent(match[1])) as Record<string, unknown>;
    const out: Record<string, string> = {};
    Object.entries(parsed).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim()) out[key] = value.trim().slice(0, 4000);
    });
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}
