/**
 * Column-mapping presets for other trackers' CSV exports.
 *
 * Removes the switching cost from Huntr / Teal / Simplify, and turns LinkedIn's
 * free "My Data" job-application export into bulk-imported applications. Each
 * preset is pure data over the CSV parser that already exists in ai/tools.ts.
 */

import type { ApplicationInsert } from './supabase';
import { toDateInput } from './format';

export type ImportPresetId = 'interntrack' | 'huntr' | 'teal' | 'simplify' | 'linkedin' | 'generic';

export type ImportPreset = {
  id: ImportPresetId;
  label: string;
  hint: string;
  /** Header names, lowercased, that identify this export. */
  signature: string[];
  /** Target field -> candidate source headers, in priority order. */
  map: Partial<Record<keyof ApplicationInsert, string[]>>;
  /** Source header whose value maps onto a response status. */
  statusColumn?: string[];
  statusMap?: Record<string, string>;
};

export const PRESETS: ImportPreset[] = [
  {
    id: 'interntrack',
    label: 'InternTrack',
    hint: 'A CSV exported from InternTrack itself.',
    signature: ['company_name', 'role_applied_to'],
    map: {
      company_name: ['company_name', 'company'],
      role_applied_to: ['role_applied_to', 'role'],
      platform_applied_on: ['platform_applied_on', 'platform'],
      date_applied: ['date_applied'],
      response_status: ['response_status'],
      final_status: ['final_status'],
      salary_info: ['salary_info', 'salary'],
      company_description: ['company_description', 'notes'],
      resume_used: ['resume_used'],
      cover_letter_used: ['cover_letter_used'],
      interview_questions: ['interview_questions'],
      tasks_to_complete: ['tasks_to_complete'],
    },
  },
  {
    id: 'huntr',
    label: 'Huntr',
    hint: 'Huntr board export (Company / Title / List / Date Applied).',
    signature: ['list', 'title'],
    map: {
      company_name: ['company', 'company name', 'employer'],
      role_applied_to: ['title', 'job title', 'position'],
      platform_applied_on: ['source', 'job site', 'via'],
      date_applied: ['date applied', 'applied date', 'date added'],
      salary_info: ['salary', 'compensation'],
      company_description: ['description', 'notes', 'job description'],
    },
    statusColumn: ['list', 'status', 'stage'],
    statusMap: {
      wishlist: 'Pending',
      applied: 'Pending',
      'in progress': 'Viewed',
      interview: 'Shortlisted',
      interviewing: 'Shortlisted',
      offer: 'Offered',
      rejected: 'Rejected',
      hired: 'Offered',
    },
  },
  {
    id: 'teal',
    label: 'Teal HQ',
    hint: 'Teal job tracker export (Company Name / Job Title / Status).',
    signature: ['job title', 'company name'],
    map: {
      company_name: ['company name', 'company'],
      role_applied_to: ['job title', 'role'],
      platform_applied_on: ['job source', 'source', 'url'],
      date_applied: ['date applied', 'applied on', 'date saved'],
      salary_info: ['salary', 'pay range'],
      company_description: ['notes', 'job description'],
    },
    statusColumn: ['status'],
    statusMap: {
      bookmarked: 'Pending',
      applied: 'Pending',
      interviewing: 'Shortlisted',
      negotiating: 'Offered',
      offer: 'Offered',
      'not selected': 'Rejected',
      rejected: 'Rejected',
      archived: 'Rejected',
    },
  },
  {
    id: 'simplify',
    label: 'Simplify.jobs',
    hint: 'Simplify application history export.',
    signature: ['job', 'company', 'applied'],
    map: {
      company_name: ['company', 'company name'],
      role_applied_to: ['job', 'job title', 'position', 'role'],
      platform_applied_on: ['source', 'platform', 'board'],
      date_applied: ['applied', 'applied at', 'date'],
      company_description: ['notes'],
    },
    statusColumn: ['status', 'stage'],
    statusMap: {
      applied: 'Pending',
      screening: 'Viewed',
      interview: 'Shortlisted',
      offer: 'Offered',
      rejected: 'Rejected',
    },
  },
  {
    id: 'linkedin',
    label: 'LinkedIn "My Data"',
    hint: 'Job Applications.csv from LinkedIn’s free data export.',
    signature: ['application date', 'company name'],
    map: {
      company_name: ['company name'],
      role_applied_to: ['job title'],
      date_applied: ['application date'],
      company_description: ['contact email', 'contact phone number'],
    },
  },
  {
    id: 'generic',
    label: 'Any CSV',
    hint: 'Best-effort guess from common header names.',
    signature: [],
    map: {
      company_name: ['company_name', 'company name', 'company', 'employer', 'organisation', 'organization'],
      role_applied_to: ['role_applied_to', 'role', 'job title', 'title', 'position'],
      platform_applied_on: ['platform', 'source', 'via', 'board', 'website'],
      date_applied: ['date_applied', 'date applied', 'applied', 'date'],
      salary_info: ['salary', 'compensation', 'pay'],
      company_description: ['notes', 'description', 'comments'],
    },
    statusColumn: ['status', 'stage', 'list'],
    statusMap: {
      applied: 'Pending',
      pending: 'Pending',
      viewed: 'Viewed',
      screening: 'Viewed',
      interview: 'Shortlisted',
      interviewing: 'Shortlisted',
      shortlisted: 'Shortlisted',
      offer: 'Offered',
      offered: 'Offered',
      rejected: 'Rejected',
      closed: 'Rejected',
    },
  },
];

