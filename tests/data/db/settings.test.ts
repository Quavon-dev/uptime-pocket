/**
 * Tests for the settings repository.
 *
 * We mock `expo-sqlite` at the module level to return a hand-rolled
 * in-memory store. This keeps the tests fast and lets us assert the
 * exact SQL and bind parameters the repo uses.
 */

import { DEFAULT_SETTINGS } from '@/data/db/settings';

// ----- Mock expo-sqlite with an in-memory store -----

interface FakeRow {
  [key: string]: unknown;
}

const tables: Record<string, FakeRow[]> = {
  settings: [],
  schema_version: [],
};

// Captured so individual tests can override the implementation.
const mockRunAsync: jest.Mock = jest.fn(async () => {});

// Default write implementation: mirrors the real repo's SQL behavior
// against the in-memory `tables` store, so tests that don't override
// the mock still see realistic reads after writes.
const defaultWriteImpl = async (sql: string, ...params: unknown[]) => {
  const upper = sql.trim().toUpperCase();
  if (upper.startsWith('INSERT OR REPLACE INTO SETTINGS')) {
    tables.settings = [
      {
        id: 'app',
        theme: params[0],
        accent_color: params[1],
        biometric_lock: params[2],
        quiet_hours_enabled: params[3],
        quiet_hours_start: params[4],
        quiet_hours_end: params[5],
        has_onboarded: params[6],
        accent_swatch_id: params[7],
        updated_at: params[8],
      },
    ];
  } else if (upper.startsWith('DELETE FROM SETTINGS')) {
    tables.settings = [];
  } else if (upper.startsWith('INSERT OR REPLACE INTO SCHEMA_VERSION')) {
    tables.schema_version = [{ version: params[0] }];
  }
};

mockRunAsync.mockImplementation(defaultWriteImpl);

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({
    execAsync: jest.fn(async () => {}),
    runAsync: (...args: unknown[]) => mockRunAsync(...args),
    getFirstAsync: jest.fn(async (sql: string) => {
      const upper = sql.trim().toUpperCase();
      if (upper.startsWith('SELECT VERSION FROM SCHEMA_VERSION')) {
        return tables.schema_version[0] ?? null;
      }
      if (upper.startsWith('SELECT') && upper.includes('FROM SETTINGS')) {
        return tables.settings[0] ?? null;
      }
      return null;
    }),
    getAllAsync: jest.fn(async () => []),
  })),
}));

// Import after the mock is set up
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { settingsRepo } from '@/data/db/settings';

describe('settingsRepo', () => {
  beforeEach(() => {
    tables.settings = [];
    tables.schema_version = [];
    mockRunAsync.mockReset();
    mockRunAsync.mockImplementation(defaultWriteImpl);
  });

  describe('load()', () => {
    it('returns null when no row has been written', async () => {
      const result = await settingsRepo.load();
      expect(result).toBeNull();
    });

    it('returns a normalized PersistedSettings when a row exists', async () => {
      // Simulate a previously-written row.
      tables.settings = [
        {
          id: 'app',
          theme: 'dark',
          accent_color: '#FF00FF',
          biometric_lock: 1,
          quiet_hours_enabled: 1,
          quiet_hours_start: 1380,
          quiet_hours_end: 420,
          has_onboarded: 1,
          accent_swatch_id: 'magenta',
          updated_at: '2026-06-01T00:00:00.000Z',
        },
      ];
      const result = await settingsRepo.load();
      expect(result).toEqual({
        theme: 'dark',
        accentColor: '#FF00FF',
        accentSwatchId: 'magenta',
        biometricLock: true,
        quietHoursEnabled: true,
        quietHoursStartMinute: 1380,
        quietHoursEndMinute: 420,
        hasOnboarded: true,
      });
    });

    it('maps 0/1 to false/true for boolean columns', async () => {
      tables.settings = [
        {
          id: 'app',
          theme: 'system',
          accent_color: null,
          biometric_lock: 0,
          quiet_hours_enabled: 0,
          quiet_hours_start: 1320,
          quiet_hours_end: 420,
          has_onboarded: 0,
          accent_swatch_id: null,
          updated_at: '2026-06-01T00:00:00.000Z',
        },
      ];
      const result = await settingsRepo.load();
      expect(result?.biometricLock).toBe(false);
      expect(result?.quietHoursEnabled).toBe(false);
      expect(result?.hasOnboarded).toBe(false);
    });
  });

  describe('save()', () => {
    it('inserts a full row when nothing exists yet, filling from defaults', async () => {
      const result = await settingsRepo.save({ theme: 'light' });
      expect(result.theme).toBe('light');
      // All other fields should be defaults
      expect(result.accentColor).toBe(DEFAULT_SETTINGS.accentColor);
      expect(result.biometricLock).toBe(DEFAULT_SETTINGS.biometricLock);
      expect(result.quietHoursEnabled).toBe(DEFAULT_SETTINGS.quietHoursEnabled);
    });

    it('merges with the existing row on subsequent writes', async () => {
      await settingsRepo.save({ theme: 'light' });
      const next = await settingsRepo.save({ biometricLock: true });
      expect(next.theme).toBe('light'); // preserved from previous write
      expect(next.biometricLock).toBe(true);
    });

    it('converts booleans to 0/1 on write', async () => {
      // Reset to a recording-only mock so we can inspect bind params
      // without the default implementation overwriting them.
      mockRunAsync.mockReset();
      const writeSpy = mockRunAsync;

      await settingsRepo.save({ biometricLock: true, hasOnboarded: true });
      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO settings'),
        'system', // theme (default)
        null, // accentColor
        1, // biometricLock
        0, // quietHoursEnabled (default)
        DEFAULT_SETTINGS.quietHoursStartMinute,
        DEFAULT_SETTINGS.quietHoursEndMinute,
        1, // hasOnboarded
        null, // accentSwatchId
        expect.any(String) // updated_at
      );
    });

    it('returns the merged state', async () => {
      const result = await settingsRepo.save({
        theme: 'dark',
        quietHoursStartMinute: 1380,
        quietHoursEndMinute: 480,
      });
      expect(result).toMatchObject({
        theme: 'dark',
        quietHoursStartMinute: 1380,
        quietHoursEndMinute: 480,
      });
    });
  });

  describe('clear()', () => {
    it('removes the row', async () => {
      await settingsRepo.save({ theme: 'dark' });
      expect(await settingsRepo.load()).not.toBeNull();
      await settingsRepo.clear();
      expect(await settingsRepo.load()).toBeNull();
    });
  });
});
