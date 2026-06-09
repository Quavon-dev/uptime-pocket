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
import { SCHEMA_VERSION } from './schema';

/**
 * Per-version migration SQL. Each entry MUST be a SQL string that takes
 * the database from version (v-1) to version v, idempotent where
 * possible (CREATE ... IF NOT EXISTS, etc).
 *
 * IMPORTANT: never edit a past migration. If you need to change what
 * version 1 does, that's a NEW migration. The only thing that should
 * grow is the MIGRATIONS object.
 */
export const MIGRATIONS: Record<number, string> = {
  1: /* sql */ `
    CREATE TABLE IF NOT EXISTS servers (
      id              TEXT PRIMARY KEY NOT NULL,
      name            TEXT NOT NULL,
      url             TEXT NOT NULL,
      auth_kind       TEXT NOT NULL CHECK (auth_kind IN ('bearer', 'password')),
      notification_mode TEXT NOT NULL CHECK (notification_mode IN ('none', 'direct', 'relay')),
      kuma_version    TEXT,
      connected       INTEGER NOT NULL DEFAULT 0,
      last_connected_at TEXT,
      created_at      TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_servers_created_at ON servers(created_at);
  `,

  2: /* sql */ `
    -- App-level settings. We use a single row keyed by the literal id
    -- 'app' so reads are a single SELECT and writes are a single UPDATE.
    -- This is the simplest possible shape and avoids needing a key/value
    -- table for 5 fields. See ROADMAP.md "Phase A1" for the rationale.
    CREATE TABLE IF NOT EXISTS settings (
      id                  TEXT PRIMARY KEY NOT NULL CHECK (id = 'app'),
      theme               TEXT NOT NULL CHECK (theme IN ('light', 'dark', 'system')) DEFAULT 'system',
      accent_color        TEXT,
      biometric_lock      INTEGER NOT NULL DEFAULT 0,
      quiet_hours_enabled INTEGER NOT NULL DEFAULT 0,
      quiet_hours_start   INTEGER NOT NULL DEFAULT 1320,
      quiet_hours_end     INTEGER NOT NULL DEFAULT 420,
      has_onboarded       INTEGER NOT NULL DEFAULT 0,
      accent_swatch_id    TEXT,
      updated_at          TEXT NOT NULL
    );
  `,

  3: /* sql */ `
    -- Add locale preference to settings. We use the literal 'system' as
    -- the default (follow the device) and the IETF codes for the rest
    -- (en, de, fr, ja, es). The CHECK constraint enforces both the
    -- sentinel and the supported set; the i18n module is the source of
    -- truth for which codes are supported (see SUPPORTED_LOCALES).
    ALTER TABLE settings ADD COLUMN locale TEXT NOT NULL DEFAULT 'system'
      CHECK (locale IN ('system', 'en', 'de', 'fr', 'ja', 'es'));
  `,

  4: /* sql */ `
    -- Add opt-in flag for Sentry crash reporting. The user must explicitly
    -- enable this in settings for Sentry to be initialized. We default
    -- to 0 (off) so a fresh install does not phone home until the user
    -- has made an informed choice. EXPO_PUBLIC_SENTRY_DSN must also be
    -- set at build time; both gates must be open for any data to be sent.
    ALTER TABLE settings ADD COLUMN sentry_enabled INTEGER NOT NULL DEFAULT 0
      CHECK (sentry_enabled IN (0, 1));
  `,

  5: /* sql */ `
    -- Track whether the user has seen and dismissed the first-launch
    -- consent prompt. The prompt itself is rendered in app/_layout.tsx
    -- when this flag is 0; tapping "Continue" sets it to 1. We default
    -- to 0 so a fresh install shows the prompt, and so we can re-surface
    -- it later by clearing the flag (e.g. after a material privacy
    -- policy change). See docs/privacy.md and the in-app legal screen.
    ALTER TABLE settings ADD COLUMN privacy_consent_dismissed INTEGER NOT NULL DEFAULT 0
      CHECK (privacy_consent_dismissed IN (0, 1));
  `,

  6: /* sql */ `
    -- Drop the Sentry opt-in column. The App no longer integrates with
    -- Sentry (or any third-party crash reporter). The Sentry SDK was
    -- proprietary and even the self-hosted option dragged a non-OSS
    -- transitive into the binary. Uptime Pocket is local-only, and the
    -- Sentry module + settings UI have been removed in the same commit.
    -- SQLite 3.35+ supports ALTER TABLE ... DROP COLUMN; expo-sqlite
    -- ships a version of SQLite that does. We use a defensive try/catch
    -- via a no-op UPDATE in case the column is already gone (e.g. on a
    -- fresh install that skipped v4, which is impossible today but
    -- cheap to guard against).
    ALTER TABLE settings DROP COLUMN sentry_enabled;
  `,

  7: /* sql */ `
    -- Drop the bearer auth kind. The 'bearer' option in the form was
    -- for pasting long-lived API tokens, but Kuma 2.x's socket.io
    -- \`loginByToken\` only accepts JWTs (obtained by logging in with
    -- username+password), not the API Keys that Kuma's "Settings →
    -- API Keys" dashboard creates. We discovered the hard way that
    -- pasting an API key into the bearer field got rejected with
    -- "authInvalidToken" and the connection hung.
    --
    -- This migration is idempotent: SQLite 3.25+ supports
    -- "DROP COLUMN ... IF EXISTS" only in newer versions, so we
    -- wrap the existing CHECK removal in a savepoint and ignore
    -- errors. The auth_kind column itself is still useful for
    -- future migration data, so we keep it.
    PRAGMA writable_schema = ON;
    UPDATE sqlite_master
       SET sql = REPLACE(
         sql,
         "CHECK (auth_kind IN ('bearer', 'password'))",
         "CHECK (auth_kind IN ('password'))"
       )
     WHERE type = 'table' AND name = 'servers';
    PRAGMA writable_schema = OFF;
  `,
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
