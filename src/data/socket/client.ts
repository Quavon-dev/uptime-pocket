/**
 * Kuma socket.io client.
 *
 * ## Kuma 2.3+ behavior
 *
 * As of Kuma 2.3, login happens exclusively over socket.io
 * (`socket.emit('login', {username, password}, cb)`). The REST API
 * (`POST /api/login`) is gone, and `/api/heartbeat/:id` and
 * `/api/uptime/:id` no longer respond with JSON — they return the SPA
 * HTML. Everything we need is on the socket:
 *
 *   - On login: Kuma pushes `info`, `monitorList`, `heartbeatList`
 *     (one per monitor, 100 rows each), `uptime` (one per monitor per
 *     window: 24, 720, 1y), `avgPing`, `certInfo`, etc.
 *   - Live: `heartbeat` (with camelCase `monitorID`), `monitorStatus`,
 *     `incident`.
 *
 * ## Auth flow
 *
 *   1. Open socket (no auth payload yet)
 *   2. Wait for `connect`
 *   3. `emit('login', {username, password}, cb)` — get JWT
 *   4. From here on, all requests include `auth: { token: <jwt> }`
 *
 * For bearer-token auth, we just put the token in the auth payload
 * of the initial `io()` call and skip the login step.
 *
 * ## Why pure normalizers?
 *
 * All payload normalization lives in `./normalize.ts` so it can be
 * unit-tested with real captured payloads and no mocks. This file
 * only handles the socket lifecycle and dispatches normalized
 * events to listeners.
 */

import { io, Socket } from 'socket.io-client';
import type { AuthSession, SocketLoginFn } from '../api/auth';
import type { Server, Monitor, Incident, MonitorStatus } from '@/domain/models';
import type { KumaClient } from '../api/client';
import { KumaMonitorWriter } from '../api/monitors';
import {
  normalizeMonitorList,
  normalizeHeartbeat,
  normalizeMonitorStatus,
  normalizeIncident,
  normalizeHeartbeatListEventV2,
  normalizeHeartbeatListRow,
  normalizeUptimeEvent,
  normalizeChartDatapoint,
  normalizeChartDataResponse,
  normalizeInfo,
  normalizeAvgPingEvent,
  normalizeCertInfo,
  normalizeDomainInfoEvent,
  normalizeUpdateMonitorIntoList,
  normalizeDeleteMonitorFromList,
  type NormalizedHeartbeatRow,
  type NormalizedChartDatapoint,
  type KumaServerInfo,
  type KumaCertInfo,
} from './normalize';

export type KumaEvent =
  | { type: 'connected' }
  | { type: 'disconnected'; reason: string }
  | { type: 'monitorList'; monitors: Monitor[] }
  | {
      type: 'monitorStatus';
      monitorId: number;
      status: MonitorStatus;
      timestamp: number;
    }
  | {
      type: 'heartbeat';
      monitorId: number;
      status: MonitorStatus;
      responseTime: number;
      timestamp: number;
    }
  | { type: 'incident'; incident: Incident }
  | { type: 'error'; error: Error }
  | {
      type: 'heartbeatList';
      monitorId: number;
      rows: NormalizedHeartbeatRow[];
      /** When true, REPLACE the existing cache (not merge). */
      overwrite: boolean;
    }
  | {
      type: 'uptime';
      monitorId: number;
      hours: '24' | '168' | '720' | '1y';
      ratio: number; // 0-1
    }
  | { type: 'info'; info: KumaServerInfo }
  | { type: 'avgPing'; monitorId: number; ping: number | null }
  | { type: 'certInfo'; monitorId: number; info: KumaCertInfo }
  | {
      type: 'domainInfo';
      monitorId: number;
      daysRemaining: number | null;
      expiresOn: string | null;
    }
  | { type: 'monitorUpdated'; monitorId: number; monitor: Monitor }
  | { type: 'monitorDeleted'; monitorId: number };

type Listener = (event: KumaEvent) => void;

/**
 * Builds a SocketLoginFn bound to a specific Socket instance.
 * Used by the manager after opening a socket.
 */
