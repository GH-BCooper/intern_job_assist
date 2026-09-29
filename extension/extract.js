/**
 * Runs in the page and reads what the page itself already published.
 *
 * Only structured data the site puts in its own markup is used — JSON-LD
 * JobPosting, Open Graph tags, the document title. No DOM scraping of private
 * or paywalled content, and nothing site-specific, so this stays within what a
 * "share this page" button would do.
 */
(() => {
  const text = (value) => (typeof value === 'string' ? value.trim() : '');

  const meta = (selector) => text(document.querySelector(selector)?.getAttribute('content'));

  /** JSON-LD is the best source when a job board publishes it. */
  const fromJsonLd = () => {
    const nodes = [...document.querySelectorAll('script[type="application/ld+json"]')];
    for (const node of nodes) {
      let parsed;
      try {
        parsed = JSON.parse(node.textContent || '');
      } catch {
        continue;
      }
      const candidates = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] || [])];
      for (const item of candidates) {
        if (!item || typeof item !== 'object') continue;
        const type = item['@type'];
        const isJob = type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'));
        if (!isJob) continue;

        const org = item.hiringOrganization;
        const salary = item.baseSalary?.value;
        const money = salary
          ? [salary.minValue, salary.maxValue].filter(Boolean).join('–') +
            (salary.unitText ? ` per ${String(salary.unitText).toLowerCase()}` : '')
          : '';

        return {
          company_name: text(typeof org === 'string' ? org : org?.name),
          role_applied_to: text(item.title),
          salary_info: money,
          company_description: text(item.description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000),
        };
      }
    }
    return null;
  };

  const fromMeta = () => {
    const ogTitle = meta('meta[property="og:title"]') || document.title || '';
    const ogSite = meta('meta[property="og:site_name"]');
    const ogDescription = meta('meta[property="og:description"]') || meta('meta[name="description"]');

    // Titles are usually "Role at Company" or "Role - Company | Board".
    const split = ogTitle.split(/\s+(?:at|@|[-–|·])\s+/);
    return {
      company_name: text(split[1]) || ogSite || location.hostname.replace(/^www\./, ''),
      role_applied_to: text(split[0]),
      company_description: ogDescription,
      salary_info: '',
    };
  };

  const base = fromJsonLd() || fromMeta();

  return {
    ...base,
    platform_applied_on: location.hostname.replace(/^www\./, ''),
    source_url: location.href,
  };
})();
