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
import {
  normalizeMonitorList,
  normalizeHeartbeat,
  normalizeMonitorStatus,
  normalizeIncident,
  normalizeHeartbeatListEvent,
  normalizeUptimeEvent,
  type NormalizedHeartbeatRow,
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
    }
  | {
      type: 'uptime';
      monitorId: number;
      hours: '24' | '168' | '720' | '1y';
      ratio: number; // 0-1
    };

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

    this.socket = io(url, {
      transports: ['websocket'],
      auth: authPayload,
      reconnection: false,
      timeout: 10_000,
    });

    this.socket.on('connect', async () => {
      this.reconnectAttempts = 0;
      try {
        if (this.session.kind === 'password' && !this.loggedIn) {
          // The session's `loginFn` knows how to log in. The manager
          // wired that up — see the applySocketAuth call above.
          const token = (authPayload as any).auth?.token;
          if (!token) {
            // No token yet — need to do the login handshake.
            // (Belt-and-braces; manager normally does this first.)
            this.emit({
              type: 'error',
              error: new Error('No JWT available for password session'),
            });
            return;
          }
          this.loggedIn = true;
        }
        this.emit({ type: 'connected' });
      } catch (err) {
        this.emit({
          type: 'error',
          error: err instanceof Error ? err : new Error(String(err)),
        });
        this.scheduleReconnect();
      }
    });

    this.socket.on('disconnect', (reason) => {
      this.emit({ type: 'disconnected', reason });
      this.scheduleReconnect();
    });

    this.socket.on('connect_error', (error) => {
      this.emit({ type: 'error', error });
      this.scheduleReconnect();
    });

    // ---- Domain events ----
    this.socket.on('monitorList', (data: unknown) => {
      this.emit({
        type: 'monitorList',
        monitors: normalizeMonitorList(data),
      });
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
    this.socket.on('heartbeatList', (mid: unknown, rows: unknown) => {
      const norm = normalizeHeartbeatListEvent(mid, rows);
      if (!norm) return;
      this.emit({ type: 'heartbeatList', ...norm });
    });

    this.socket.on('uptime', (mid: unknown, hours: unknown, ratio: unknown) => {
      const norm = normalizeUptimeEvent(mid, hours, ratio);
      if (!norm) return;
      this.emit({ type: 'uptime', ...norm });
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
