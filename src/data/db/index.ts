/**
 * Database singleton + server repository.
 *
 * The `getDatabase()` call returns a memoized `SQLiteDatabase` so we
 * open the file once per app launch. The `migrate()` call runs
 * idempotent migrations on first use.
 *
 * The `serversRepo` is the only place that should touch the `servers`
 * table directly — every other module goes through these functions.
 */

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { DB_NAME, migrate } from './migrate';
import { SERVER_COLUMNS } from './schema';
import type { Server, NotificationMode } from '@/domain/models';

let dbPromise: Promise<SQLiteDatabase> | null = null;

/**
 * Returns the singleton database instance, opening + migrating on first use.
 */
export async function getDatabase(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await openDatabaseAsync(DB_NAME);
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

/** Row shape as it lives in SQLite (snake_case). */
interface ServerRow {
  id: string;
  name: string;
  url: string;
  auth_kind: 'password';
  notification_mode: NotificationMode;
  kuma_version: string | null;
  connected: number; // 0 | 1
  last_connected_at: string | null; // ISO
  created_at: string; // ISO
}

/** Map a DB row to a domain Server (auth kind is reconstructed; secrets come from SecureStore). */
function rowToServer(row: ServerRow): Server {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    authKind: 'password',
    notificationMode: row.notification_mode,
    kumaVersion: row.kuma_version ?? undefined,
    connected: row.connected === 1,
    lastConnectedAt: row.last_connected_at ? new Date(row.last_connected_at) : undefined,
    createdAt: new Date(row.created_at),
  };
}

function serverToRow(server: Server): ServerRow {
  return {
    id: server.id,
    name: server.name,
    url: server.url,
    auth_kind: server.authKind,
    notification_mode: server.notificationMode,
    kuma_version: server.kumaVersion ?? null,
    connected: server.connected ? 1 : 0,
    last_connected_at: server.lastConnectedAt ? server.lastConnectedAt.toISOString() : null,
    created_at: server.createdAt.toISOString(),
  };
}

/**
 * Repository: the only place that touches the `servers` table.
 *
 * Note: this never reads or writes secrets (tokens, passwords). Those
 * live in SecureStore, keyed by server id.
 */
export const serversRepo = {
  /** Load all servers, ordered by created_at ascending. */
  async listAll(): Promise<Server[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<ServerRow>(
      `SELECT ${SERVER_COLUMNS.join(', ')} FROM servers ORDER BY created_at ASC`
    );
    return rows.map(rowToServer);
  },

  /** Insert or update a server row. */
  async upsert(server: Server): Promise<void> {
    const db = await getDatabase();
    const row = serverToRow(server);
    await db.runAsync(
      `INSERT OR REPLACE INTO servers (${SERVER_COLUMNS.join(', ')})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.name,
      row.url,
      row.auth_kind,
      row.notification_mode,
      row.kuma_version,
      row.connected,
      row.last_connected_at,
      row.created_at
    );
  },

  /** Delete a server by id. */
  async remove(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM servers WHERE id = ?`, id);
  },

  /** Update only the connection state. Used by the connection manager. */
  async setConnected(id: string, connected: boolean): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE servers
         SET connected = ?,
             last_connected_at = ?
       WHERE id = ?`,
      connected ? 1 : 0,
      connected ? new Date().toISOString() : null,
      id
    );
  },

  /** Update only the detected kuma version. */
  async setKumaVersion(id: string, version: string | null): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE servers SET kuma_version = ? WHERE id = ?`,
      version,
      id
    );
  },

  /** Update only the notification mode. */
  async setNotificationMode(id: string, mode: NotificationMode): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE servers SET notification_mode = ? WHERE id = ?`,
      mode,
      id
    );
  },
};
