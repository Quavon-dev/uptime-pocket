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
   * Whether the user has seen and dismissed the first-launch privacy
   * consent prompt. False on a fresh install; flipped to true when the
   * user taps "Continue" on the bottom sheet in app/_layout.tsx. The
   * prompt can be re-shown by clearing the flag (e.g. after a material
   * privacy policy change), which is why we keep it as a separate
   * boolean rather than just gating on `hasOnboarded`.
   */
  privacyConsentDismissed: boolean;
  /**
   * Map of `serverId` → the monitor id pinned to the top of the
   * Monitors tab for that server. The user long-presses a monitor
   * to pin / unpin. When `null` or the key is missing, no monitor
   * is pinned for that server and the Monitors tab shows the
   * regular list with no featured card.
   *
   * Persisted as a JSON string in the `pinned_monitor_by_server`
   * TEXT column on disk (see migrate.ts v8); typed as a Record
   * here for the JS layer.
   */
  pinnedMonitorByServer: Record<string, number> | null;
  /**
   * When true, the "up" status color follows the picked accent
   * (e.g. picking "Rose" turns the green "up" dot rose). The
   * other four status colors (down / pending / maintenance /
   * paused) stay on their static semantic palette regardless of
   * this toggle — "down" must stay red, "pending" must stay
   * amber, etc. Default false: a fresh install has it off, and
   * the user opts in via the switch in Settings → Accent.
   *
   * Persisted as the `accent_affects_status` INTEGER column
   * (0 | 1) on the settings row (see migrate.ts v9).
   */
  accentAffectsStatus: boolean;
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
  privacy_consent_dismissed: number;
  // Per-server map of serverId → pinned monitorId, serialized as a
  // JSON string. NULL on disk ↔ `null` in the typed object.
  pinned_monitor_by_server: string | null;
  // 0 | 1. When 1, the "up" status color follows the picked
  // accent; when 0, status colors stay on the static semantic
  // palette (default). See migrate.ts v9.
  accent_affects_status: number;
  updated_at: string;
}

/**
 * Parse the on-disk `pinned_monitor_by_server` string into the typed
 * `Record<serverId, monitorId>` shape used by the rest of the app.
 *
 * Returns `null` on any parse failure (corrupted row, missing key,
 * non-object JSON, etc.) — corruption here is recoverable: a missing
 * pin is just a UI state, not data loss. The same approach we use
 * for the rest of the settings row.
 */
function parsePinnedMonitors(raw: string | null): Record<string, number> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Validate that all values are numbers (a single bad entry
      // would crash the type system downstream; we silently drop
      // the whole map and start fresh, which is safer than trying
      // to partially repair).
      const out: Record<string, number> = {};
      let valid = true;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number' && Number.isFinite(v)) {
          out[k] = v;
        } else {
          valid = false;
          break;
        }
      }
      // Normalize the empty object back to null so the in-memory
      // representation matches "no row was set". The store's
      // setPinnedMonitor writes `null` (not `{}`) when the last
      // pin is removed, so the on-disk shape is `null` ↔ the
      // in-memory shape is `null`; a stray `{}` (e.g. a write
      // from an older version of the app) collapses to the same
      // representation.
      return valid && Object.keys(out).length > 0 ? out : null;
    }
  } catch {
    // JSON.parse failed — corrupt row, fall through
  }
  return null;
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
    privacyConsentDismissed: row.privacy_consent_dismissed === 1,
    pinnedMonitorByServer: parsePinnedMonitors(row.pinned_monitor_by_server),
    accentAffectsStatus: row.accent_affects_status === 1,
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
  privacyConsentDismissed: false,
  // No monitor pinned by default. The user opts in by long-pressing
  // a monitor on the Monitors tab.
  pinnedMonitorByServer: null,
  // "Accent affects status" defaults to OFF. The user has to opt
  // in via the switch in Settings → Accent. Existing installs
  // upgrading to schema v9 keep the previous behavior (status
  // colors are independent of the accent).
  accentAffectsStatus: false,
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
              accent_swatch_id, locale,
              privacy_consent_dismissed, pinned_monitor_by_server,
              accent_affects_status, updated_at
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

    // Serialize the pinned-monitor map. We store `null` as the
    // string 'null' to keep the SQL simple (TEXT column with
    // nullable semantics). `JSON.stringify(null)` returns the
    // string 'null' which our parsePinnedMonitors treats as no
    // pinning.
    const pinnedJson = next.pinnedMonitorByServer
      ? JSON.stringify(next.pinnedMonitorByServer)
      : null;

    await db.runAsync(
      `INSERT OR REPLACE INTO settings
         (id, theme, accent_color, biometric_lock, quiet_hours_enabled,
          quiet_hours_start, quiet_hours_end, has_onboarded,
          accent_swatch_id, locale,
          privacy_consent_dismissed, pinned_monitor_by_server,
          accent_affects_status, updated_at)
       VALUES
         ('app', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      next.theme,
      next.accentColor,
      next.biometricLock ? 1 : 0,
      next.quietHoursEnabled ? 1 : 0,
      next.quietHoursStartMinute,
      next.quietHoursEndMinute,
      next.hasOnboarded ? 1 : 0,
      next.accentSwatchId,
      next.locale,
      next.privacyConsentDismissed ? 1 : 0,
      pinnedJson,
      next.accentAffectsStatus ? 1 : 0,
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
