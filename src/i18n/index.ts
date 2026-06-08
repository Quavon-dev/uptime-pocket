/**
 * Lightweight i18n.
 *
 * Supported locales: en (default), de, fr, ja, es.
 *
 * Lookup:
 *   t('status.up')             -> "Up"   / "Online"   / etc.
 *   tn('monitors.errorBanner', { error: 'timeout' })
 *                               -> "Connection error: timeout"
 *
 * Locale selection:
 *   - setLocale('fr')            // explicit override
 *   - getSystemLocale()          // 'en-US' -> 'en', 'fr-CA' -> 'fr', 'zh-Hans' -> 'en' (fallback)
 *   - When `locale` setting is 'system' (the default), the active locale
 *     is the system locale. Otherwise it's the explicit user choice.
 *
 * Why we don't use i18next / react-intl:
 *   - They're 30-80 KB gzipped each; we have <200 keys.
 *   - Our domain (status, monitors, servers, settings) is stable and
 *     not message-format-heavy; we don't need ICU plural/select.
 *   - The trade-off is that we have to keep all 5 JSON files in sync
 *     (enforced by the parity test in `tests/i18n/parity.test.ts`).
 */

import en from './en.json';
import de from './de.json';
import fr from './fr.json';
import ja from './ja.json';
import es from './es.json';

type DeepLeaf<T> = T extends object
  ? { [K in keyof T]: DeepLeaf<T[K]> }
  : T;

export type Translations = DeepLeaf<typeof en>;

/** All locales we ship translations for. Source of truth for tests + UI pickers. */
export const SUPPORTED_LOCALES = ['en', 'de', 'fr', 'ja', 'es'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** The 'follow the system' sentinel. Stored on disk as the literal 'system'. */
export const LOCALE_SYSTEM = 'system';
export type LocalePreference = typeof LOCALE_SYSTEM | SupportedLocale;

const translations: Record<SupportedLocale, Translations> = {
  en: en as Translations,
  de: de as Translations,
  fr: fr as Translations,
  ja: ja as Translations,
  es: es as Translations,
};

let currentLocale: SupportedLocale = 'en';

/**
 * Pick a supported locale from a BCP-47 tag like 'fr-CA' or 'zh-Hans-CN'.
 * Returns the default locale ('en') if no supported prefix is found.
 *
 * The matcher is intentionally lenient: we strip the region and try the
 * bare language code first, then fall back to 'en'. We don't ship
 * regional variants (e.g. pt-BR), so 'pt' -> 'en'.
 */
export function resolveSupportedLocale(tag: string | null | undefined): SupportedLocale {
  if (!tag) return 'en';
  const lower = tag.toLowerCase();
  for (const code of SUPPORTED_LOCALES) {
    if (lower === code) return code;
    if (lower.startsWith(code + '-')) return code;
  }
  return 'en';
}

/**
 * Convenience: resolve the current device locale to a supported one.
 * Used on first launch (and when the user picks "System default" in
 * Settings) to seed the in-memory locale.
 */
export function getSystemLocale(): SupportedLocale {
  // Lazy import so tests that don't need the bridge don't have to mock it.
  // The function returns a plain string either way.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let tag: string | null = null;
  try {
    // expo-localization is optional; if it's not installed (e.g. in tests)
    // we fall back to 'en'.
    const { getLocales } = require('expo-localization');
    const locales = getLocales?.();
    if (Array.isArray(locales) && locales.length > 0) {
      tag = locales[0]?.languageTag ?? locales[0]?.languageCode ?? null;
    }
  } catch {
    tag = null;
  }
  return resolveSupportedLocale(tag);
}

export function setLocale(locale: LocalePreference): void {
  if (locale === LOCALE_SYSTEM) {
    currentLocale = getSystemLocale();
    return;
  }
  // Unknown locale -> fall back to English. We don't throw because the
  // UI is allowed to call this with a string from settings, the store,
  // an old row, or a hand-edited SQLite row.
  if (translations[locale]) {
    currentLocale = locale;
  } else {
    currentLocale = 'en';
  }
}

export function getLocale(): SupportedLocale {
  return currentLocale;
}

export function t(key: string): string {
  const dict = translations[currentLocale] ?? translations.en;
  const parts = key.split('.');
  let current: any = dict;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      // Missing key: return the dot-path itself so we can spot it in QA.
      // (Returning an empty string would be silently catastrophic.)
      return key;
    }
  }
  return typeof current === 'string' ? current : key;
}

export function tn(key: string, params: Record<string, string | number>): string {
  let str = t(key);
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(`{${k}}`, String(v));
  }
  return str;
}
