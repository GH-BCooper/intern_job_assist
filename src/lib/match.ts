/**
 * Resume ↔ job-description keyword matching, entirely client-side.
 *
 * A TF-IDF-flavoured overlap score over two documents: no ML service, no API
 * key, no network. Good enough to answer the only question that matters —
 * "which words does this posting lean on that my resume never says?"
 */

const STOPWORDS = new Set(
  (
    'a an the and or but if then else for of to in on at by with from as is are was were be been being ' +
    'this that these those it its we you your our their they he she his her them i me my will would can could ' +
    'should shall may might must do does did done have has had having not no nor so than too very just also ' +
    'about into over under again further once here there when where why how all any both each few more most ' +
    'other some such only own same s t don now etc via per e g ie eg vs within across using used use uses ' +
    'work working works role position candidate candidates applicant applicants job jobs company companies ' +
    'team teams year years month months day days new strong ability able help helps helping including include ' +
    'includes required require requires requirement requirements responsibility responsibilities preferred plus ' +
    'you will who what which whom whose experience experiences skill skills knowledge familiarity ' +
    'understanding proficiency proficient expertise ability abilities looking need needs want wants ideal ' +
    'excellent good great strong solid demonstrated proven track record opportunity opportunities environment ' +
    'culture benefits apply application applying qualified qualifications minimum basic bonus plus nice ' +
    'must should etc degree pursuing currently ' 
  ).split(/\s+/),
);

/** Common multi-word skills worth scoring as one token. */
const PHRASES = [
  'machine learning',
  'deep learning',
  'data science',
  'computer science',
  'unit testing',
  'version control',
  'continuous integration',
  'object oriented',
  'rest api',
  'design system',
  'code review',
  'problem solving',
  'test driven',
  'distributed systems',
  'cloud computing',
];

export function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9+#./ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lightweight stemmer: enough to collapse plurals and -ing/-ed forms. */
export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith('sses')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  return w;
}

export function tokenize(text: string): string[] {
  const normalized = normalize(text);
  const found: string[] = [];
  let rest = normalized;
  PHRASES.forEach(phrase => {
    if (rest.includes(phrase)) {
      found.push(phrase.replace(/ /g, '-'));
      rest = rest.split(phrase).join(' ');
    }
  });
  rest
    .split(' ')
    .map(w => w.replace(/^[-.]+|[-.]+$/g, ''))
    .filter(w => w.length > 1 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .forEach(w => found.push(stem(w)));
  return found;
}

export function termFrequency(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  tokens.forEach(t => map.set(t, (map.get(t) || 0) + 1));
  return map;
}

export type MatchResult = {
  /** 0–100 weighted keyword coverage of the job description by the resume. */
  score: number;
  /** Cosine similarity of the two documents, 0–100, as a secondary signal. */
  similarity: number;
  matched: { term: string; weight: number }[];
  missing: { term: string; weight: number }[];
  jdTermCount: number;
  resumeTermCount: number;
};

/**
 * Scores a resume against a job description.
 *
 * Weighting: a term the posting repeats matters more than one it mentions once,
 * and a term that is rare across the two documents is more distinguishing than
 * one they both lean on — the same intuition as TF-IDF, with a corpus of two.
 */
export function matchResumeToJd(resumeText: string, jobDescription: string, topN = 14): MatchResult {
  const jdTokens = tokenize(jobDescription);
  const resumeTokens = tokenize(resumeText);
  const jd = termFrequency(jdTokens);
  const resume = termFrequency(resumeTokens);

  if (!jd.size) {
    return { score: 0, similarity: 0, matched: [], missing: [], jdTermCount: 0, resumeTermCount: resume.size };
  }

  const weightOf = (term: string, tf: number) => {
    const inBoth = resume.has(term) ? 2 : 1;
    const idf = Math.log(2 / inBoth) + 1; // corpus of two documents
    return (1 + Math.log(tf)) * idf;
  };

  const matched: { term: string; weight: number }[] = [];
  const missing: { term: string; weight: number }[] = [];
  let hit = 0;
  let total = 0;

  jd.forEach((tf, term) => {
    const weight = weightOf(term, tf);
    total += weight;
    if (resume.has(term)) {
      hit += weight;
      matched.push({ term, weight });
    } else {
      missing.push({ term, weight });
    }
  });

  // Cosine similarity over the shared vocabulary.
  let dot = 0;
  let jdNorm = 0;
  let resumeNorm = 0;
  jd.forEach((tf, term) => {
    jdNorm += tf * tf;
    const r = resume.get(term);
    if (r) dot += tf * r;
  });
  resume.forEach(tf => {
    resumeNorm += tf * tf;
  });
  const similarity = jdNorm && resumeNorm ? dot / Math.sqrt(jdNorm * resumeNorm) : 0;

  const byWeight = (a: { weight: number }, b: { weight: number }) => b.weight - a.weight;

  return {
    score: Math.round((total ? hit / total : 0) * 100),
    similarity: Math.round(similarity * 100),
    matched: matched.sort(byWeight).slice(0, topN),
    missing: missing.sort(byWeight).slice(0, topN),
    jdTermCount: jd.size,
    resumeTermCount: resume.size,
  };
}

/** One-line verdict for the UI, so the number always arrives with a reading. */
export function matchVerdict(result: MatchResult): string {
  if (!result.jdTermCount) return 'Paste a job description to score it.';
  const missing = result.missing.slice(0, 3).map(m => m.term).join(', ');
  if (result.score >= 75) return `Strong match — ${result.score}% keyword coverage.`;
  if (result.score >= 50) return `Decent match at ${result.score}%. Worth weaving in: ${missing}.`;
  return `Thin match at ${result.score}%. This posting leans on ${missing} — your resume never says them.`;
}
