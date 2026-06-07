/**
 * Global Jest setup. Runs before each test file.
 *
 * We mock expo-secure-store globally with an in-memory map so tests
 * can exercise the round-trip without touching native code.
 */

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    getItemAsync: jest.fn(async (key: string) => {
      return store.has(key) ? store.get(key)! : null;
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    isAvailableAsync: jest.fn(async () => true),
    // Test helper: clear the in-memory store between tests
    __clearStore: () => store.clear(),
  };
});

// `expo-sqlite` requires the native module to construct, which is unavailable
// in Node. The repository layer touches SQLite on import (via the singleton
// `getDatabase()`), so we stub the whole module out — the tests that need
// real DB behavior are the integration tests, which are not in this unit
// suite yet. The stub mirrors the API surface used by `src/data/db/`.
jest.mock('expo-sqlite', () => {
  const inMemoryRows: unknown[] = [];
  const fakeDb = {
    execAsync: jest.fn(async () => {}),
    runAsync: jest.fn(async () => ({ lastInsertRowId: 0, changes: 0 })),
    getAllAsync: jest.fn(async () => inMemoryRows),
    getFirstAsync: jest.fn(async () => null),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    closeAsync: jest.fn(async () => {}),
    __setRows: (rows: unknown[]) => {
      inMemoryRows.length = 0;
      inMemoryRows.push(...rows);
    },
  };
  return {
    __esModule: true,
    openDatabaseAsync: jest.fn(async () => fakeDb),
    openDatabaseSync: jest.fn(() => fakeDb),
    SQLiteDatabase: jest.fn(),
  };
});