const lower = (o: Record<string, string>) => {
  const out: Record<string, string> = {};
  Object.entries(o).forEach(([k, v]) => {
    out[k.trim().toLowerCase()] = v;
  });
  return out;
};

/** Picks the preset whose signature headers all appear in the file. */
export function detectPreset(rows: Record<string, string>[]): ImportPreset {
  if (!rows.length) return PRESETS[PRESETS.length - 1];
  const headers = new Set(Object.keys(rows[0]).map(h => h.trim().toLowerCase()));
  const found = PRESETS.find(p => p.signature.length > 0 && p.signature.every(s => headers.has(s)));
  return found || PRESETS[PRESETS.length - 1];
}

function pick(row: Record<string, string>, candidates: string[] = []): string {
  for (const key of candidates) {
    const value = row[key];
    if (value && value.trim()) return value.trim();
  }
  return '';
}

function normalizeDate(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return toDateInput(parsed.toISOString());
  // Formats like 12/03/2026 that Date parses inconsistently across locales.
  const m = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const [, a, b, y] = m;
    const year = Number(y.length === 2 ? `20${y}` : y);
    const guess = new Date(year, Number(a) - 1, Number(b));
    if (!Number.isNaN(guess.getTime())) return toDateInput(guess.toISOString());
  }
  return null;
}

export type MappedRow = { data: ApplicationInsert; skipped: boolean; reason?: string };

const BLANK: ApplicationInsert = {
  company_name: '',
  company_description: '',
  resume_used: '',
  cover_letter_used: '',
  response_status: 'Pending',
  interview_offered: false,
  final_status: 'In Progress',
  date_applied: null,
  salary_info: '',
  interview_questions: '',
  tasks_to_complete: '',
  resume_path: '',
  cover_letter_path: '',
  role_applied_to: '',
  platform_applied_on: '',
};

/** Maps one CSV row into an application, or marks it skipped with a reason. */
export function mapRow(row: Record<string, string>, preset: ImportPreset): MappedRow {
  const r = lower(row);
  const data: ApplicationInsert = { ...BLANK };

  (Object.entries(preset.map) as [keyof ApplicationInsert, string[]][]).forEach(([field, candidates]) => {
    const value = pick(r, candidates);
    if (!value) return;
    if (field === 'date_applied') data.date_applied = normalizeDate(value);
    else if (field === 'interview_offered') data.interview_offered = /true|yes|1/i.test(value);
    else (data as unknown as Record<string, string>)[field] = value;
  });

  if (preset.statusColumn) {
    const raw = pick(r, preset.statusColumn).toLowerCase();
    const mapped = preset.statusMap?.[raw];
    if (mapped) {
      data.response_status = mapped;
      if (mapped === 'Rejected') data.final_status = 'Rejected';
      if (mapped === 'Shortlisted') data.interview_offered = true;
    }
  }

  if (!data.company_name) return { data, skipped: true, reason: 'no company name' };
  return { data, skipped: false };
}

export type ImportPlan = {
  preset: ImportPreset;
  rows: ApplicationInsert[];
  skipped: number;
  duplicates: ApplicationInsert[];
};

/**
 * Turns parsed CSV rows into a plan, holding back near-duplicates of what is
 * already tracked so the user decides rather than the importer.
 */
export function buildImportPlan(
  parsed: Record<string, string>[],
  existing: { company_name: string; role_applied_to: string }[],
  presetOverride?: ImportPreset,
): ImportPlan {
  const preset = presetOverride || detectPreset(parsed);
  const key = (c: string, r: string) => `${c.trim().toLowerCase()}|${r.trim().toLowerCase()}`;
  const seen = new Set(existing.map(e => key(e.company_name, e.role_applied_to || '')));

  const rows: ApplicationInsert[] = [];
  const duplicates: ApplicationInsert[] = [];
  let skipped = 0;

  parsed.forEach(raw => {
    const mapped = mapRow(raw, preset);
    if (mapped.skipped) {
      skipped += 1;
      return;
    }
    const k = key(mapped.data.company_name, mapped.data.role_applied_to);
    if (seen.has(k)) {
      duplicates.push(mapped.data);
      return;
    }
    seen.add(k);
    rows.push(mapped.data);
  });

  return { preset, rows, skipped, duplicates };
}
