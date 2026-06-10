/**
 * Tests for the settings Zustand store.
 *
 * The store delegates persistence to settingsRepo. We mock that out
 * so we can assert the in-memory state, the calls into the repo, and
 * the optimistic-update-then-persist behavior.
 */

import { DEFAULT_SETTINGS } from '@/data/db/settings';

const mockLoad = jest.fn();
const mockSave = jest.fn();
const mockClear = jest.fn();

jest.mock('@/data/db/settings', () => ({
  DEFAULT_SETTINGS: {
    theme: 'system',
    accentColor: null,
    accentSwatchId: null,
    biometricLock: false,
    quietHoursEnabled: false,
    quietHoursStartMinute: 1320,
    quietHoursEndMinute: 420,
    hasOnboarded: false,
    locale: 'system',
    // privacyConsentDismissed and pinnedMonitorByServer were
    // added to PersistedSettings after this mock was first
    // written. The store reads DEFAULT_SETTINGS at module load
    // time and copies every field onto its initial state, so we
    // need both fields here or the store will be missing them
    // and `pinnedMonitorByServer: null` reads will throw.
    privacyConsentDismissed: false,
    pinnedMonitorByServer: null,
  },
  settingsRepo: {
    load: () => mockLoad(),
    save: (patch: unknown) => mockSave(patch),
    clear: () => mockClear(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useSettings, getCurrentSettings } = require('@/data/store/settings');

describe('settings store', () => {
  beforeEach(() => {
    mockLoad.mockReset();
    mockSave.mockReset();
    mockClear.mockReset();
    // Reset the store to defaults before each test
    useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: false });
  });

  describe('hydrate()', () => {
    it('flips hydrated=true and merges the loaded row on success', async () => {
      mockLoad.mockResolvedValue({
        theme: 'dark',
        accentColor: '#10B981',
        accentSwatchId: null,
        biometricLock: false,
        quietHoursEnabled: false,
        quietHoursStartMinute: 1320,
        quietHoursEndMinute: 420,
        hasOnboarded: true,
      });
      await useSettings.getState().hydrate();
      const s = useSettings.getState();
      expect(s.hydrated).toBe(true);
      expect(s.theme).toBe('dark');
      expect(s.accentColor).toBe('#10B981');
      expect(s.hasOnboarded).toBe(true);
    });

    it('uses defaults if load() returns null', async () => {
      mockLoad.mockResolvedValue(null);
      await useSettings.getState().hydrate();
      const s = useSettings.getState();
      expect(s.hydrated).toBe(true);
      expect(s.theme).toBe('system');
    });

    it('uses defaults if load() throws, and still flips hydrated=true', async () => {
      mockLoad.mockRejectedValue(new Error('boom'));
      // Suppress the expected console.warn
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await useSettings.getState().hydrate();
      const s = useSettings.getState();
      expect(s.hydrated).toBe(true);
      expect(s.theme).toBe('system');
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('setters', () => {
    beforeEach(() => {
      // Pretend we are post-hydrate
      useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: true });
      mockSave.mockResolvedValue({ ...DEFAULT_SETTINGS });
    });

    it('setTheme() updates memory and calls save({ theme })', () => {
      useSettings.getState().setTheme('light');
      expect(useSettings.getState().theme).toBe('light');
      // Allow microtask to flush
      return Promise.resolve().then(() => {
        expect(mockSave).toHaveBeenCalledWith({ theme: 'light' });
      });
    });

    it('setAccentColor() updates memory and calls save({ accentColor })', () => {
      useSettings.getState().setAccentColor('#FF00FF');
      expect(useSettings.getState().accentColor).toBe('#FF00FF');
      return Promise.resolve().then(() => {
        expect(mockSave).toHaveBeenCalledWith({ accentColor: '#FF00FF' });
      });
    });

    it('setBiometricLock() updates memory and calls save()', () => {
      useSettings.getState().setBiometricLock(true);
      expect(useSettings.getState().biometricLock).toBe(true);
      return Promise.resolve().then(() => {
        expect(mockSave).toHaveBeenCalledWith({ biometricLock: true });
      });
    });

    it('setQuietHours() updates memory and calls save() with all three fields', () => {
      useSettings.getState().setQuietHours({
        enabled: true,
        startMinute: 1380,
        endMinute: 480,
      });
      const s = useSettings.getState();
      expect(s.quietHoursEnabled).toBe(true);
      expect(s.quietHoursStartMinute).toBe(1380);
      expect(s.quietHoursEndMinute).toBe(480);
      return Promise.resolve().then(() => {
        expect(mockSave).toHaveBeenCalledWith({
          quietHoursEnabled: true,
          quietHoursStartMinute: 1380,
          quietHoursEndMinute: 480,
        });
      });
    });

    it('setOnboarded() updates memory and calls save()', () => {
      useSettings.getState().setOnboarded(true);
      expect(useSettings.getState().hasOnboarded).toBe(true);
      return Promise.resolve().then(() => {
        expect(mockSave).toHaveBeenCalledWith({ hasOnboarded: true });
      });
    });

    it('setLocale() updates memory, calls save(), and pushes into the i18n module', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getLocale } = require('@/i18n');
      // Reset in case a prior test moved it.
      getLocale(); // touch so require cache is warm
      useSettings.getState().setLocale('fr');
      expect(useSettings.getState().locale).toBe('fr');
      return Promise.resolve().then(() => {
        expect(mockSave).toHaveBeenCalledWith({ locale: 'fr' });
        // The store is responsible for syncing the i18n module so
        // a subsequent t() call uses the new locale.
        expect(getLocale()).toBe('fr');
      });
    });

    it('setters keep the in-memory value even if save() throws', async () => {
      mockSave.mockRejectedValue(new Error('disk full'));
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      useSettings.getState().setTheme('dark');
      expect(useSettings.getState().theme).toBe('dark');
      // Allow the async persist to complete (and swallow the rejection)
      await new Promise((r) => setTimeout(r, 10));
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('setPinnedMonitor()', () => {
    it('pins a monitor for a server when nothing is pinned', () => {
      useSettings.getState().setPinnedMonitor('server-aaa', 42);
      expect(useSettings.getState().pinnedMonitorByServer).toEqual({
        'server-aaa': 42,
      });
      return Promise.resolve().then(() => {
        expect(mockSave).toHaveBeenCalledWith({
          pinnedMonitorByServer: { 'server-aaa': 42 },
        });
      });
    });

    it('moves the pin when a different monitor is pinned for the same server', () => {
      useSettings.getState().setPinnedMonitor('server-aaa', 42);
      useSettings.getState().setPinnedMonitor('server-aaa', 17);
      expect(useSettings.getState().pinnedMonitorByServer).toEqual({
        'server-aaa': 17,
      });
    });

    it('keeps pins for OTHER servers when one server is unpinned', () => {
      useSettings.getState().setPinnedMonitor('server-aaa', 42);
      useSettings.getState().setPinnedMonitor('server-bbb', 99);
      useSettings.getState().setPinnedMonitor('server-aaa', null);
      // server-bbb's pin is still there
      expect(useSettings.getState().pinnedMonitorByServer).toEqual({
        'server-bbb': 99,
      });
    });

    it('writes null (not {}) when the last pin is removed', () => {
      useSettings.getState().setPinnedMonitor('server-aaa', 42);
      useSettings.getState().setPinnedMonitor('server-aaa', null);
      expect(useSettings.getState().pinnedMonitorByServer).toBeNull();
      return Promise.resolve().then(() => {
        // The most recent save() call should have null, not {}.
        const calls = mockSave.mock.calls;
        const lastPatch = calls[calls.length - 1][0];
        expect(lastPatch).toEqual({ pinnedMonitorByServer: null });
      });
    });

    it('is a no-op when unpinning a server that was never pinned', () => {
      mockSave.mockClear();
      useSettings.getState().setPinnedMonitor('server-aaa', null);
      expect(useSettings.getState().pinnedMonitorByServer).toBeNull();
      return Promise.resolve().then(() => {
        // No persist call — we don't need to write "no change" to
        // disk. The defensive check is the in-memory no-op.
        expect(mockSave).not.toHaveBeenCalled();
      });
    });

    it('keeps the in-memory pin even if save() throws', async () => {
      mockSave.mockRejectedValue(new Error('disk full'));
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      useSettings.getState().setPinnedMonitor('server-aaa', 42);
      expect(useSettings.getState().pinnedMonitorByServer).toEqual({
        'server-aaa': 42,
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('resetAll()', () => {
    it('clears on disk and resets in-memory to defaults', async () => {
      mockClear.mockResolvedValue(undefined);
      useSettings.setState({
        theme: 'dark',
        accentColor: '#FF00FF',
        accentSwatchId: 'magenta',
        biometricLock: true,
        quietHoursEnabled: true,
        quietHoursStartMinute: 1380,
        quietHoursEndMinute: 480,
        hasOnboarded: true,
        hydrated: true,
      });
      await useSettings.getState().resetAll();
      const s = useSettings.getState();
      expect(s.theme).toBe('system');
      expect(s.accentColor).toBeNull();
      expect(s.biometricLock).toBe(false);
      expect(s.hasOnboarded).toBe(false);
      expect(s.hydrated).toBe(true);
      expect(mockClear).toHaveBeenCalled();
    });
  });

  describe('getCurrentSettings()', () => {
    it('returns a plain-object snapshot of the persisted fields', () => {
      useSettings.setState({
        theme: 'dark',
        accentColor: '#10B981',
        accentSwatchId: 'forest',
        biometricLock: true,
        quietHoursEnabled: false,
        quietHoursStartMinute: 1320,
        quietHoursEndMinute: 420,
        hasOnboarded: true,
        locale: 'de',
        hydrated: true,
      });
      expect(getCurrentSettings()).toEqual({
        theme: 'dark',
        accentColor: '#10B981',
        accentSwatchId: 'forest',
        biometricLock: true,
        quietHoursEnabled: false,
        quietHoursStartMinute: 1320,
        quietHoursEndMinute: 420,
        hasOnboarded: true,
        locale: 'de',
        // Defaults from the unset fields — the test above didn't
        // touch these so they fall through to DEFAULT_SETTINGS.
        privacyConsentDismissed: false,
        pinnedMonitorByServer: null,
      });
    });
  });
});
