/**
 * Runtime accent themes.
 *
 * `primary` and `accent` are Tailwind scales, fixed at build time. Mapping them
 * onto CSS custom properties (the same pattern index.css already uses for
 * `--surface` / `--page` / `--ring`) lets Settings swap the whole palette live,
 * with no rebuild and no new dependency.
 */

import type { AccentId } from './store';

export type Ramp = Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, string>;

export type AccentPreset = {
  id: AccentId;
  label: string;
  hint: string;
  primary: Ramp;
  accent: Ramp;
  /** The gradient used by .text-gradient and the primary button. */
  gradient: [string, string, string];
};

export const ACCENTS: AccentPreset[] = [
  {
    id: 'coral',
    label: 'Coral',
    hint: 'The original warm gold to coral',
    gradient: ['#FB923C', '#FF7E7E', '#FFB245'],
    primary: {
      50: '#FFF8EC', 100: '#FFEFD4', 200: '#FFDFA8', 300: '#FFC974', 400: '#FFB245',
      500: '#FB923C', 600: '#EA7328', 700: '#C2551C', 800: '#9A431B', 900: '#7C3919', 950: '#451D0B',
    },
    accent: {
      50: '#FFF1F2', 100: '#FFE0E2', 200: '#FFC6CA', 300: '#FF9EA6', 400: '#FF7E7E',
      500: '#F35D63', 600: '#DC3F48', 700: '#B92F38', 800: '#992A32', 900: '#7F2830', 950: '#4A161B',
    },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    hint: 'Cool blue with a teal lift',
    gradient: ['#38BDF8', '#2DD4BF', '#60A5FA'],
    primary: {
      50: '#EFF9FF', 100: '#DEF1FF', 200: '#B6E4FE', 300: '#76D0FD', 400: '#38BDF8',
      500: '#0EA5E9', 600: '#0284C7', 700: '#0369A1', 800: '#075985', 900: '#0C4A6E', 950: '#082F49',
    },
    accent: {
      50: '#EFFCF9', 100: '#D6F7F1', 200: '#AFEEE5', 300: '#6FDFD2', 400: '#2DD4BF',
      500: '#14B8A6', 600: '#0D9488', 700: '#0F766E', 800: '#115E59', 900: '#134E4A', 950: '#042F2E',
    },
  },
  {
    id: 'forest',
    label: 'Forest',
    hint: 'Deep green, calm and low-contrast',
    gradient: ['#34D399', '#A3E635', '#4ADE80'],
    primary: {
      50: '#ECFDF5', 100: '#D1FAE5', 200: '#A7F3D0', 300: '#6EE7B7', 400: '#34D399',
      500: '#10B981', 600: '#059669', 700: '#047857', 800: '#065F46', 900: '#064E3B', 950: '#022C22',
    },
    accent: {
      50: '#F7FEE7', 100: '#ECFCCB', 200: '#D9F99D', 300: '#BEF264', 400: '#A3E635',
      500: '#84CC16', 600: '#65A30D', 700: '#4D7C0F', 800: '#3F6212', 900: '#365314', 950: '#1A2E05',
    },
  },
  {
    id: 'grape',
    label: 'Grape',
    hint: 'Violet into fuchsia',
    gradient: ['#A78BFA', '#F472B6', '#C084FC'],
    primary: {
      50: '#F5F3FF', 100: '#EDE9FE', 200: '#DDD6FE', 300: '#C4B5FD', 400: '#A78BFA',
      500: '#8B5CF6', 600: '#7C3AED', 700: '#6D28D9', 800: '#5B21B6', 900: '#4C1D95', 950: '#2E1065',
    },
    accent: {
      50: '#FDF2F8', 100: '#FCE7F3', 200: '#FBCFE8', 300: '#F9A8D4', 400: '#F472B6',
      500: '#EC4899', 600: '#DB2777', 700: '#BE185D', 800: '#9D174D', 900: '#831843', 950: '#500724',
    },
  },
  {
    id: 'slate',
    label: 'Slate',
    hint: 'Monochrome, for quiet screens',
    gradient: ['#94A3B8', '#CBD5E1', '#64748B'],
    primary: {
      50: '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0', 300: '#CBD5E1', 400: '#94A3B8',
      500: '#64748B', 600: '#475569', 700: '#334155', 800: '#1E293B', 900: '#0F172A', 950: '#020617',
    },
    accent: {
      50: '#FAFAFA', 100: '#F4F4F5', 200: '#E4E4E7', 300: '#D4D4D8', 400: '#A1A1AA',
      500: '#71717A', 600: '#52525B', 700: '#3F3F46', 800: '#27272A', 900: '#18181B', 950: '#09090B',
    },
  },
];

export const ACCENT_BY_ID: Record<AccentId, AccentPreset> = ACCENTS.reduce((acc, a) => {
  acc[a.id] = a;
  return acc;
}, {} as Record<AccentId, AccentPreset>);

const STEPS: (keyof Ramp)[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/**
 * Writes the preset onto the document root.
 *
 * Tailwind's colour utilities are generated against `rgb(var(--color-…) / <alpha>)`,
 * so setting the triplet here re-skins every `primary-*` / `accent-*` class.
 */
export function applyAccent(id: AccentId) {
  const preset = ACCENT_BY_ID[id] || ACCENT_BY_ID.coral;
  const root = document.documentElement;
  STEPS.forEach(step => {
    root.style.setProperty(`--color-primary-${step}`, hexToRgbTriplet(preset.primary[step]));
    root.style.setProperty(`--color-accent-${step}`, hexToRgbTriplet(preset.accent[step]));
  });
  root.style.setProperty('--ring', hexToRgbTriplet(preset.primary[500]));
  root.style.setProperty('--grad-1', preset.gradient[0]);
  root.style.setProperty('--grad-2', preset.gradient[1]);
  root.style.setProperty('--grad-3', preset.gradient[2]);
  root.dataset.accent = preset.id;
}

export function applyFontScale(scale: number) {
  const clamped = Math.max(0.85, Math.min(1.35, scale || 1));
  document.documentElement.style.setProperty('--font-scale', String(clamped));
}

export function applyContrast(on: boolean) {
  document.documentElement.classList.toggle('high-contrast', !!on);
}
