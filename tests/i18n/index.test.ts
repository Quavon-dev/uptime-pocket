/**
 * i18n parity + resolution tests.
 *
 * Two guarantees this suite enforces:
 *
 *   1. Every locale ships a translation for every key in en.json
 *      (parity). Missing keys are show-stoppers — the user would
 *      see raw dot-paths in production.
 *   2. BCP-47 tags resolve to a supported locale or fall back to
 *      English in the expected way.
 *
 * Plus a few behavior tests for t() / tn() / setLocale() / getLocale().
 */

import en from '@/i18n/en.json';
import de from '@/i18n/de.json';
import fr from '@/i18n/fr.json';
import ja from '@/i18n/ja.json';
import es from '@/i18n/es.json';
import {
  resolveSupportedLocale,
  setLocale,
  getLocale,
  t,
  tn,
  SUPPORTED_LOCALES,
  LOCALE_SYSTEM,
} from '@/i18n';

const dicts: Record<string, Record<string, unknown>> = {
  en: en as unknown as Record<string, unknown>,
  de: de as unknown as Record<string, unknown>,
  fr: fr as unknown as Record<string, unknown>,
  ja: ja as unknown as Record<string, unknown>,
  es: es as unknown as Record<string, unknown>,
};

/**
 * Walk an object tree and emit every leaf path. We use this to compare
 * the shape of en.json (source of truth) against every other locale.
 */
function leafPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || obj === undefined) return [];
  if (typeof obj !== 'object') return [prefix];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...leafPaths(v, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

describe('i18n parity', () => {
  const enPaths = leafPaths(en).sort();

  it('en.json has the expected top-level groups', () => {
    // If you reorganize en.json, this catches it.
    const groups = Object.keys(en).sort();
    expect(groups).toContain('app');
    expect(groups).toContain('tabs');
    expect(groups).toContain('status');
    expect(groups).toContain('common');
    expect(groups).toContain('monitors');
    expect(groups).toContain('servers');
    expect(groups).toContain('notifications');
    expect(groups).toContain('settings');
    expect(groups).toContain('lock');
    expect(groups).toContain('monitorDetail');
    expect(groups).toContain('monitorForm');
  });

  it.each(SUPPORTED_LOCALES.filter((c) => c !== 'en'))(
    '%s.json has the same key paths as en.json',
    (code) => {
      const dict = dicts[code];
      const paths = leafPaths(dict).sort();
      const missing = enPaths.filter((p) => !paths.includes(p));
      const extra = paths.filter((p) => !enPaths.includes(p));
      // A missing key means the user would see a raw dot-path like
      // 'monitors.list.title' instead of a translation. That's a bug
      // we'd rather catch in CI than in production.
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    }
  );

  it.each(SUPPORTED_LOCALES)(
    '%s.json has non-empty string values for every leaf key',
    (code) => {
      const dict = dicts[code];
      const empties: string[] = [];
      for (const path of leafPaths(dict)) {
        const value = path
          .split('.')
          .reduce<any>((acc, k) => (acc == null ? acc : acc[k]), dict);
        if (typeof value !== 'string' || value.trim() === '') {
          empties.push(path);
        }
      }
      expect(empties).toEqual([]);
    }
  );
});

describe('resolveSupportedLocale', () => {
  it('passes through exact matches', () => {
    expect(resolveSupportedLocale('en')).toBe('en');
    expect(resolveSupportedLocale('de')).toBe('de');
    expect(resolveSupportedLocale('fr')).toBe('fr');
    expect(resolveSupportedLocale('ja')).toBe('ja');
    expect(resolveSupportedLocale('es')).toBe('es');
  });

  it('strips region tag and resolves the language', () => {
    expect(resolveSupportedLocale('en-US')).toBe('en');
    expect(resolveSupportedLocale('fr-CA')).toBe('fr');
    expect(resolveSupportedLocale('de-AT')).toBe('de');
    expect(resolveSupportedLocale('ja-JP')).toBe('ja');
    expect(resolveSupportedLocale('es-MX')).toBe('es');
  });

  it('is case-insensitive', () => {
    expect(resolveSupportedLocale('EN')).toBe('en');
    expect(resolveSupportedLocale('Fr-ca')).toBe('fr');
  });

  it('falls back to English for unsupported languages', () => {
    expect(resolveSupportedLocale('zh')).toBe('en');
    expect(resolveSupportedLocale('pt-BR')).toBe('en');
    expect(resolveSupportedLocale('ru')).toBe('en');
    expect(resolveSupportedLocale('ko-KR')).toBe('en');
  });

  it('handles null / undefined / empty strings', () => {
    expect(resolveSupportedLocale(null)).toBe('en');
    expect(resolveSupportedLocale(undefined)).toBe('en');
    expect(resolveSupportedLocale('')).toBe('en');
  });
});

describe('t() / tn() / setLocale()', () => {
  afterEach(() => setLocale('en'));

  it('returns the leaf string for a valid key', () => {
    setLocale('en');
    expect(t('status.up')).toBe('Up');
    expect(t('tabs.monitors')).toBe('Monitors');
  });

  it('returns the key itself for a missing key (so it shows up in QA)', () => {
    setLocale('en');
    expect(t('not.a.real.key')).toBe('not.a.real.key');
  });

  it('returns the key itself for a partially valid path', () => {
    setLocale('en');
    // 'status' exists, but 'status.bogus' does not.
    expect(t('status.bogus')).toBe('status.bogus');
  });

  it('interpolates {name}-style params in tn()', () => {
    setLocale('en');
    expect(tn('servers.detail.deleteConfirm.body', { name: 'My Kuma' })).toBe(
      'Delete "My Kuma" and its stored credentials? This cannot be undone.'
    );
  });

  it('substitutes numbers too', () => {
    setLocale('en');
    expect(tn('monitors.detail.title', { id: 42 })).toBe('Monitor #42');
  });

  it('respects the active locale for translations', () => {
    setLocale('de');
    expect(t('status.up')).toBe('Online');
    expect(t('tabs.monitors')).toBe('Monitore');

    setLocale('fr');
    expect(t('status.up')).toBe('En ligne');

    setLocale('ja');
    expect(t('status.up')).toBe('正常');

    setLocale('es');
    expect(t('status.up')).toBe('En línea');
  });

  it('falls back to English for an unknown locale code', () => {
    // Cast through any to bypass the type guard — we want to prove
    // runtime safety, not just compile-time safety.
    setLocale('zz' as any);
    expect(t('status.up')).toBe('Up');
    expect(getLocale()).toBe('en');
  });

  it('"system" resolves to the device locale (mocked to en in tests)', () => {
    // The require()-based bridge call returns null in node (no module),
    // which falls back to 'en' — good enough for this test.
    setLocale(LOCALE_SYSTEM);
    // We can't easily mock the module, so we just assert that
    // setLocale('system') didn't crash and currentLocale is supported.
    expect(SUPPORTED_LOCALES).toContain(getLocale());
  });
});
