/**
 * KumaConnectionManager — owns the live socket + REST clients per server.
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
 * Events from the socket are translated into mutations on the
 * `useMonitors` Zustand store. The connection status is mirrored into
 * the `useServers` store as well so the UI can show a "connected" badge.
 *
 * The manager is intentionally a plain class (not a Zustand store) — it's
 * instantiated once at the top of the React tree and its lifecycle is
 * managed by a `useEffect` in the root layout.
 */

import { useEffect, useRef } from 'react';
import { KumaSocket, type KumaEvent } from '@/data/socket/client';
import { KumaClient, createClient } from '@/data/api/client';
import { createSession, type AuthSession } from '@/data/api/auth';
import { loadCredentials } from '@/data/secure/credentials';
import { useMonitors } from '@/data/store/monitors';
import { useServers } from '@/data/store/servers';

interface ActiveConnection {
  socket: KumaSocket;
  rest: KumaClient;
  serverId: string;
  unsubscribe: () => void;
}

export class KumaConnectionManager {
  private current: ActiveConnection | null = null;
  private destroyed = false;

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
      const session: AuthSession = createSession(auth, server.url);
      const rest = createClient(server, session);
      const socket = new KumaSocket(server, session, rest);

      // Bridge socket events into the Zustand stores.
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

  /** REST: trigger a re-check on a monitor. */
  async recheckMonitor(serverId: string, monitorId: number): Promise<void> {
    if (this.current?.serverId !== serverId) return;
    await this.current.rest.getMonitors(); // placeholder; real endpoint varies
  }

  /** REST: heartbeat history for a monitor, used for charts. */
  async fetchHeartbeats(
    serverId: string,
    monitorId: number,
    since: Date
  ): Promise<unknown[]> {
    if (this.current?.serverId !== serverId) return [];
    try {
      return await this.current.rest.getHeartbeats(monitorId, since);
    } catch {
      return [];
    }
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

      case 'monitorList': {
        monitors.setMonitors(serverId, event.monitors);
        // The socket's `monitorList` payload from Kuma doesn't include
        // the version directly, but in v2.x the initial connection
        // payload does. For now we set the version on first monitorList
        // arrival if it's not already set on the server record.
        const server = servers.servers.find((s) => s.id === serverId);
        if (server && !server.kumaVersion) {
          // Kuma emits version alongside monitorList in newer versions;
          // we don't get it via the typed event yet, so we leave the
          // value as-is. The user can re-save the server to refresh.
        }
        break;
      }

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

      case 'incident':
        monitors.addIncident(serverId, event.incident);
        break;
    }
  }
}

// ---- React glue ----

/**
 * Hook: keeps the manager in sync with the active server.
 *
 * Mount once near the top of the React tree (after providers). When the
 * active server changes, the manager disconnects the old and connects
 * the new.
 */
export function useKumaConnection() {
  const activeId = useServers((s) => s.activeServerId);
  const managerRef = useRef<KumaConnectionManager | null>(null);

  if (managerRef.current === null) {
    managerRef.current = new KumaConnectionManager();
  }
  const manager = managerRef.current;

  useEffect(() => {
    if (!activeId) {
      manager.disconnectAll();
      return;
    }
    let cancelled = false;
    manager.connect(activeId).catch(() => {
      // Error is reflected in the store via setStatus('error').
    });
    return () => {
      cancelled = true;
      // We do NOT disconnect here on every activeId change because
      // `manager.connect` already tears down the previous. We only
      // disconnect on full unmount.
      if (cancelled) {
        // no-op
      }
    };
  }, [activeId, manager]);

  // Tear down on full unmount.
  useEffect(() => {
    return () => {
      manager.destroy();
    };
  }, [manager]);

  return manager;
}
