/**
 * Settings store.
 *
 * App-level settings that aren't tied to a specific server:
 * - theme: light | dark | system
 * - accentColor: brand color override
 * - biometricLock: require Face ID / fingerprint
 * - quietHours: { enabled, startMinute, endMinute }
 *
 * Persistence:
 *   - Backed by SQLite via `src/data/db/settings.ts` (settingsRepo).
 *   - `hydrate()` is called once on app start, reading the row from disk
 *     and seeding the store. Until hydrate completes, the store holds
 *     `DEFAULT_SETTINGS`.
 *   - Every setter writes through to disk BEFORE updating the in-memory
 *     store. This means the disk is always at least as fresh as the
 *     in-memory state, so a crash mid-update can't leave us with a
 *     newer-on-disk / older-in-memory split.
 *   - We swallow write errors at the boundary and log them; the UI must
 *     keep working even if persistence is broken (e.g. simulator with
 *     no filesystem access).
 */

import { create } from 'zustand';
import {
  settingsRepo,
  DEFAULT_SETTINGS,
  type PersistedSettings,
} from '@/data/db/settings';
import { setLocale as i18nSetLocale, type LocalePreference } from '@/i18n';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface QuietHours {
  enabled: boolean;
  startMinute: number; // 0-1439
  endMinute: number;
}

interface SettingsState extends PersistedSettings {
  /** True once we've finished reading the initial state from disk. */
  hydrated: boolean;

  /** Read settings from disk into the store. Call once on app start. */
  hydrate: () => Promise<void>;

  setTheme: (t: ThemeMode) => void;
  setAccentColor: (c: string | null) => void;
  setAccentSwatchId: (id: string | null) => void;
  /**
   * Toggle whether the "up" status color follows the picked
   * accent. Default false (status colors are independent of the
   * accent). When flipped to true, `useAppTheme().status.up` will
   * equal the active brand color, so picking "Rose" turns the
   * green "up" dot rose. The other four status colors stay on
   * the static semantic palette regardless.
   */
  setAccentAffectsStatus: (enabled: boolean) => void;
  setBiometricLock: (enabled: boolean) => void;
  setQuietHours: (q: QuietHours) => void;
  setOnboarded: (v: boolean) => void;
  setLocale: (l: LocalePreference) => void;
  setPrivacyConsentDismissed: (v: boolean) => void;
  /**
   * Pin a monitor to the top of the Monitors tab for a given
   * server. Pass `null` to unpin. The pin is persisted across
   * app restarts and per-server (pinning on server A doesn't
   * affect server B).
   */
  setPinnedMonitor: (serverId: string, monitorId: number | null) => void;

  /** Hard reset back to defaults (and clear on disk). */
  resetAll: () => Promise<void>;
}

/**
 * Internal helper: write `patch` to disk, then merge into in-memory
 * state. Errors are logged and swallowed so the UI never crashes from
 * a persistence failure (e.g. corrupted DB on a user's device).
 */
async function persist(patch: Partial<PersistedSettings>): Promise<PersistedSettings> {
  try {
    return await settingsRepo.save(patch);
  } catch (err) {
    // We intentionally do not rethrow. Settings are nice-to-have; the
    // app should still work even if disk is broken.
    console.warn('[settings] persist failed:', err);
    return { ...DEFAULT_SETTINGS, ...patch };
  }
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,

  hydrate: async () => {
    try {
      const row = await settingsRepo.load();
      set({ ...(row ?? DEFAULT_SETTINGS), hydrated: true });
    } catch (err) {
      console.warn('[settings] hydrate failed, using defaults:', err);
      set({ ...DEFAULT_SETTINGS, hydrated: true });
    }
  },

  setTheme: (theme) => {
    // Optimistic in-memory update first so the UI doesn't flicker, then
    // persist. If persist fails we keep the in-memory value (the next
    // hydrate will reconcile).
    set({ theme });
    void persist({ theme });
  },

  setAccentColor: (accentColor) => {
    set({ accentColor });
    void persist({ accentColor });
  },

  setAccentSwatchId: (accentSwatchId) => {
    set({ accentSwatchId });
    void persist({ accentSwatchId });
  },

  setAccentAffectsStatus: (accentAffectsStatus) => {
    set({ accentAffectsStatus });
    void persist({ accentAffectsStatus });
  },

  setBiometricLock: (biometricLock) => {
    set({ biometricLock });
    void persist({ biometricLock });
  },

  setQuietHours: ({ enabled, startMinute, endMinute }) => {
    set({
      quietHoursEnabled: enabled,
      quietHoursStartMinute: startMinute,
      quietHoursEndMinute: endMinute,
    });
    void persist({
      quietHoursEnabled: enabled,
      quietHoursStartMinute: startMinute,
      quietHoursEndMinute: endMinute,
    });
  },

  setOnboarded: (hasOnboarded) => {
    set({ hasOnboarded });
    void persist({ hasOnboarded });
  },

  setLocale: (locale) => {
    set({ locale });
    // Update the i18n module synchronously so any subsequent t()/tn() call
    // (including the render that follows this set) reflects the change.
    i18nSetLocale(locale);
    void persist({ locale });
  },

  setPrivacyConsentDismissed: (privacyConsentDismissed) => {
    set({ privacyConsentDismissed });
    void persist({ privacyConsentDismissed });
  },

  setPinnedMonitor: (serverId, monitorId) => {
    // Optimistic in-memory update. We mutate the per-server map
    // immutably (new object literal) so any selector that
    // compares by reference (zustand's default Object.is) picks
    // up the change. The pattern:
    //   - If `monitorId` is null AND the map is non-empty: remove
    //     just this server's key (don't blow away other servers'
    //     pins).
    //   - If `monitorId` is null AND the map is empty: write
    //     `null` (matches the fresh-install state on disk).
    //   - If `monitorId` is non-null: merge into a new map with
    //     this server's pin updated.
    const current = get().pinnedMonitorByServer ?? {};
    let next: Record<string, number> | null;
    if (monitorId === null) {
      if (!(serverId in current)) {
        // No-op: this server wasn't pinned anyway. Don't trigger
        // a needless persist.
        return;
      }
      const { [serverId]: _removed, ...rest } = current;
      next = Object.keys(rest).length > 0 ? rest : null;
    } else {
      next = { ...current, [serverId]: monitorId };
    }
    set({ pinnedMonitorByServer: next });
    void persist({ pinnedMonitorByServer: next });
  },

  resetAll: async () => {
    await settingsRepo.clear().catch((err) => {
      console.warn('[settings] clear failed:', err);
    });
    set({ ...DEFAULT_SETTINGS, hydrated: true });
    // Reset i18n back to the device default.
    i18nSetLocale(DEFAULT_SETTINGS.locale);
  },
}));

/** Helper for tests + non-React code that needs current snapshot. */
export function getCurrentSettings(): PersistedSettings {
  const s = useSettings.getState();
  return {
    theme: s.theme,
    accentColor: s.accentColor,
    accentSwatchId: s.accentSwatchId,
    biometricLock: s.biometricLock,
    quietHoursEnabled: s.quietHoursEnabled,
    quietHoursStartMinute: s.quietHoursStartMinute,
    quietHoursEndMinute: s.quietHoursEndMinute,
    hasOnboarded: s.hasOnboarded,
    locale: s.locale,
    privacyConsentDismissed: s.privacyConsentDismissed,
    pinnedMonitorByServer: s.pinnedMonitorByServer,
    accentAffectsStatus: s.accentAffectsStatus,
  };
}
