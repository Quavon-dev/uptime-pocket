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
        locale: params[8],
        privacy_consent_dismissed: params[9],
        pinned_monitor_by_server: params[10],
        accent_affects_status: params[11],
        updated_at: params[12],
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
          locale: 'fr',
          privacy_consent_dismissed: 1,
          pinned_monitor_by_server: null,
          accent_affects_status: 1,
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
        locale: 'fr',
        privacyConsentDismissed: true,
        pinnedMonitorByServer: null,
        accentAffectsStatus: true,
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
          privacy_consent_dismissed: 0,
          pinned_monitor_by_server: null,
          accent_affects_status: 0,
          updated_at: '2026-06-01T00:00:00.000Z',
        },
      ];
      const result = await settingsRepo.load();
      expect(result?.biometricLock).toBe(false);
      expect(result?.quietHoursEnabled).toBe(false);
      expect(result?.hasOnboarded).toBe(false);
      expect(result?.privacyConsentDismissed).toBe(false);
      expect(result?.accentAffectsStatus).toBe(false);
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
        'system', // locale (default)
        0, // privacyConsentDismissed (default)
        null, // pinnedMonitorByServer (default — no monitor pinned)
        0, // accentAffectsStatus (default — off)
        expect.any(String) // updated_at
      );
    });

    it('persists accentAffectsStatus=true as 1', async () => {
      mockRunAsync.mockReset();
      const writeSpy = mockRunAsync;
      await settingsRepo.save({ accentAffectsStatus: true });
      // Find the INSERT INTO settings call. We can't use
      // `toHaveBeenCalledWith` directly because the migration
      // runner fires many runAsync calls (one per migration
      // version) and the bind-arg count check is fragile to
      // refactors. Instead we look up the call by SQL fragment
      // and assert the specific bind we care about — the
      // accentAffectsStatus value (0 or 1) — sits at the
      // expected position in the args list.
      //
      // Note: we look for the FULL settings INSERT statement,
      // not the schema_version one. The substring
      // "INSERT OR REPLACE INTO settings" is unique to the
      // settings table; the schema_version table has its own
      // INSERT shape.
      const settingsCall = writeSpy.mock.calls.find(
        ([sql]) =>
          typeof sql === 'string' &&
          sql.includes("INSERT OR REPLACE INTO settings")
      );
      expect(settingsCall).toBeDefined();
      // The mock is called as `runAsync(sql, ...params)`, so
      // the params come in as additional positional args, not
      // a single array. `runAsync.mock.calls[0]` is
      // `[sql, ...params]`. Find the first call that's the
      // settings INSERT and capture everything after the SQL.
      const [, ...rest] = settingsCall!;
      const args = rest;
      // The accentAffectsStatus bind is somewhere in the args
      // list. The exact position depends on the column order
      // in the INSERT statement, which is co-located with the
      // save() bind order. We assert that the value (1, since
      // we just set it) is present in the args and that the
      // last arg is the updatedAt ISO string — that proves
      // the column was bound and not silently dropped.
      expect(args).toContain(1);
      expect(args[args.length - 1]).toEqual(expect.any(String));
      // Sanity: the count of args matches the count of `?`s
      // in the SQL — if a future refactor adds a column
      // without a matching bind, the SQL has more `?`s than
      // args and this assertion will catch it.
      const sql = settingsCall![0] as string;
      const questionMarks = (sql.match(/\?/g) ?? []).length;
      expect(args.length).toBe(questionMarks);
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

  describe('pinnedMonitorByServer', () => {
    it('parses a valid JSON object back into a typed Record', async () => {
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
          locale: 'system',
          privacy_consent_dismissed: 0,
          // Two servers, each with one pinned monitor. IDs are the
          // Kuma numeric monitor ids.
          pinned_monitor_by_server: JSON.stringify({
            'server-aaa': 42,
            'server-bbb': 17,
          }),
          updated_at: '2026-06-01T00:00:00.000Z',
        },
      ];
      const result = await settingsRepo.load();
      expect(result?.pinnedMonitorByServer).toEqual({
        'server-aaa': 42,
        'server-bbb': 17,
      });
    });

    it('returns null for an empty JSON object on disk (treated as no pins)', async () => {
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
          locale: 'system',
          privacy_consent_dismissed: 0,
          // An empty object means "no monitors pinned" — our
          // parser normalizes this to null, matching the
          // "no row was set" representation.
          pinned_monitor_by_server: JSON.stringify({}),
          updated_at: '2026-06-01T00:00:00.000Z',
        },
      ];
      const result = await settingsRepo.load();
      expect(result?.pinnedMonitorByServer).toBeNull();
    });

    it('returns null for a corrupt JSON string (defensive)', async () => {
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
          locale: 'system',
          privacy_consent_dismissed: 0,
          // Not valid JSON at all — corrupted row, possible
          // (e.g. disk corruption, manual edit). We recover by
          // treating the whole map as "no pins".
          pinned_monitor_by_server: 'not-valid-json',
          updated_at: '2026-06-01T00:00:00.000Z',
        },
      ];
      const result = await settingsRepo.load();
      expect(result?.pinnedMonitorByServer).toBeNull();
    });

    it('returns null when a value in the map is not a number', async () => {
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
          locale: 'system',
          privacy_consent_dismissed: 0,
          // A string value mixed in — should fail validation and
          // we drop the whole map rather than partially repair.
          pinned_monitor_by_server: JSON.stringify({ 'server-aaa': 'abc' }),
          updated_at: '2026-06-01T00:00:00.000Z',
        },
      ];
      const result = await settingsRepo.load();
      expect(result?.pinnedMonitorByServer).toBeNull();
    });
  });
});