export function buildSocketLogin(socket: Socket): SocketLoginFn {
  return (username, password) =>
    new Promise<string>((resolve, reject) => {
      // Set a generous timeout — Kuma usually answers in <1s, but we
      // want to surface a clear error rather than hang forever.
      const timeout = setTimeout(() => {
        reject(new Error('Kuma socket login timed out after 10s'));
      }, 10_000);
      socket.emit('login', { username, password }, (res: any) => {
        clearTimeout(timeout);
        if (res && res.ok && typeof res.token === 'string') {
          resolve(res.token);
        } else {
          reject(new Error('Kuma login failed: ' + JSON.stringify(res)));
        }
      });
    });
}

export class KumaSocket {
  private socket: Socket | null = null;
  private listeners = new Set<Listener>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  /** True once socket-level login has completed (for password auth). */
  private loggedIn = false;

  /**
   * Returns a writer bound to the current live socket. The socket
   * is null until `connect()` has fired, in which case the writer
   * will throw — the UI should not be calling write methods on a
   * non-connected server anyway.
   */
  get writer(): KumaMonitorWriter {
    if (!this.socket) {
      throw new Error('Cannot write to Kuma: socket is not connected');
    }
    return new KumaMonitorWriter(this.socket);
  }

  constructor(
    public readonly server: Server,
    public readonly session: AuthSession,
    public readonly restClient: KumaClient
  ) {}

