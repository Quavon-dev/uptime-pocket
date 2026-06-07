/**
 * Kuma socket.io client.
 *
 * - Maintains a long-lived connection to the Kuma server
 * - Subscribes to monitor list, status changes, and heartbeats
 * - Auto-reconnects with exponential backoff
 * - Re-authenticates on connection (token can rotate)
 */

import { io, Socket } from 'socket.io-client';
import type { AuthSession } from '../api/auth';
import type { Server, Monitor, Incident, MonitorStatus } from '@/domain/models';
import type { KumaClient } from '../api/client';
import {
  normalizeMonitorList,
  normalizeHeartbeat,
  normalizeMonitorStatus,
  normalizeIncident,
} from './normalize';

export type KumaEvent =
  | { type: 'connected' }
  | { type: 'disconnected'; reason: string }
  | { type: 'monitorList'; monitors: Monitor[] }
  | { type: 'monitorStatus'; monitorId: number; status: MonitorStatus; timestamp: number }
  | { type: 'heartbeat'; monitorId: number; status: MonitorStatus; responseTime: number; timestamp: number }
  | { type: 'incident'; incident: Incident }
  | { type: 'error'; error: Error };

type Listener = (event: KumaEvent) => void;

export class KumaSocket {
  private socket: Socket | null = null;
  private listeners = new Set<Listener>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    public readonly server: Server,
    public readonly session: AuthSession,
    public readonly restClient: KumaClient
  ) {}

  connect(): void {
    if (this.socket?.connected) return;
    if (this.destroyed) return;

    const url = this.server.url;
    const authPayload = this.session.applySocketAuth({});

    this.socket = io(url, {
      transports: ['websocket'],
      auth: authPayload,
      reconnection: false, // we handle reconnection manually for better control
      timeout: 10_000,
    });

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      this.emit({ type: 'connected' });
      // After connecting, Kuma sends the initial monitor list
    });

    this.socket.on('disconnect', (reason) => {
      this.emit({ type: 'disconnected', reason });
      this.scheduleReconnect();
    });

    this.socket.on('connect_error', (error) => {
      this.emit({ type: 'error', error });
      this.scheduleReconnect();
    });

    // Kuma-specific events.
    //
    // All payload normalization lives in ./normalize so it can be
    // tested with real captured payloads and no mocks. This file
    // only handles the socket lifecycle and dispatches normalized
    // events to listeners.
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

  private emit(event: KumaEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        // Never let a listener error kill the socket
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
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
    const delay = Math.min(30_000, 1000 * 2 ** attempt);
    // Add jitter
    const jitter = Math.random() * 1000;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay + jitter);
  }

  // Note: payload normalization is in ./normalize (pure functions, fully
  // unit-tested). This class only handles the socket lifecycle.
}

export function createSocket(
  server: Server,
  session: AuthSession,
  restClient: KumaClient
): KumaSocket {
  return new KumaSocket(server, session, restClient);
}
