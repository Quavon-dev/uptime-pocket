/**
 * Settings repository.
 *
 * The settings table holds a single row keyed by id = 'app'. This file
 * is the only place that should touch it directly. The Zustand store
 * (`src/data/store/settings.ts`) calls into here on hydrate and on
 * every setter.
 *
 * Reads: `load()` returns the full row as a domain Settings object, or
 * `null` if no row has been written yet (fresh install).
 *
 * Writes: `save()` is upsert-style; pass a partial object and we
 * merge with whatever's already in the row.
 *
 * The reason we expose `save()` instead of one function per field is
 * that we want every write to be a single atomic UPDATE. If you call
 * `setTheme` then `setBiometricLock` separately, you'd race against
 * your own writes. Always batch.
 */

import { getDatabase } from './index';
import type { ThemeMode } from '@/data/store/settings';
import type { LocalePreference } from '@/i18n';

export interface PersistedSettings {
  theme: ThemeMode;
  accentColor: string | null;
  accentSwatchId: string | null;
  biometricLock: boolean;
  quietHoursEnabled: boolean;
  quietHoursStartMinute: number; // 0..1439
  quietHoursEndMinute: number; // 0..1439
  hasOnboarded: boolean;
  locale: LocalePreference;
  /**
   * User opt-in for Sentry crash reporting. Default false. The Sentry
   * SDK is NOT loaded and NO network calls are made to sentry.io
   * until this is true AND EXPO_PUBLIC_SENTRY_DSN is set.
   */
  sentryEnabled: boolean;
  /**
   * Whether the user has seen and dismissed the first-launch privacy
   * consent prompt. False on a fresh install; flipped to true when the
   * user taps "Continue" on the bottom sheet in app/_layout.tsx. The
   * prompt can be re-shown by clearing the flag (e.g. after a material
   * privacy policy change), which is why we keep it as a separate
   * boolean rather than just gating on `hasOnboarded`.
   */
  privacyConsentDismissed: boolean;
}

interface SettingsRow {
  id: string;
  theme: ThemeMode;
  accent_color: string | null;
  biometric_lock: number; // 0 | 1
  quiet_hours_enabled: number;
  quiet_hours_start: number;
  quiet_hours_end: number;
  has_onboarded: number;
  accent_swatch_id: string | null;
  locale: string | null;
  sentry_enabled: number;
  privacy_consent_dismissed: number;
  updated_at: string;
}

function rowToSettings(row: SettingsRow): PersistedSettings {
  return {
    theme: row.theme,
    accentColor: row.accent_color,
    accentSwatchId: row.accent_swatch_id,
    biometricLock: row.biometric_lock === 1,
    quietHoursEnabled: row.quiet_hours_enabled === 1,
    quietHoursStartMinute: row.quiet_hours_start,
    quietHoursEndMinute: row.quiet_hours_end,
    hasOnboarded: row.has_onboarded === 1,
    locale: (row.locale ?? 'system') as LocalePreference,
    sentryEnabled: row.sentry_enabled === 1,
    privacyConsentDismissed: row.privacy_consent_dismissed === 1,
  };
}

/** Hardcoded default settings. Used when no row exists yet. */
export const DEFAULT_SETTINGS: PersistedSettings = {
  theme: 'system',
  accentColor: null,
  accentSwatchId: null,
  biometricLock: false,
  quietHoursEnabled: false,
  quietHoursStartMinute: 22 * 60, // 22:00
  quietHoursEndMinute: 7 * 60, // 07:00
  hasOnboarded: false,
  locale: 'system',
  sentryEnabled: false,
  privacyConsentDismissed: false,
};

export const settingsRepo = {
  /**
   * Load the persisted settings, or `null` if no row has been written.
   *
   * Callers should fall back to `DEFAULT_SETTINGS` in that case.
   */
  async load(): Promise<PersistedSettings | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SettingsRow>(
      `SELECT id, theme, accent_color, biometric_lock, quiet_hours_enabled,
              quiet_hours_start, quiet_hours_end, has_onboarded,
              accent_swatch_id, locale, sentry_enabled,
              privacy_consent_dismissed, updated_at
         FROM settings
        WHERE id = 'app'`
    );
    return row ? rowToSettings(row) : null;
  },

  /**
   * Upsert settings. Pass a partial object; we merge with whatever is
   * already on disk so a single write can touch one or many fields.
   *
   * If no row exists, we insert with the rest filled from
   * `DEFAULT_SETTINGS` (so a fresh install on first `setTheme` still
   * ends up with a valid full row).
   */
  async save(patch: Partial<PersistedSettings>): Promise<PersistedSettings> {
    const db = await getDatabase();
    const current = (await this.load()) ?? DEFAULT_SETTINGS;
    const next: PersistedSettings = { ...current, ...patch };

    await db.runAsync(
      `INSERT OR REPLACE INTO settings
         (id, theme, accent_color, biometric_lock, quiet_hours_enabled,
          quiet_hours_start, quiet_hours_end, has_onboarded,
          accent_swatch_id, locale, sentry_enabled,
          privacy_consent_dismissed, updated_at)
       VALUES
         ('app', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      next.theme,
      next.accentColor,
      next.biometricLock ? 1 : 0,
      next.quietHoursEnabled ? 1 : 0,
      next.quietHoursStartMinute,
      next.quietHoursEndMinute,
      next.hasOnboarded ? 1 : 0,
      next.accentSwatchId,
      next.locale,
      next.sentryEnabled ? 1 : 0,
      next.privacyConsentDismissed ? 1 : 0,
      new Date().toISOString()
    );

    return next;
  },

  /** Hard reset back to defaults. Used by the "Reset settings" action. */
  async clear(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM settings WHERE id = 'app'`);
  },
};