  /**
   * Open the socket and authenticate.
   *
   * For bearer auth: includes the token in the initial auth payload,
   * no extra login step needed.
   *
   * For password auth: opens the socket unauthenticated, waits for
   * `connect`, then `emit('login', {...})`. The returned JWT is then
   * spliced into the session for subsequent requests.
   */
  connect(): void {
    if (this.socket?.connected) return;
    if (this.destroyed) return;

    const url = this.server.url;
    const authPayload = this.session.applySocketAuth({});

    // Polling first: RN's WebSocket polyfill is sometimes flaky on the
    // simulator + over corporate proxies. Polling works everywhere and
    // socket.io auto-upgrades to WebSocket after the handshake.
    // See: https://socket.io/how-to/use-with-react-native
    this.socket = io(url, {
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: true,
      auth: authPayload,
      reconnection: false,
      timeout: 10_000,
    });

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      // Don't emit 'connected' yet — we still need to authenticate.
      // Kuma sends 'info' + 'loginRequired' on every connect when auth
      // is enabled, and we have to reply with `loginByToken` (bearer) or
      // `login` (password) before any domain events are valid. The
      // 'connected' event is emitted from `loginByTokenAck` below.
    });

    this.socket.on('disconnect', (reason) => {
      this.emit({ type: 'disconnected', reason });
      this.scheduleReconnect();
    });

    this.socket.on('connect_error', (error) => {
      this.emit({ type: 'error', error });
      this.scheduleReconnect();
    });

    // ---- Kuma auth handshake ----
    //
    // Kuma 2.x always sends 'loginRequired' after the initial 'info' if
    // auth is enabled in the server's settings. The client MUST respond
    // with the right event for the session kind:
    //   - bearer:  socket.emit('loginByToken', token, cb)
    //   - password: socket.emit('login', {username, password}, cb)
    //
    // The token in `socket.handshake.auth.token` is IGNORED by Kuma —
    // it's only used by socket.io's middleware, which Kuma doesn't
    // install. Putting the token there (as we used to) means Kuma
    // never sees it, so it sits there sending pings while we wait for
    // a 'version' field in 'info' that never comes.
    this.socket.on('loginRequired', () => {
      this.handleLoginRequired();
    });

    // ---- Domain events ----
    this.socket.on('info', (data: unknown) => {
      const norm = normalizeInfo(data);
      if (!norm) return;
      this.emit({ type: 'info', info: norm });
    });

    this.socket.on('monitorList', (data: unknown) => {
      this.emit({
        type: 'monitorList',
        monitors: normalizeMonitorList(data),
      });
    });

    this.socket.on('updateMonitorIntoList', (data: unknown) => {
      const norm = normalizeUpdateMonitorIntoList(data);
      if (!norm) return;
      this.emit({ type: 'monitorUpdated', ...norm });
    });

    this.socket.on('deleteMonitorFromList', (monitorId: unknown) => {
      const norm = normalizeDeleteMonitorFromList(monitorId);
      if (!norm) return;
      this.emit({ type: 'monitorDeleted', ...norm });
    });

    this.socket.on('monitorStatus', (data: any) => {
      const norm = normalizeMonitorStatus(data);
      if (!norm) return;
      this.emit({ type: 'monitorStatus', ...norm });
    });

    this.socket.on('heartbeat', (data: any) => {
      const norm = normalizeHeartbeat(data);
      if (!norm) return;
      this.emit({ type: 'heartbeat', ...norm });
    });

    this.socket.on('avgPing', (mid: unknown, ping: unknown) => {
      const norm = normalizeAvgPingEvent(mid, ping);
      if (!norm) return;
      this.emit({ type: 'avgPing', ...norm });
    });

    this.socket.on('certInfo', (mid: unknown, data: unknown) => {
      const info = normalizeCertInfo(data);
      if (!info) return;
      const id =
        typeof mid === 'string' ? Number(mid) : Number(mid);
      if (!Number.isFinite(id)) return;
      this.emit({ type: 'certInfo', monitorId: id, info });
    });

    this.socket.on(
      'domainInfo',
      (mid: unknown, daysRemaining: unknown, expiresOn: unknown) => {
        const norm = normalizeDomainInfoEvent(mid, daysRemaining, expiresOn);
        if (!norm) return;
        this.emit({ type: 'domainInfo', ...norm });
      }
    );

    this.socket.on('incident', (data: any) => {
      const norm = normalizeIncident(data);
      if (!norm) return;
      this.emit({
        type: 'incident',
        incident: {
          ...norm,
          serverId: this.server.id,
        },
      });
    });

    // ---- Kuma 2.3+ bulk data events ----
    this.socket.on(
      'heartbeatList',
      (mid: unknown, rows: unknown, overwrite: unknown) => {
        // Kuma 2.3+ may emit heartbeatList in two forms:
        //   - (mid, rows)                 — original 2-arg form, overwrite=undefined
        //   - (mid, rows, overwrite=true) — explicit-overwrite form
        // We always use the V2 normalizer, which accepts both. The
        // third arg is honored end-to-end: the store replaces vs.
        // merges based on it, matching the Kuma SPA's own logic in
        // `src/mixins/socket.js:236-242`.
        const norm = normalizeHeartbeatListEventV2(mid, rows, overwrite);
        if (!norm) return;
        this.emit({ type: 'heartbeatList', ...norm });
      }
    );

    this.socket.on('uptime', (mid: unknown, hours: unknown, ratio: unknown) => {
      const norm = normalizeUptimeEvent(mid, hours, ratio);
      if (!norm) return;
      this.emit({ type: 'uptime', ...norm });
    });
  }

  /**
   * Handle Kuma's `loginRequired` event by emitting the right auth
   * event for our session kind. Kuma sends this on every connect
   * (after `info`) when auth is enabled — we MUST respond, otherwise
   * no domain events are emitted and the connection effectively
   * hangs.
   *
   * For both bearer and password sessions we use `loginByToken`:
   *   - Bearer: the long-lived API token works directly.
   *   - Password: the session already holds a JWT obtained by the
   *     manager's earlier login handshake (see
   *     KumaConnectionManager.connect), so we just re-use it. This
   *     also means the KumaSocket doesn't need to know about the
   *     raw username/password.
   */
  private handleLoginRequired(): void {
    if (!this.socket) return;
    const token = this.session.currentToken;
    if (!token) {
      this.emit({
        type: 'error',
        error: new Error(
          'Kuma asked for login (loginRequired) but session has no token. ' +
            'For bearer auth, the API token is empty. For password auth, ' +
            'the JWT was never issued — the manager may have skipped the ' +
            'login handshake.',
        ),
      });
      return;
    }

    const ackTimeout = setTimeout(() => {
      this.emit({
        type: 'error',
        error: new Error(
          'loginByToken timed out after 10s — Kuma did not acknowledge our token',
        ),
      });
    }, 10_000);

    this.socket.emit('loginByToken', token, (res: unknown) => {
      clearTimeout(ackTimeout);
      if (res && typeof res === 'object' && (res as { ok?: boolean }).ok) {
        this.loggedIn = true;
        this.emit({ type: 'connected' });
      } else {
        const msg =
          res && typeof res === 'object' && 'msg' in res
            ? String((res as { msg?: unknown }).msg)
            : 'unknown error';
        this.emit({
          type: 'error',
          error: new Error(`Kuma rejected token: ${msg}`),
        });
      }
    });
  }

  disconnect(): void {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Send a pause/resume command */
  pauseMonitor(monitorId: number): void {
    this.socket?.emit('pauseMonitor', monitorId);
  }

  resumeMonitor(monitorId: number): void {
    this.socket?.emit('resumeMonitor', monitorId);
  }

  /**
   * Force an immediate re-check of a monitor.
   * Kuma emits the result as a regular `heartbeat` event shortly after.
   */
  forceHeartbeat(monitorId: number): void {
    this.socket?.emit('forceHeartbeat', monitorId);
  }

  /**
   * Fetch server-aggregated chart data for a monitor over a given
   * time window. This is the public request/response socket event
   * that the Kuma web SPA uses to render its min/avg/max ping chart.
   *
   * Server-side (`server/socket-handlers/chart-socket-handler.js`):
   *   - Auth: `checkLogin(socket)` (any logged-in user).
   *   - Period: hours. Server picks the bucket unit: minute (≤24h),
   *     hour (24-720h), day (>720h).
   *   - Returns one entry per non-empty time bucket with `timestamp`
   *     (Unix seconds), `up`, `down`, `maintenance?`, `avgPing`
   *     (weighted by up-count), `minPing`, `maxPing`.
   *
   * Resolves with the chart points (oldest-first). Rejects on socket
   * error, timeout, or `ok: false` from the server. A rejection
   * should be treated as "no data" in the UI, not a fatal error —
   * the chart's empty state is appropriate.
   */
  getMonitorChartData(
    monitorId: number,
    periodHours: number
  ): Promise<NormalizedChartDatapoint[]> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }
      const timeout = setTimeout(
        () => reject(new Error('getMonitorChartData timed out after 10s')),
        10_000
      );
      this.socket.emit(
        'getMonitorChartData',
        monitorId,
        periodHours,
        (res: unknown) => {
          clearTimeout(timeout);
          const norm = normalizeChartDataResponse(res);
          if (norm.error && norm.points.length === 0) {
            reject(new Error(`getMonitorChartData: ${norm.error}`));
            return;
          }
          resolve(norm.points);
        }
      );
    });
  }

  /**
   * Fetch raw heartbeat rows for a monitor over a given time window
   * (in hours) from the Kuma `heartbeat` SQLite table. Default
   * retention is 180 days, configurable via `DB_HEARTBEAT_TABLE_TIMESPAN_MS`.
   *
   * This is an alternative to the in-memory 100-row `heartbeatList`
   * burst for fetching older history on demand. For the min/avg/max
   * chart specifically, `getMonitorChartData` is cheaper.
   */
  getMonitorBeats(
    monitorId: number,
    periodHours: number
  ): Promise<NormalizedHeartbeatRow[]> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }
      const timeout = setTimeout(
        () => reject(new Error('getMonitorBeats timed out after 10s')),
        10_000
      );
      this.socket.emit(
        'getMonitorBeats',
        monitorId,
        periodHours,
        (res: unknown) => {
          clearTimeout(timeout);
          if (!res || typeof res !== 'object') {
            reject(new Error('getMonitorBeats: empty response'));
            return;
          }
          const r = res as Record<string, unknown>;
          if (r.ok === false) {
            reject(
              new Error(
                `getMonitorBeats: ${typeof r.msg === 'string' ? r.msg : 'unknown error'}`
              )
            );
            return;
          }
          if (!Array.isArray(r.data)) {
            reject(new Error('getMonitorBeats: response missing data array'));
            return;
          }
          const out: NormalizedHeartbeatRow[] = [];
          for (const row of r.data) {
            // getMonitorBeats returns rows in the same shape as the
            // heartbeatList rows (snake_case monitor_id, etc.). Reuse
            // the existing normalizer by re-shaping if needed.
            if (row && typeof row === 'object') {
              const norm = normalizeHeartbeatListRow(row);
              if (norm) out.push(norm);
            }
            // (also handle the REST-style rows just in case)
            if (row && typeof row === 'object' && 'status' in row) {
              const norm = normalizeChartDatapoint(row);
              // skip — different shape
              void norm;
            }
          }
          out.sort((a, b) => a.timestamp - b.timestamp);
          resolve(out);
        }
      );
    });
  }

  private emit(event: KumaEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('KumaSocket listener error', err);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }
    if (this.reconnectTimer) return;

    const attempt = this.reconnectAttempts++;
    const delay = Math.min(30_000, 1000 * 2 ** attempt);
    const jitter = Math.random() * 1000;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay + jitter);
  }
}

export function createSocket(
  server: Server,
  session: AuthSession,
  restClient: KumaClient
): KumaSocket {
  return new KumaSocket(server, session, restClient);
}
