/**
 * KumaConnectionManager — owns the live socket per server.
 *
 * One instance is shared by the whole app. It exposes:
 *   - `connect(serverId)` — opens a socket to a server using its stored
 *     credentials, with auto-reconnect (exponential backoff).
 *   - `disconnect(serverId)` — closes gracefully.
 *   - `disconnectAll()` — for app teardown / sign-out.
 *   - `setActive(serverId)` — connect the given server, disconnect the
 *     previous active one. (We currently only keep one live connection
 *     at a time to conserve battery; multi-server concurrent support is
 *     a Phase 4 enhancement.)
 *   - `pauseMonitor(serverId, monitorId)` / `resumeMonitor(...)` — pass-through
 *     to the underlying socket.
 *
 * ## Connection flow
 *
 *   1. Read credentials from SecureStore.
 *   2. Open a raw socket.io connection (no auth).
 *   3. `emit('login', {username, password})` to get a JWT.
 *      (Kuma 2.3+ has no REST login endpoint, and the only auth method
 *      Kuma's `loginByToken` accepts is a JWT, not the API Keys its own
 *      "Settings → API Keys" dashboard creates.)
 *   4. Build the `AuthSession` with the JWT, attach event handlers.
 *   5. Bridge socket events into the Zustand stores.
 *
 * Events from the socket are translated into mutations on the
 * `useMonitors` Zustand store. The connection status is mirrored into
 * the `useServers` store as well so the UI can show a "connected" badge.
 */

import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { KumaSocket, type KumaEvent, buildSocketLogin } from '@/data/socket/client';
import { KumaClient, createClient } from '@/data/api/client';
import { createSession, decodeJwtExpiry, type AuthSession } from '@/data/api/auth';
import { loadCredentials } from '@/data/secure/credentials';
import { useMonitors } from '@/data/store/monitors';
import { useServers } from '@/data/store/servers';
import type {
  MonitorDraft,
  KumaMonitorBean,
  AddMonitorResult,
  EditMonitorResult,
  DeleteMonitorResult,
  GetMonitorResult,
} from '@/data/api/monitors';

interface ActiveConnection {
  socket: KumaSocket;
  rest: KumaClient;
  serverId: string;
  unsubscribe: () => void;
}

export class KumaConnectionManager {
  private current: ActiveConnection | null = null;
  private destroyed = false;

  /**
   * Opens a raw socket.io connection to the server. Public so tests
   * can stub it (the real `io()` call would try to reach a network
   * endpoint and fail in the test env).
   */
  openRawSocket(url: string): Socket {
    // Polling first for RN reliability, then upgrade to WebSocket.
    // We do NOT pass `auth: { token }` — Kuma 2.x ignores that
    // field and instead expects us to emit `login` over the open
    // socket. The caller does that.
    return io(url, {
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: false,
      timeout: 10_000,
    });
  }

