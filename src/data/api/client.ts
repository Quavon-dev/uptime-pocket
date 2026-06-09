/**
 * REST API client for Uptime Kuma.
 *
 * - Uses expo-fetch (built on RN's fetch) for HTTP
 * - Handles auth via the session
 * - Throws typed errors so the UI can react appropriately
 */

import type { AuthSession } from './auth';
import type { Monitor, Server, Tag } from '@/domain/models';

export class KumaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = 'KumaError';
  }
}

export class KumaClient {
  constructor(
    public readonly server: Server,
    public readonly session: AuthSession
  ) {}

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown
  ): Promise<T> {
    if (this.session.isExpired() && this.session.refresh) {
      await this.session.refresh();
    }

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    this.session.applyHeaders(headers);

    const url = `${this.server.url}${path}`;
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      throw new KumaError(
        `${method} ${path} failed: ${res.status} ${res.statusText}`,
        res.status,
        res.status === 401 ? 'unauthorized' : res.status === 404 ? 'not_found' : 'http_error'
      );
    }

    if (res.status === 204) {
      return undefined as T;
    }

    return (await res.json()) as T;
  }

  /**
   * Detect Kuma version + check connectivity.
   *
   * Tries two paths in order:
   *
   *  1. **REST `/api/status`** — works on Kuma 2.0–2.2. On 2.3+ the
   *     endpoint returns the SPA HTML (200 OK) instead of JSON, so
   *     `res.json()` throws and we fall through to path 2.
   *
   *  2. **Socket `info` event** — works on Kuma 2.3+. Opens a
   *     transient socket, logs in (or uses bearer token), and waits
   *     for the `info` event which carries `{ version }`. This is
   *     the canonical way for 2.3+ since REST login is gone.
   *
   * Returns `{ connected: true, version }` on success, or
   * `{ connected: false, error: <string> }` on failure (so the UI
   * can show the actual reason instead of "Couldn't reach").
   */
  async ping(): Promise<{ version: string; connected: boolean; error?: string }> {
    // --- Path 1: REST ---
    try {
      const res = await fetch(`${this.server.url}/api/status`, {
        headers: { Accept: 'application/json' },
      });
      const contentType = res.headers.get('content-type') ?? '';
      if (res.ok && contentType.includes('json')) {
        const data = (await res.json()) as { version?: string };
        return {
          version: data.version ?? 'unknown',
          connected: true,
        };
      }
      // Non-JSON response (likely Kuma 2.3+ SPA HTML) — fall through to socket.
    } catch (err) {
      // Network error — also try the socket path. It might succeed
      // even when REST doesn't (different port? different code path?).
      void err;
    }

    // --- Path 2: socket ---
    return this.pingOverSocket();
  }

  /**
   * Probe Kuma via a transient socket.io connection.
   *
   * This is the canonical "is this Kuma reachable + what version"
   * check for Kuma 2.3+, which removed the REST `/api/status`
   * endpoint.
   *
   * For bearer auth, the token is sent in the initial socket auth
   * payload (no login round-trip). For password auth, we emit
   * `login` and wait for the JWT — Kuma then sends `info` along
   * with `monitorList` etc.
   */
  async pingOverSocket(): Promise<{ version: string; connected: boolean; error?: string }> {
    // Lazy import: socket.io-client is heavy and not always needed
    // (e.g. in unit tests). The `ping()` REST path is the cheap
    // happy path; the socket path is the 2.3+ fallback.
    let io: typeof import('socket.io-client').io;
    try {
      io = (await import('socket.io-client')).io;
    } catch (err) {
      return {
        version: 'unknown',
        connected: false,
        error: 'socket.io-client not available: ' + (err instanceof Error ? err.message : String(err)),
      };
    }

    const authPayload = this.session.applySocketAuth({});

    return new Promise<{ version: string; connected: boolean; error?: string }>((resolve) => {
      let settled = false;
      const finish = (result: { version: string; connected: boolean; error?: string }) => {
        if (settled) return;
        settled = true;
        try {
          socket.disconnect();
        } catch {
          // ignore
        }
        resolve(result);
      };

      // Polling first for RN reliability, auto-upgrade to WebSocket.
      const socket = io(this.server.url, {
        transports: ['polling', 'websocket'],
        upgrade: true,
        auth: authPayload,
        reconnection: false,
        timeout: 8_000,
      });

      const overallTimeout = setTimeout(() => {
        finish({ version: 'unknown', connected: false, error: 'Timed out waiting for Kuma response' });
      }, 10_000);

      socket.on('connect', () => {
        // For password auth, do the login handshake. For bearer,
        // the token was already in the auth payload, so we just
        // wait for `info`.
        if (this.session.kind === 'password') {
          // Reach into the session to get username/password.
          // The session doesn't expose these publicly (security),
          // so we only support bearer probes here. Password
          // probing should go through the live manager's socket.
          clearTimeout(overallTimeout);
          finish({
            version: 'unknown',
            connected: false,
            error:
              'Password-based test connection is not yet supported in ping(). ' +
              'Save the server first to test with real credentials.',
          });
          return;
        }

        // Bearer: wait for `info` event.
        //
        // Kuma 2.3+ fires `info` **twice**:
        //   1. Immediately on connect: `{ primaryBaseURL, serverTimezone, serverTimezoneOffset }`
        //      — no `version` field.
        //   2. Shortly after: the same payload PLUS `{ version, latestVersion, dbType, runtime }`.
        //
        // We need the second one for the version check, so we use
        // `socket.on` (not `once`) and only resolve when we see a
        // payload that actually has `version`.
        socket.on('info', (info: { version?: string; primaryBaseURL?: string }) => {
          if (typeof info?.version === 'string' && info.version.length > 0) {
            clearTimeout(overallTimeout);
            finish({
              version: info.version,
              connected: true,
            });
          }
          // Otherwise it's the first (version-less) fire — keep listening.
        });

        // If the server sends an auth error event, surface it.
        socket.once('connect_error', (err: Error) => {
          clearTimeout(overallTimeout);
          finish({
            version: 'unknown',
            connected: false,
            error: 'Auth failed: ' + (err?.message ?? 'unknown error'),
          });
        });
      });

      socket.on('connect_error', (err: Error) => {
        clearTimeout(overallTimeout);
        // iOS ATS blocks show up as "Network request failed" or
        // "xhr poll error" depending on the underlying transport.
        // Surface the actual message so the user can debug.
        finish({
          version: 'unknown',
          connected: false,
          error: 'Connection failed: ' + (err?.message ?? 'unknown error'),
        });
      });
    });
  }

  async login(): Promise<boolean> {
    if (this.session.kind === 'bearer') return true; // no login needed
    if (this.session.refresh) {
      try {
        await this.session.refresh();
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /** Fetch all monitors for this server */
  async getMonitors(): Promise<Monitor[]> {
    // Kuma doesn't have a single list-monitors endpoint; we use socket.io
    // for live state. This is mostly a snapshot on first connect.
    // For now, return empty and rely on socket stream.
    return [];
  }

  /** Fetch a monitor's heartbeat history */
  async getHeartbeats(monitorId: number, since: Date): Promise<any[]> {
    return this.request<any[]>(
      'GET',
      `/api/heartbeat/${monitorId}?since=${Math.floor(since.getTime() / 1000)}`
    );
  }

  /**
   * Fetch a monitor's uptime stats for 24h / 7d / 30d windows.
   * Kuma returns `{ "24": 0.998, "168": 0.991, "720": 0.985 }` (ratios 0-1).
   * The `any` return is intentional — `normalizeUptime()` does the
   * validation + 0-100 conversion in the domain layer.
   */
  async getUptimeStats(monitorId: number): Promise<unknown> {
    return this.request<unknown>(
      'GET',
      `/api/uptime/${monitorId}?type=hour&hours=24,168,720`
    );
  }

  /**
   * Force an immediate re-check of a monitor.
   * Kuma 2.x has no dedicated "recheck" REST endpoint, but the socket
   * supports a `forceHeartbeat` event. We expose this for callers that
   * want to re-check via REST (rare — most paths go through the socket
   * via `KumaConnectionManager.recheckMonitor`).
   */
  async recheckMonitor(monitorId: number): Promise<void> {
    // Best-effort: hit a heartbeat endpoint that forces a fresh check.
    // Kuma 2.x accepts `?force=1` on the heartbeat endpoint.
    return this.request<void>(
      'GET',
      `/api/heartbeat/${monitorId}?force=1`
    );
  }

  /** Pause a monitor */
  async pauseMonitor(monitorId: number): Promise<void> {
    return this.request<void>('POST', `/api/pause/${monitorId}`);
  }

  /** Resume a monitor */
  async resumeMonitor(monitorId: number): Promise<void> {
    return this.request<void>('POST', `/api/resume/${monitorId}`);
  }

  /** List tags */
  async getTags(): Promise<Tag[]> {
    return this.request<Tag[]>('GET', '/api/tags');
  }

  /** List status pages */
  async getStatusPages(): Promise<any[]> {
    return this.request<any[]>('GET', '/api/status-pages');
  }
}

export function createClient(server: Server, session: AuthSession): KumaClient {
  return new KumaClient(server, session);
}
