/**
 * Lightweight i18n - English only for v1.0.
 * Structure is ready for more languages.
 */

import en from './en.json';

type DeepLeaf<T> = T extends object
  ? { [K in keyof T]: DeepLeaf<T[K]> }
  : T;

export type Translations = DeepLeaf<typeof en>;

const translations: Record<string, Translations> = {
  en: en as Translations,
};

let currentLocale = 'en';

export function setLocale(locale: string): void {
  if (translations[locale]) {
    currentLocale = locale;
  }
}

export function getLocale(): string {
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
