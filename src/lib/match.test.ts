import { describe, expect, it } from 'vitest';
import { matchResumeToJd, matchVerdict, normalize, stem, tokenize } from './match';

describe('normalize', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalize('  Senior   BACKEND  Engineer ')).toBe('senior backend engineer');
  });

  it('keeps characters that matter in tech terms', () => {
    expect(normalize('C++ / C# and Node.js')).toContain('c++');
    expect(normalize('C++ / C# and Node.js')).toContain('c#');
    expect(normalize('C++ / C# and Node.js')).toContain('node.js');
  });
});

describe('stem', () => {
  it('collapses plurals', () => {
    expect(stem('services')).toBe(stem('service'));
    expect(stem('libraries')).toBe('library');
  });

  it('collapses -ing and -ed forms', () => {
    expect(stem('testing')).toBe('test');
    expect(stem('deployed')).toBe('deploy');
  });

  it('leaves short words alone', () => {
    expect(stem('css')).toBe('css');
    expect(stem('api')).toBe('api');
  });
});

describe('tokenize', () => {
  it('drops stopwords', () => {
    const tokens = tokenize('We are looking for a candidate with experience in Kubernetes');
    expect(tokens).not.toContain('are');
    expect(tokens).not.toContain('the');
    expect(tokens).toContain('kubernete');
  });

  it('keeps known multi-word skills as one token', () => {
    expect(tokenize('experience with machine learning models')).toContain('machine-learning');
  });

  it('drops bare numbers', () => {
    expect(tokenize('3 years 2026')).not.toContain('2026');
  });
});

describe('matchResumeToJd', () => {
  const jd = 'We need a backend engineer with Kubernetes, Docker and PostgreSQL. CI/CD experience required.';

  it('scores 0 with an empty job description', () => {
    const result = matchResumeToJd('Kubernetes Docker', '');
    expect(result.score).toBe(0);
    expect(result.jdTermCount).toBe(0);
  });

  it('scores high when the resume covers the posting', () => {
    const result = matchResumeToJd(
      'Backend engineer. Built services with Kubernetes and Docker, PostgreSQL databases, and CI/CD pipelines.',
      jd,
    );
    expect(result.score).toBeGreaterThan(70);
    expect(result.missing.length).toBeLessThan(3);
  });

  it('names the terms the resume never mentions', () => {
    const result = matchResumeToJd('Frontend developer. React, CSS, accessibility.', jd);
    const missing = result.missing.map(m => m.term);
    expect(missing).toContain('kubernete');
    expect(missing).toContain('docker');
    expect(result.score).toBeLessThan(40);
  });

  it('never reports a term as both matched and missing', () => {
    const result = matchResumeToJd('Kubernetes and Docker', jd);
    const matched = new Set(result.matched.map(m => m.term));
    result.missing.forEach(m => expect(matched.has(m.term)).toBe(false));
  });

  it('keeps the score within 0–100', () => {
    const result = matchResumeToJd(jd, jd);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.similarity).toBeLessThanOrEqual(100);
  });

  it('scores an identical document as a full match', () => {
    expect(matchResumeToJd(jd, jd).score).toBe(100);
  });

  it('caps the reported lists at topN', () => {
    const long = Array.from({ length: 60 }, (_, i) => `skill${i}`).join(' ');
    expect(matchResumeToJd('nothing relevant here', long, 5).missing).toHaveLength(5);
  });
});

describe('matchVerdict', () => {
  it('asks for a job description when there is none', () => {
    expect(matchVerdict(matchResumeToJd('resume text', ''))).toMatch(/paste a job description/i);
  });

  it('names missing terms on a weak match', () => {
    const verdict = matchVerdict(matchResumeToJd('React CSS', 'Kubernetes Docker Terraform required'));
    expect(verdict).toMatch(/thin match/i);
    expect(verdict.toLowerCase()).toContain('kubernete');
  });

  it('reads as positive on a strong match', () => {
    const text = 'Kubernetes Docker Terraform';
    expect(matchVerdict(matchResumeToJd(text, text))).toMatch(/strong match/i);
  });
});
