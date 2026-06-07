/**
 * Idempotent migration runner for our SQLite database.
 *
 * `migrate()` is safe to call on every app launch — it checks the
 * current `schema_version` row and applies any newer versions. The
 * create-table statements all use `IF NOT EXISTS`, so we never blow
 * up on a re-run.
 *
 * For now there's only one schema version, so this is mostly a no-op
 * after the first run. Future migrations add to the MIGRATIONS array
 * with a strictly increasing version number.
 */

import { type SQLiteDatabase } from 'expo-sqlite';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

/**
 * Each migration is keyed by its target schema version.
 * The runner applies every migration strictly newer than the stored version,
 * in order.
 *
 * Each entry is a SQL string. The CREATE TABLE statements are idempotent
 * (IF NOT EXISTS) so re-runs are safe.
 */
const MIGRATIONS: Record<number, string> = {
  1: SCHEMA_SQL,
};

const DB_NAME = 'uptime-pocket.db';

/**
 * Open the database and run all pending migrations.
 *
 * @param db An already-opened `SQLiteDatabase` instance. The caller owns
 *           the connection lifecycle (typically via a singleton in
 *           `index.ts`).
 */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  // Make sure the schema_version table exists before we try to read it.
  // This is the one statement that's NOT in MIGRATIONS[v1] so we can
  // start tracking versions even on a fresh DB.
  await db.execAsync(/* sql */ `
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `);

  const currentVersion = await getCurrentVersion(db);

  const targetVersion = SCHEMA_VERSION;

  if (currentVersion >= targetVersion) {
    return; // already up to date
  }

  // Apply each migration in order, one version at a time.
  for (let v = currentVersion + 1; v <= targetVersion; v++) {
    const sql = MIGRATIONS[v];
    if (!sql) {
      throw new Error(
        `Migration v${v} is missing from MIGRATIONS. Add it to migrate.ts before bumping SCHEMA_VERSION.`
      );
    }
    await db.execAsync(sql);
    await db.runAsync(
      'INSERT OR REPLACE INTO schema_version (version) VALUES (?)',
      v
    );
  }
}

async function getCurrentVersion(db: SQLiteDatabase): Promise<number> {
  try {
    const row = await db.getFirstAsync<{ version: number }>(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
    );
    return row?.version ?? 0;
  } catch {
    return 0;
  }
}

export { DB_NAME };
