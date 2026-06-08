/**
 * SQLite schema for Uptime Pocket.
 *
 * Why raw SQL instead of drizzle-orm?
 * ----------------------------------
 * We have drizzle-orm in our devDeps (and the plan mentioned it), but for
 * v0.3.0 we ship a hand-written schema. The reasoning:
 *
 *   1. The npm-audit high-severity warning on drizzle-orm 0.36 (SQL injection
 *      via improperly escaped SQL identifiers) is a blocker we'd rather
 *      not absorb right before a public release.
 *   2. The queries we need (CRUD on a handful of tables) are simple and
 *      raw SQL is easier to audit than a generated query builder.
 *   3. We can swap to drizzle-orm later — the SQL is portable.
 *
 * Tables
 * ------
 * - `schema_version` — tracks which migrations have been applied.
 * - `servers` — server metadata (name, url, kind, notification mode,
 *   detected kuma version, last connected at, created at). NOTE: secrets
 *   (bearer tokens, passwords) are NEVER stored here — they live in
 *   expo-secure-store (iOS Keychain / Android Keystore), keyed by id.
 *
 * Future tables (Phase 3+)
 * -------------------------
 * - `monitors_cache` — last known monitor list per server, for offline view.
 * - `heartbeats` — recent heartbeats for charts when offline.
 * - `incidents` — local incident history.
 * - `tags` — Kuma tags.
 *
 * These are added by later migration steps. We never edit a past
 * migration — only add new ones with a higher version number.
 */

/**
 * Current schema version. Bump this when adding a new migration.
 * The migration runner reads this and applies any newer ones.
 *
 * Version history:
 *   1 - servers table
 *   2 - settings table (app-level persisted settings)
 *   3 - settings.locale column (i18n)
 *   4 - settings.sentry_enabled column (opt-in crash reporting)
 *   5 - settings.privacy_consent_dismissed column (first-launch consent)
 *
 * The actual SQL for each migration lives in `migrate.ts` (MIGRATIONS),
 * NOT here. This file just declares the version number.
 */
export const SCHEMA_VERSION = 5;

/**
 * Column name → row field mapping helpers. Centralized so we don't have
 * to remember which side uses snake_case and which uses camelCase.
 */
export const SERVER_COLUMNS = [
  'id',
  'name',
  'url',
  'auth_kind',
  'notification_mode',
  'kuma_version',
  'connected',
  'last_connected_at',
  'created_at',
] as const;
