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

// ---- REST API normalizers (used by /api/heartbeat/:id) -----------------

/**
 * Normalized single row from `GET /api/heartbeat/:id`.
 * Kuma returns: `[{ status, time, ping, msg, important }, ...]`
 * - `status` is numeric (0/1/2/3) just like socket heartbeats
 * - `time` is "YYYY-MM-DD HH:MM:SS.mmm" (string)
 * - `ping` is response time in ms
 */
export interface NormalizedHeartbeatRow {
  status: MonitorStatus;
  timestamp: number;
  responseTime: number;
  important: boolean;
}

/**
 * Normalize one row of Kuma's heartbeat history array.
 * Returns null if the row can't be parsed (skips bad rows instead of
 * failing the whole chart).
 */
export function normalizeHeartbeatRow(data: unknown): NormalizedHeartbeatRow | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  const ts = parseKumaTime(row.time);
  if (ts == null) return null;
  return {
    status: normalizeStatus(row.status),
    timestamp: ts,
    responseTime: typeof row.ping === 'number' ? row.ping : 0,
    important: row.important === true,
  };
}

/**
 * Normalize a Kuma heartbeat-history response (array form).
 * Returns a chronologically-sorted list, dropping any unparseable rows.
 * Non-array payloads return [].
 */
export function normalizeHeartbeatHistory(data: unknown): NormalizedHeartbeatRow[] {
  if (!Array.isArray(data)) return [];
  const out: NormalizedHeartbeatRow[] = [];
  for (const row of data) {
    const n = normalizeHeartbeatRow(row);
    if (n) out.push(n);
  }
  // Kuma returns newest-first; chart wants oldest-first.
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}

/**
 * Normalize a Kuma uptime response (the `?type=hour&hours=...` one).
 * Response shape: `{ "24": 0.9986, "168": 0.9912, "720": 0.9854 }` — keys are
 * hours, values are uptime ratios (0-1). We convert to 0-100 percentages.
 * Unknown shapes (no object, no numeric values) return nulls.
 */
export function normalizeUptime(
  data: unknown
): { uptime24h: number | null; uptime7d: number | null; uptime30d: number | null } {
  if (!data || typeof data !== 'object') {
    return { uptime24h: null, uptime7d: null, uptime30d: null };
  }
  const d = data as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && isFinite(v) ? v * 100 : null;
  return {
    uptime24h: num(d['24']),
    uptime7d: num(d['168']),
    uptime30d: num(d['720']),
  };
}

// ---- Kuma 2.3+ socket-event normalizers --------------------------------

/**
 * One row from a `heartbeatList` socket event.
 *
 * Kuma 2.3+ uses `monitor_id` (snake_case) here, NOT the `monitorID`
 * (camelCase) used by the live `heartbeat` event. The two formats
 * coexist in the same client.
 *
 * Live event (socket.io `heartbeat`):
 *   { monitorID: 8, status: 1, time: '...', ping: 59, important: false, retries: 0, msg: '...' }
 *
 * Initial-burst event (socket.io `heartbeatList`):
 *   { id: 181404, important: 0, monitor_id: 8, status: 1, msg: '...',
 *     time: '...', ping: 54, duration: 0, down_count: 0,
 *     end_time: '...', retries: 0, response: null }
 */
export function normalizeHeartbeatListRow(
  data: unknown
): NormalizedHeartbeatRow | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  const ts = parseKumaTime(row.time);
  if (ts == null) return null;
  return {
    status: normalizeStatus(row.status),
    timestamp: ts,
    responseTime: typeof row.ping === 'number' ? row.ping : 0,
    important:
      row.important === true ||
      row.important === 1 ||
      row.important === '1',
  };
}

/**
 * Normalize a `heartbeatList` socket event payload.
 *
 * Event shape: `(monitorId: string, rows: array, important: boolean) => void`
 *   - `monitorId` is a string ("8"), not a number — Kuma quirk.
 *   - `rows` is the array of heartbeats, newest-first.
 *
 * Returns a list of normalized rows + the parsed monitorId (number).
 * Returns null if monitorId is not a valid number.
 */
export function normalizeHeartbeatListEvent(
  monitorId: unknown,
  rows: unknown
): { monitorId: number; rows: NormalizedHeartbeatRow[] } | null {
  const id = typeof monitorId === 'string' ? Number(monitorId) : Number(monitorId);
  if (!Number.isFinite(id)) return null;
  if (!Array.isArray(rows)) return { monitorId: id, rows: [] };
  const out: NormalizedHeartbeatRow[] = [];
  for (const row of rows) {
    const n = normalizeHeartbeatListRow(row);
    if (n) out.push(n);
  }
  // Kuma sends newest-first; charts want oldest-first.
  out.sort((a, b) => a.timestamp - b.timestamp);
  return { monitorId: id, rows: out };
}

/**
 * Normalize a single `uptime` socket event.
 *
 * Event shape: `(monitorId: string, hours: number|string, ratio: number) => void`
 *   - `monitorId` is a string ("8")
 *   - `hours` is a number (24, 168, 720) OR the string "1y"
 *   - `ratio` is a number 0-1
 *
 * Returns null on invalid input.
 */
export function normalizeUptimeEvent(
  monitorId: unknown,
  hours: unknown,
  ratio: unknown
): { monitorId: number; hours: '24' | '168' | '720' | '1y'; ratio: number } | null {
  const id = typeof monitorId === 'string' ? Number(monitorId) : Number(monitorId);
  if (!Number.isFinite(id)) return null;
  if (typeof ratio !== 'number' || !isFinite(ratio)) return null;
  let h: '24' | '168' | '720' | '1y';
  if (hours === 24 || hours === '24') h = '24';
  else if (hours === 168 || hours === '168') h = '168';
  else if (hours === 720 || hours === '720') h = '720';
  else if (hours === '1y') h = '1y';
  else return null;
  return { monitorId: id, hours: h, ratio };
}