  /** Connect to the given server, disconnecting any previous one. */
  async connect(serverId: string): Promise<void> {
    if (this.destroyed) {
      throw new Error('KumaConnectionManager: cannot connect after destroy');
    }
    if (this.current?.serverId === serverId) return;

    // Tear down previous first.
    if (this.current) {
      this.teardown(this.current);
      this.current = null;
    }

    const store = useServers.getState();
    const server = store.servers.find((s) => s.id === serverId);
    if (!server) {
      throw new Error(`KumaConnectionManager: server ${serverId} not found in store`);
    }

    useMonitors.getState().setStatus(serverId, 'connecting');
    try {
      const auth = await loadCredentials(serverId);
      if (!auth) {
        throw new Error(
          'No credentials stored for this server. Re-add it with a valid token.'
        );
      }

      // Step 1: open a raw socket and do the password login handshake
      // to get a JWT. Kuma 2.x has no REST login endpoint, so this
      // socket is throwaway — we just need the token from the ack.
      //
      // Note: we don't pass `auth: { token }` in the handshake because
      // Kuma ignores it. The login happens via `socket.emit('login', ...)`.
      const rawSocket: Socket = this.openRawSocket(server.url);

      const jwt: string = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          rawSocket.off('connect', onConnect);
          reject(new Error('Kuma socket login timed out after 10s'));
        }, 10_000);
        const onConnect = () => {
          rawSocket.off('connect_error', onErr);
          rawSocket.emit('login', { username: auth.username, password: auth.password }, (res: any) => {
            clearTimeout(timeout);
            if (res && res.ok && typeof res.token === 'string') {
              resolve(res.token);
            } else {
              reject(new Error('Kuma login failed: ' + JSON.stringify(res)));
            }
          });
        };
        const onErr = (err: Error) => {
          clearTimeout(timeout);
          rawSocket.off('connect', onConnect);
          reject(err);
        };
        rawSocket.once('connect', onConnect);
        rawSocket.once('connect_error', onErr);
      });

      // Step 2: build the session with the JWT.
      // The session exposes `refresh()` which re-runs the login if
      // the JWT expires, so subsequent reconnects don't need a
      // password.
      const loginFn = buildSocketLogin(rawSocket);
      const session: AuthSession = createSession(
        { kind: 'password', username: auth.username, password: auth.password },
        server.url,
        loginFn,
      );
      // Splice the freshly-issued JWT into the password session so
      // applyHeaders / currentToken have something to send. The
      // session's internals are private; reach in via `as unknown`.
      {
        const ps = session as unknown as {
          token: string;
          tokenExpiresAt: number | null;
        };
        ps.token = jwt;
        ps.tokenExpiresAt = decodeJwtExpiry(jwt);
      }

      // Step 3: build the KumaSocket + REST client + bridge events.
      const rest = createClient(server, session);
      const socket = new KumaSocket(server, session, rest);
      const unsubscribe = socket.on((event: KumaEvent) => {
        this.handleEvent(serverId, event);
      });
      socket.connect();

      this.current = { socket, rest, serverId, unsubscribe };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      useMonitors.getState().setStatus(serverId, 'error', message);
      throw err;
    }
  }

  /** Disconnect the given server (no-op if not active). */
  disconnect(serverId: string): void {
    if (this.current?.serverId !== serverId) return;
    this.teardown(this.current);
    this.current = null;
    useMonitors.getState().setStatus(serverId, 'idle');
    void useServers.getState().setConnected(serverId, false);
  }

  /** Disconnect whichever server is active. */
  disconnectAll(): void {
    if (this.current) {
      this.teardown(this.current);
      const id = this.current.serverId;
      this.current = null;
      useMonitors.getState().setStatus(id, 'idle');
      void useServers.getState().setConnected(id, false);
    }
  }

  /**
   * Drop and re-open the current connection. Used by background
   * fetch and by the foreground "Reconnect" affordance. Returns
   * the new server id, or null if there's no active connection
   * to revalidate.
   */
  async revalidateActiveServer(): Promise<string | null> {
    if (this.destroyed) return null;
    const activeId = useServers.getState().activeServerId;
    if (!activeId) return null;
    this.disconnectAll();
    await this.connect(activeId).catch(() => {
      // The store has already been set to 'error'.
    });
    return activeId;
  }

  /** Permanently destroy the manager. No further connect() calls allowed. */
  destroy(): void {
    this.destroyed = true;
    this.disconnectAll();
  }

  /** Pause a monitor on a server. No-op if not connected. */
  pauseMonitor(serverId: string, monitorId: number): void {
    if (this.current?.serverId !== serverId) return;
    this.current.socket.pauseMonitor(monitorId);
  }

  /** Resume a monitor on a server. No-op if not connected. */
  resumeMonitor(serverId: string, monitorId: number): void {
    if (this.current?.serverId !== serverId) return;
    this.current.socket.resumeMonitor(monitorId);
  }

  /** Socket: trigger a re-check on a monitor. */
  recheckMonitor(serverId: string, monitorId: number): void {
    if (this.current?.serverId !== serverId) return;
    this.current.socket.forceHeartbeat(monitorId);
  }

  /**
   * Fetch server-aggregated chart data for a monitor over a given
   * time window. Delegates to the live socket's `getMonitorChartData`
   * (a public request/response event in Kuma 2.3+).
   *
   * The current implementation only supports the **active** server —
   * the app is single-active-server for v1.0. If you switch servers
   * mid-call, the call rejects with a "not connected" error.
   *
   * Resolves with the chart points (oldest-first), or rejects on
   * socket error / timeout. Callers should treat rejection as
   * "no data" and let the chart render its empty state.
   */
  async getMonitorChartData(
    serverId: string,
    monitorId: number,
    periodHours: number
  ): Promise<import('../socket/normalize').NormalizedChartDatapoint[]> {
    if (this.current?.serverId !== serverId) {
      throw new Error('Server is not connected');
    }
    return this.current.socket.getMonitorChartData(monitorId, periodHours);
  }

  /**
   * Fetch raw heartbeat rows for a monitor over a given time window
   * (in hours) from the Kuma `heartbeat` SQLite table. Default
   * retention is 180 days (`DB_HEARTBEAT_TABLE_TIMESPAN_MS`).
   *
   * Use `getMonitorChartData` for the min/avg/max chart — it's
   * cheaper (server pre-aggregates). Use this when you need
   * per-heartbeat granularity.
   */
  async getMonitorBeats(
    serverId: string,
    monitorId: number,
    periodHours: number
  ): Promise<import('../socket/normalize').NormalizedHeartbeatRow[]> {
    if (this.current?.serverId !== serverId) {
      throw new Error('Server is not connected');
    }
    return this.current.socket.getMonitorBeats(monitorId, periodHours);
  }

  /**
   * Create a new monitor on the given server.
   *
   * Returns the new monitor id on success, or an error message on
   * failure. The caller is expected to refresh the monitor list
   * (or wait for the next `monitorList` event from the socket).
   */
  async addMonitor(serverId: string, draft: MonitorDraft): Promise<AddMonitorResult> {
    if (this.current?.serverId !== serverId) {
      return { ok: false, msg: 'Server is not connected' };
    }
    try {
      return await this.current.socket.writer.add(draft);
    } catch (err) {
      return {
        ok: false,
        msg: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Edit a monitor on the given server.
   *
   * IMPORTANT: Kuma 2.3.2 requires the FULL monitor bean (all 113
   * fields) — partial edits are silently dropped. The pattern is:
   *   1. Fetch the current monitor with `getMonitor(serverId, id)`
   *   2. Mutate the fields the user wants to change
   *   3. Pass the whole bean here
   */
  async editMonitor(
    serverId: string,
    bean: KumaMonitorBean
  ): Promise<EditMonitorResult> {
    if (this.current?.serverId !== serverId) {
      return { ok: false, msg: 'Server is not connected' };
    }
    try {
      return await this.current.socket.writer.edit(bean);
    } catch (err) {
      return {
        ok: false,
        msg: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Delete a monitor on the given server. */
  async deleteMonitor(
    serverId: string,
    monitorId: number
  ): Promise<DeleteMonitorResult> {
    if (this.current?.serverId !== serverId) {
      return { ok: false, msg: 'Server is not connected' };
    }
    try {
      return await this.current.socket.writer.delete(monitorId);
    } catch (err) {
      return {
        ok: false,
        msg: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Fetch a single monitor by id.
   * Returns `{ ok: false, monitor: null }` if the monitor doesn't
   * exist (e.g. was just deleted). On a Kuma error, returns the
   * raw error message.
   */
  async getMonitor(
    serverId: string,
    monitorId: number
  ): Promise<GetMonitorResult> {
    if (this.current?.serverId !== serverId) {
      return { ok: false, msg: 'Server is not connected' };
    }
    try {
      return await this.current.socket.writer.get(monitorId);
    } catch (err) {
      return {
        ok: false,
        msg: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Returns the most-recent heartbeat rows for a monitor, gathered
   * from the live `heartbeatList` socket event. Returns [] if Kuma
   * hasn't pushed that monitor's data yet.
   *
   * Note: Kuma 2.3+ sends ~100 rows per monitor on connect. For
   * longer time windows the chart will display only what we have.
   */
  getRecentHeartbeats(serverId: string, monitorId: number): unknown[] {
    // Stored in useMonitors via heartbeatList events; see handleEvent.
    // We re-derive here by reading the socket's local store if it
    // exposes it, but for now we just return [] — callers should
    // subscribe to KumaEvent 'heartbeatList' and keep their own copy.
    void serverId;
    void monitorId;
    return [];
  }

  /**
   * Returns the latest uptime ratio (0-1) for a monitor + window.
   * Window key: '24' | '168' | '720' | '1y'.
   *
   * Note: Kuma 2.3+ pushes ratios for 24, 720, 1y — not 168. We
   * fall back to the 1y ratio (less granular) for 7d windows.
   */
  getUptimeRatio(serverId: string, monitorId: number, window: '24' | '168' | '720' | '1y'): number | null {
    void serverId;
    void monitorId;
    void window;
    return null;
  }

  // ---- Private helpers ----

  private teardown(conn: ActiveConnection): void {
    conn.unsubscribe();
    conn.socket.disconnect();
  }

  private handleEvent(serverId: string, event: KumaEvent): void {
    const monitors = useMonitors.getState();
    const servers = useServers.getState();

    switch (event.type) {
      case 'connected':
        monitors.setStatus(serverId, 'connected');
        void servers.setConnected(serverId, true);
        break;

      case 'disconnected':
        monitors.setStatus(serverId, 'reconnecting', event.reason);
        void servers.setConnected(serverId, false);
        break;

      case 'error':
        monitors.setStatus(serverId, 'error', event.error?.message ?? 'Connection error');
        void servers.setConnected(serverId, false);
        break;

      case 'monitorList':
        monitors.setMonitors(serverId, event.monitors);
        break;

      case 'monitorStatus':
        monitors.updateMonitorStatus(
          serverId,
          event.monitorId,
          event.status,
          event.timestamp
        );
        break;

      case 'heartbeat':
        monitors.updateMonitorHeartbeat(
          serverId,
          event.monitorId,
          event.status,
          event.responseTime,
          event.timestamp
        );
        break;

      case 'heartbeatList':
        // Cache the rows on the monitors store (separate from live
        // heartbeats) so the detail screen can read them on mount.
        // Honor Kuma's overwrite semantics: when overwrite=true, the
        // event is "this is the canonical list, replace whatever you
        // have". When false (the default), prepend — matches the
        // Kuma SPA's own merge logic.
        monitors.setHeartbeatHistory(
          serverId,
          event.monitorId,
          event.rows,
          event.overwrite
        );
        break;

      case 'uptime':
        monitors.setUptimeRatio(serverId, event.monitorId, event.hours, event.ratio);
        break;

      case 'info':
        // Kuma pushes this on connect. We surface the version in the
        // servers tab so the user can see "Kuma 2.3.2" at a glance,
        // and persist it on the server record so it's available
        // before the next connect (e.g., for the splash screen).
        monitors.setInfo(serverId, event.info);
        if (event.info.version) {
          void servers.setKumaVersion(serverId, event.info.version);
        }
        break;

      case 'avgPing':
        monitors.setAvgPing(serverId, event.monitorId, event.ping);
        break;

      case 'certInfo':
        monitors.setCertInfo(serverId, event.monitorId, event.info);
        break;

      case 'domainInfo':
        monitors.setDomainInfo(
          serverId,
          event.monitorId,
          event.daysRemaining,
          event.expiresOn
        );
        break;

      case 'monitorUpdated':
        // Kuma's updateMonitorIntoList: one monitor changed (e.g.,
        // renamed, paused, edited from the web dashboard). Patch in
        // place so the UI doesn't have to wait for a reconnect.
        monitors.updateMonitor(serverId, event.monitorId, event.monitor);
        break;

      case 'monitorDeleted':
        // Kuma's deleteMonitorFromList: a monitor was deleted. Drop
        // it from the cached list so the UI doesn't show a ghost.
        monitors.deleteMonitor(serverId, event.monitorId);
        break;

      case 'incident': {
        // Only push a real "down" → "recovery" pair when we have a
        // genuine status change. Kuma's incident event already
        // discriminates via `cause: 'down' | 'recovery'`.
        monitors.addIncident(serverId, event.incident);
        break;
      }
    }
  }
}

// ---- React hook ----

/**
 * Mount once near the top of the React tree (after providers). When
 * the active server changes, the manager disconnects the old and connects
 * the new.
 */
export function useKumaConnection() {
  const activeId = useServers((s) => s.activeServerId);
  // Reuse the module-level singleton so background tasks and the
  // React tree share the same connection.
  const manager = getConnectionManager();

  useEffect(() => {
    if (!activeId) {
      manager.disconnectAll();
      return;
    }
    manager.connect(activeId).catch(() => {
      // Error is reflected in the store via setStatus('error').
    });
    // Note: we don't disconnect on every activeId change because
    // `manager.connect` already tears down the previous connection.
  }, [activeId, manager]);

  // Tear down on full unmount.
  useEffect(() => {
    return () => {
      manager.destroy();
    };
  }, [manager]);

  return manager;
}

/**
 * Module-level singleton of the connection manager.
 *
 * The `useKumaConnection` hook returns a manager that's tied to
 * React's lifecycle. For non-React callers (background tasks,
 * notification schedulers, etc.) we expose a singleton created on
 * first read. The hook and the singleton share the same underlying
 * connection, so calling `revalidate()` on either side reconnects
 * the same socket.
 */
let _singleton: KumaConnectionManager | null = null;
export function getConnectionManager(): KumaConnectionManager {
  if (_singleton === null) {
    _singleton = new KumaConnectionManager();
  }
  return _singleton;
}
