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

  /** Detect Kuma version + check connectivity */
  async ping(): Promise<{ version: string; connected: boolean }> {
    try {
      const res = await fetch(`${this.server.url}/api/status`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        return { version: 'unknown', connected: false };
      }
      const data = (await res.json()) as { version?: string };
      return {
        version: data.version ?? 'unknown',
        connected: true,
      };
    } catch {
      return { version: 'unknown', connected: false };
    }
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

  /** Fetch a monitor's uptime stats */
  async getUptimeStats(
    monitorId: number
  ): Promise<{ uptime24h: number; uptime7d: number; uptime30d: number }> {
    return this.request<any>(
      'GET',
      `/api/uptime/${monitorId}?type=hour&hours=24,168,720`
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
