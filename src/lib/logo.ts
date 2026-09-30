/**
 * Company logo resolution through keyless, free endpoints.
 *
 * Google's favicon service and DuckDuckGo's icon service both answer on a bare
 * domain with no key and no quota paperwork. Either can 404, so every consumer
 * keeps the existing gradient-initials avatar as the fallback.
 *
 * Clearbit's free logo endpoint used to be first in this list; it has been
 * retired, so every card paid for one failed request before reaching a source
 * that works.
 */

/** Companies whose domain is not simply `name.com`. */
const KNOWN: Record<string, string> = {
  google: 'google.com',
  alphabet: 'google.com',
  meta: 'meta.com',
  facebook: 'meta.com',
  amazon: 'amazon.com',
  aws: 'aws.amazon.com',
  microsoft: 'microsoft.com',
  apple: 'apple.com',
  netflix: 'netflix.com',
  stripe: 'stripe.com',
  shopify: 'shopify.com',
  atlassian: 'atlassian.com',
  salesforce: 'salesforce.com',
  linkedin: 'linkedin.com',
  uber: 'uber.com',
  airbnb: 'airbnb.com',
  spotify: 'spotify.com',
  nvidia: 'nvidia.com',
  intel: 'intel.com',
  ibm: 'ibm.com',
  oracle: 'oracle.com',
  adobe: 'adobe.com',
  figma: 'figma.com',
  notion: 'notion.so',
  vercel: 'vercel.com',
  supabase: 'supabase.com',
  anthropic: 'anthropic.com',
  openai: 'openai.com',
  deloitte: 'deloitte.com',
  accenture: 'accenture.com',
  infosys: 'infosys.com',
  wipro: 'wipro.com',
  tcs: 'tcs.com',
  'tata consultancy services': 'tcs.com',
  zoho: 'zoho.com',
  flipkart: 'flipkart.com',
  swiggy: 'swiggy.com',
  zomato: 'zomato.com',
  razorpay: 'razorpay.com',
  paytm: 'paytm.com',
  'goldman sachs': 'goldmansachs.com',
  'jp morgan': 'jpmorgan.com',
  jpmorgan: 'jpmorgan.com',
  'morgan stanley': 'morganstanley.com',
};

const SUFFIXES = /\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|plc|pvt|private|technologies|technology|labs|group|holdings|solutions|systems|software|india|usa)\b/g;

/** Best-effort domain guess for a company name. */
export function guessDomain(companyName: string): string | null {
  const raw = (companyName || '').trim().toLowerCase();
  if (!raw) return null;

  // Already a domain or URL.
  const urlMatch = raw.match(/([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/);
  if (urlMatch && raw.includes('.')) return urlMatch[1];

  if (KNOWN[raw]) return KNOWN[raw];

  // "Nestlé" must become "nestle", not "nestl": strip accents (and fold the few
  // letters that do not decompose) before anything else is discarded. A name that
  // is still not Latin afterwards (Japanese, Arabic…) has no guessable domain, and
  // guessing from the few ASCII letters left would show some other company's logo.
  const folded = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/[łŀ]/g, 'l')
    .replace(/đ/g, 'd');
  if (/[\u0080-￿]/.test(folded.replace(/[^\p{L}]/gu, ''))) return null;
  const cleaned = folded.replace(/[^a-z0-9 &-]/g, ' ').replace(SUFFIXES, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  if (KNOWN[cleaned]) return KNOWN[cleaned];

  const slug = cleaned.replace(/[\s&-]+/g, '');
  if (slug.length < 2) return null;
  return `${slug}.com`;
}

export type LogoSource = { url: string; label: string };

/** Ordered candidate URLs — consumers fall through on error. */
export function logoSources(companyName: string): LogoSource[] {
  const domain = guessDomain(companyName);
  if (!domain) return [];
  return [
    { url: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`, label: 'Favicon' },
    { url: `https://icons.duckduckgo.com/ip3/${domain}.ico`, label: 'DuckDuckGo' },
  ];
}
