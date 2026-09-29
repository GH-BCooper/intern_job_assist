/**
 * A key/dictionary i18n scaffold — no paid translation service.
 *
 * English is the source of truth; Spanish and Hindi cover the shell (navigation,
 * actions, the words that repeat on every screen) and were drafted with the
 * free AI key already configured in the app, for human review rather than as a
 * finished localisation. Missing keys fall back to English, so a partial
 * translation degrades to bilingual rather than to blanks.
 */

import type { LocaleId } from './store';

export const LOCALES: { id: LocaleId; label: string; native: string; complete: boolean }[] = [
  { id: 'en', label: 'English', native: 'English', complete: true },
  { id: 'es', label: 'Spanish', native: 'Español', complete: false },
  { id: 'hi', label: 'Hindi', native: 'हिन्दी', complete: false },
];

const EN = {
  'nav.dashboard': 'Dashboard',
  'nav.insights': 'Insights',
  'nav.calendar': 'Calendar',
  'nav.workspace': 'Workspace',
  'nav.automations': 'Automations',
  'nav.prep': 'Prep',
  'nav.settings': 'Settings',
  'nav.signOut': 'Sign out',

  'action.add': 'Add application',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.delete': 'Delete',
  'action.edit': 'Edit',
  'action.close': 'Close',
  'action.search': 'Search',
  'action.export': 'Export',
  'action.import': 'Import',
  'action.undo': 'Undo',
  'action.retry': 'Retry',

  'stage.Wishlist': 'Wishlist',
  'stage.Applied': 'Applied',
  'stage.In Review': 'In Review',
  'stage.Interviewing': 'Interviewing',
  'stage.Offer': 'Offer',
  'stage.Closed': 'Closed',

  'stat.active': 'Active',
  'stat.interviewing': 'Interviewing',
  'stat.offers': 'Offers',
  'stat.followUp': 'Need follow-up',
  'stat.cadence': 'Cadence',
  'stat.momentum': 'Momentum',
  'stat.streak': 'Streak',

  'empty.noApplications': 'No applications yet',
  'empty.nothingMatches': 'Nothing matches',
  'empty.loosenFilter': 'Loosen a filter and try again.',
};

export type MessageKey = keyof typeof EN;

const ES: Partial<Record<MessageKey, string>> = {
  'nav.dashboard': 'Panel',
  'nav.insights': 'Análisis',
  'nav.calendar': 'Calendario',
  'nav.workspace': 'Espacio',
  'nav.automations': 'Automatizaciones',
  'nav.prep': 'Preparación',
  'nav.settings': 'Ajustes',
  'nav.signOut': 'Cerrar sesión',

  'action.add': 'Añadir solicitud',
  'action.save': 'Guardar',
  'action.cancel': 'Cancelar',
  'action.delete': 'Eliminar',
  'action.edit': 'Editar',
  'action.close': 'Cerrar',
  'action.search': 'Buscar',
  'action.export': 'Exportar',
  'action.import': 'Importar',
  'action.undo': 'Deshacer',
  'action.retry': 'Reintentar',

  'stage.Wishlist': 'Lista de deseos',
  'stage.Applied': 'Enviada',
  'stage.In Review': 'En revisión',
  'stage.Interviewing': 'Entrevistas',
  'stage.Offer': 'Oferta',
  'stage.Closed': 'Cerrada',

  'stat.active': 'Activas',
  'stat.interviewing': 'Entrevistas',
  'stat.offers': 'Ofertas',
  'stat.followUp': 'Requieren seguimiento',
  'stat.cadence': 'Ritmo',
  'stat.momentum': 'Impulso',
  'stat.streak': 'Racha',

  'empty.noApplications': 'Aún no hay solicitudes',
  'empty.nothingMatches': 'Nada coincide',
  'empty.loosenFilter': 'Relaja un filtro e inténtalo de nuevo.',
};

const HI: Partial<Record<MessageKey, string>> = {
  'nav.dashboard': 'डैशबोर्ड',
  'nav.insights': 'विश्लेषण',
  'nav.calendar': 'कैलेंडर',
  'nav.workspace': 'वर्कस्पेस',
  'nav.automations': 'ऑटोमेशन',
  'nav.prep': 'तैयारी',
  'nav.settings': 'सेटिंग्स',
  'nav.signOut': 'साइन आउट',

  'action.add': 'आवेदन जोड़ें',
  'action.save': 'सहेजें',
  'action.cancel': 'रद्द करें',
  'action.delete': 'हटाएँ',
  'action.edit': 'संपादित करें',
  'action.close': 'बंद करें',
  'action.search': 'खोजें',
  'action.export': 'निर्यात',
  'action.import': 'आयात',
  'action.undo': 'पूर्ववत करें',
  'action.retry': 'पुन: प्रयास',

  'stage.Wishlist': 'इच्छा-सूची',
  'stage.Applied': 'आवेदित',
  'stage.In Review': 'समीक्षा में',
  'stage.Interviewing': 'साक्षात्कार',
  'stage.Offer': 'ऑफ़र',
  'stage.Closed': 'समाप्त',

  'stat.active': 'सक्रिय',
  'stat.interviewing': 'साक्षात्कार',
  'stat.offers': 'ऑफ़र',
  'stat.followUp': 'फ़ॉलो-अप चाहिए',
  'stat.cadence': 'गति',
  'stat.momentum': 'रफ़्तार',
  'stat.streak': 'लगातार',

  'empty.noApplications': 'अभी कोई आवेदन नहीं',
  'empty.nothingMatches': 'कुछ मेल नहीं खाता',
  'empty.loosenFilter': 'कोई फ़िल्टर हटाकर फिर देखें।',
};

const DICTIONARIES: Record<LocaleId, Partial<Record<MessageKey, string>>> = { en: EN, es: ES, hi: HI };

/** Translate a key, falling back to English and finally to the key itself. */
export function translate(locale: LocaleId, key: MessageKey, vars?: Record<string, string | number>): string {
  const raw = DICTIONARIES[locale]?.[key] ?? EN[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''));
}

/**
 * A stage's name in a locale, or the stage's own name when there is no translation.
 * (`translate` alone would fall back to the key, "stage.Wishlist".)
 */
export function translateStage(locale: LocaleId, stage: string): string {
  const key = `stage.${stage}` as MessageKey;
  const out = translate(locale, key);
  return out === key ? stage : out;
}

/** Bound translator, so components read `t('nav.dashboard')`. */
export function translator(locale: LocaleId) {
  return (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
}

/** Share of keys a locale actually covers — surfaced in Settings so the gap is honest. */
export function coverage(locale: LocaleId): number {
  const total = Object.keys(EN).length;
  const done = Object.keys(DICTIONARIES[locale] || {}).length;
  return total ? Math.round((done / total) * 100) : 0;
}

export const EN_KEYS = Object.keys(EN) as MessageKey[];
