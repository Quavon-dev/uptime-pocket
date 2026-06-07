/**
 * Pure normalizers for Kuma socket.io payloads.
 *
 * These functions transform the raw payload shapes that Uptime Kuma
 * sends over its socket.io connection into our internal `Monitor` /
 * `KumaEvent` shapes. They are intentionally pure (no socket.io
 * imports, no I/O, no side effects) so they can be unit-tested with
 * real captured payloads and no mocks.
 *
 * Field name mapping (verified 2026-06-07 against uptime.quavon.de
 * running Kuma 2.3.2):
 *
 *   - monitorID    (camelCase, capital ID) — the monitor's primary key
 *   - status       — 0=down, 1=up, 2=pending, 3=maintenance (numeric)
 *   - ping         — response time in ms
 *   - time         — "YYYY-MM-DD HH:MM:SS.mmm" string OR epoch ms
 *   - important    — true for "important" heartbeats (e.g. status changes)
 *   - msg          — human-readable status message
 *
 * The `monitorList` event payload is an OBJECT keyed by id
 * (e.g. { "1": {...}, "2": {...} }), not an array.
 *
 * Some Kuma versions / forks use the legacy `monitor_id` field. The
 * `getMonitorId()` helper accepts both.
 */

import type { Monitor, MonitorStatus, Incident } from '@/domain/models';

// ---- Status code mapping (Kuma numeric → our string) --------------------

const KUMA_STATUS_BY_NUMBER: Record<number, MonitorStatus> = {
  0: 'down',
  1: 'up',
  2: 'pending',
  3: 'maintenance',
};

const KUMA_STATUS_BY_STRING: Record<string, MonitorStatus> = {
  up: 'up',
  down: 'down',
  pending: 'pending',
  maintenance: 'maintenance',
  paused: 'paused',
};

export function normalizeStatus(status: unknown): MonitorStatus {
  if (typeof status === 'number') {
    return KUMA_STATUS_BY_NUMBER[status] ?? 'pending';
  }
  if (typeof status === 'string') {
    return KUMA_STATUS_BY_STRING[status.toLowerCase()] ?? 'pending';
  }
  return 'pending';
}

// ---- Field extractors ---------------------------------------------------

/** Get the monitor id from a Kuma payload, accepting both `monitorID` and legacy `monitor_id`. */
export function getMonitorId(data: { monitorID?: number; monitor_id?: number }): number | undefined {
  if (typeof data.monitorID === 'number') return data.monitorID;
  if (typeof data.monitor_id === 'number') return data.monitor_id;
  return undefined;
}

/**
 * Parse a Kuma `time` field into a Unix-epoch milliseconds number.
 *
 * Kuma sends times in two formats depending on context:
 *   - ISO-ish string: "2026-06-07 19:21:43.512"
 *   - Epoch milliseconds (some events)
 *
 * Returns null if the value is missing or unparseable.
 */
export function parseKumaTime(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Kuma's "YYYY-MM-DD HH:MM:SS.mmm" format. JS Date.parse handles it
    // loosely; we replace the space with 'T' to make it strictly ISO.
    const iso = value.includes('T') ? value : value.replace(' ', 'T');
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

// ---- Monitor list normalization -----------------------------------------

/**
 * Normalize a single Kuma monitor record to our internal `Monitor` shape.
 */
export function normalizeMonitor(m: any): Monitor {
  return {
    id: m.id,
    parent: m.parent ?? null,
    type: m.type,
    name: m.name,
    url: m.url,
    hostname: m.hostname,
    port: m.port,
    status: normalizeStatus(m.status),
    active: m.active ?? true,
    interval: m.interval ?? 60,
    retryInterval: m.retryInterval ?? 60,
    maxretries: m.maxretries ?? 0,
    upsideDown: m.upsideDown ?? false,
    tags: [],
    notificationIDList: m.notificationIDList ?? {},
  };
}

/**
 * Normalize a Kuma `monitorList` payload to a list of `Monitor`.
 *
 * Kuma v2.3.2 sends the payload as an OBJECT keyed by id
 * (e.g. { "1": {...}, "2": {...} }). For forward compatibility
 * with forks that send arrays, we accept both shapes. Returns an
 * empty array for null/undefined/non-object payloads.
 */
export function normalizeMonitorList(data: unknown): Monitor[] {
  if (Array.isArray(data)) {
    return data.map((m) => normalizeMonitor(m));
  }
  if (data && typeof data === 'object') {
    return Object.values(data as Record<string, unknown>).map((m) =>
      normalizeMonitor(m as any)
    );
  }
  return [];
}

// ---- Event payload normalization ----------------------------------------

export interface NormalizedHeartbeat {
  monitorId: number;
  status: MonitorStatus;
  responseTime: number;
  timestamp: number;
}

export interface NormalizedMonitorStatus {
  monitorId: number;
  status: MonitorStatus;
  timestamp: number;
}

export interface NormalizedIncident {
  id: string;
  monitorId: number;
  startedAt: Date;
  cause: Incident['cause'];
}

/**
 * Normalize a Kuma `heartbeat` payload.
 * Returns null if the payload is missing required fields.
 */
export function normalizeHeartbeat(data: any): NormalizedHeartbeat | null {
  const monitorId = getMonitorId(data);
  if (monitorId == null) return null;
  return {
    monitorId,
    status: normalizeStatus(data.status),
    responseTime: typeof data.ping === 'number' ? data.ping : 0,
    timestamp: parseKumaTime(data.time) ?? Date.now(),
  };
}

/**
 * Normalize a Kuma `monitorStatus` payload.
 * Returns null if the payload is missing required fields.
 */
export function normalizeMonitorStatus(data: any): NormalizedMonitorStatus | null {
  const monitorId = getMonitorId(data);
  if (monitorId == null) return null;
  return {
    monitorId,
    status: normalizeStatus(data.status),
    timestamp: parseKumaTime(data.time) ?? Date.now(),
  };
}

/**
 * Normalize a Kuma `incident` payload.
 * Returns null if the payload is missing required fields.
 */
export function normalizeIncident(data: any): NormalizedIncident | null {
  const monitorId = getMonitorId(data);
  if (monitorId == null) return null;
  const ts = parseKumaTime(data.time);
  if (ts == null) return null;
  return {
    id: `${monitorId}-${data.time}`,
    monitorId,
    startedAt: new Date(ts),
    cause: data.status === 0 ? 'down' : 'recovery',
  };
}
