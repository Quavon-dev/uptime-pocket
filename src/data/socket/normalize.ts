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

import type { Monitor, MonitorType, MonitorStatus, Incident } from '@/domain/models';

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
export function getMonitorId(data: Record<string, unknown>): number | undefined {
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
export function normalizeMonitor(m: Record<string, unknown>): Monitor {
  return {
    id: m.id as number,
    parent: (m.parent as number | null) ?? null,
    type: m.type as MonitorType,
    name: m.name as string,
    url: m.url as string | undefined,
    hostname: m.hostname as string | undefined,
    port: m.port as number | undefined,
    status: normalizeStatus(m.status),
    active: m.active !== false,
    interval: typeof m.interval === 'number' ? m.interval : 60,
    retryInterval: typeof m.retryInterval === 'number' ? m.retryInterval : 60,
    maxretries: typeof m.maxretries === 'number' ? m.maxretries : 0,
    upsideDown: m.upsideDown === true,
    tags: [],
    notificationIDList: (m.notificationIDList as Record<string, boolean> | undefined) ?? {},
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
    return data
      .filter((m): m is Record<string, unknown> => m !== null && typeof m === 'object')
      .map(normalizeMonitor);
  }
  if (data && typeof data === 'object') {
    return Object.values(data as Record<string, unknown>)
      .filter((m): m is Record<string, unknown> => m !== null && typeof m === 'object')
      .map(normalizeMonitor);
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
export function normalizeHeartbeat(data: unknown): NormalizedHeartbeat | null {
  if (!data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  const monitorId = getMonitorId(r);
  if (monitorId == null) return null;
  return {
    monitorId,
    status: normalizeStatus(r.status),
    responseTime: typeof r.ping === 'number' ? r.ping : 0,
    timestamp: parseKumaTime(r.time) ?? Date.now(),
  };
}

/**
 * Normalize a Kuma `monitorStatus` payload.
 * Returns null if the payload is missing required fields.
 */
export function normalizeMonitorStatus(data: unknown): NormalizedMonitorStatus | null {
  if (!data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  const monitorId = getMonitorId(r);
  if (monitorId == null) return null;
  return {
    monitorId,
    status: normalizeStatus(r.status),
    timestamp: parseKumaTime(r.time) ?? Date.now(),
  };
}

/**
 * Normalize a Kuma `incident` payload.
 * Returns null if the payload is missing required fields.
 */
export function normalizeIncident(data: unknown): NormalizedIncident | null {
  if (!data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  const monitorId = getMonitorId(r);
  if (monitorId == null) return null;
  const ts = parseKumaTime(r.time);
  if (ts == null) return null;
  return {
    id: `${monitorId}-${r.time}`,
    monitorId,
    startedAt: new Date(ts),
    cause: r.status === 0 ? 'down' : 'recovery',
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
  const id = Number(monitorId);
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

// ---- Kuma 2.3+ auxiliary events (originally used by the web SPA) -------

/**
 * Normalize a `info` socket event. Kuma sends this on connect.
 *
 * Source: `server/client.js:145-163` in Kuma 2.3.2. The payload is:
 *   {
 *     primaryBaseURL: string,
 *     serverTimezone: string,            // e.g. "Europe/Berlin"
 *     serverTimezoneOffset: number,      // minutes east of UTC
 *     version?: string,                  // e.g. "2.3.2"
 *     latestVersion?: string,            // empty if up to date
 *     isContainer?: boolean,
 *     dbType?: string,                   // "sqlite" | "mariadb" | ...
 *     runtime?: { platform: string, arch: string },
 *   }
 *
 * The `version` and `latestVersion` fields are what we use to surface
 * "your Kuma is out of date" in the servers tab. Returns null for
 * non-object input.
 */
export interface KumaServerInfo {
  version: string | null;
  latestVersion: string | null;
  serverTimezone: string | null;
  serverTimezoneOffsetMinutes: number | null;
  primaryBaseURL: string | null;
}

export function normalizeInfo(data: unknown): KumaServerInfo | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  return {
    version: typeof d.version === 'string' ? d.version : null,
    latestVersion:
      typeof d.latestVersion === 'string' && d.latestVersion.length > 0
        ? d.latestVersion
        : null,
    serverTimezone:
      typeof d.serverTimezone === 'string' ? d.serverTimezone : null,
    serverTimezoneOffsetMinutes:
      typeof d.serverTimezoneOffset === 'number' &&
      isFinite(d.serverTimezoneOffset)
        ? d.serverTimezoneOffset
        : null,
    primaryBaseURL:
      typeof d.primaryBaseURL === 'string' ? d.primaryBaseURL : null,
  };
}

/**
 * Normalize an `avgPing` socket event.
 *
 * Source: `server/model/monitor.js:1356` in Kuma 2.3.2:
 *   io.to(userID).emit("avgPing", monitorID, data24h.avgPing ? Number(...toFixed(2)) : null);
 *
 * The value is the 24h average ping in milliseconds, rounded to 2
 * decimal places. Kuma sends `null` (not `undefined`, not `0`) for
 * monitors that have no up-beats in the 24h window. Returns the
 * monitorId + nullable ping.
 */
export function normalizeAvgPingEvent(
  monitorId: unknown,
  ping: unknown
): { monitorId: number; ping: number | null } | null {
  const id = Number(monitorId);
  if (!Number.isFinite(id)) return null;
  if (ping == null) return { monitorId: id, ping: null };
  if (typeof ping !== 'number' || !isFinite(ping)) return null;
  return { monitorId: id, ping };
}

/**
 * Normalize a `certInfo` socket event.
 *
 * Source: `server/model/monitor.js` (`sendCertInfo`) + `server/monitor.js`
 * cert-info model in Kuma 2.3.2. The payload arrives as a JSON string
 * (Kuma quirk — the server wraps the structured object in `JSON.stringify`
 * before emitting). On parse failure we return null.
 *
 * Shape (post-parse):
 *   {
 *     valid: boolean,
 *     certInfo?: {
 *       subject: string,
 *       issuer: string,
 *       validFrom: string,    // ISO date
 *       validTo: string,      // ISO date
 *       daysRemaining: number,
 *       validTLSAccepted: boolean,
 *     }
 *   }
 */
export interface KumaCertInfo {
  valid: boolean;
  daysRemaining: number | null;
  validTo: string | null; // ISO date
  subject: string | null;
  issuer: string | null;
}

export function normalizeCertInfo(data: unknown): KumaCertInfo | null {
  if (data == null) return null;
  // Kuma wraps the object in JSON.stringify before emitting. Accept
  // either a parsed object or a JSON string.
  let parsed: unknown = data;
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const d = parsed as Record<string, unknown>;
  const inner = d.certInfo as Record<string, unknown> | undefined;
  return {
    valid: d.valid === true,
    daysRemaining:
      inner && typeof inner.daysRemaining === 'number' && isFinite(inner.daysRemaining)
        ? inner.daysRemaining
        : null,
    validTo:
      inner && typeof inner.validTo === 'string' ? inner.validTo : null,
    subject:
      inner && typeof inner.subject === 'string' ? inner.subject : null,
    issuer:
      inner && typeof inner.issuer === 'string' ? inner.issuer : null,
  };
}

/**
 * Normalize a `domainInfo` socket event.
 *
 * Source: `server/model/monitor.js` (`sendDomainInfo`) in Kuma 2.3.2.
 * Emitted as `(monitorID, daysRemaining, expiresOn)` — three separate
 * positional args, NOT an object.
 */
export function normalizeDomainInfoEvent(
  monitorId: unknown,
  daysRemaining: unknown,
  expiresOn: unknown
): {
  monitorId: number;
  daysRemaining: number | null;
  expiresOn: string | null; // ISO date
} | null {
  const id = Number(monitorId);
  if (!Number.isFinite(id)) return null;
  return {
    monitorId: id,
    daysRemaining:
      typeof daysRemaining === 'number' && isFinite(daysRemaining)
        ? daysRemaining
        : null,
    expiresOn: typeof expiresOn === 'string' ? expiresOn : null,
  };
}

/**
 * Normalize an `updateMonitorIntoList` socket event.
 *
 * Source: `server/uptime-kuma-server.js:234` in Kuma 2.3.2:
 *   this.io.to(socket.userID).emit("updateMonitorIntoList", list);
 *
 * `list` is a `{ [monitorId: string]: Monitor }` object containing
 * exactly one monitor (the one that just changed). Returns null for
 * any other shape. The caller is responsible for the merge into the
 * existing monitor list.
 */
export function normalizeUpdateMonitorIntoList(
  data: unknown
): { monitorId: number; monitor: import('@/domain/models').Monitor } | null {
  if (!data || typeof data !== 'object') return null;
  const list = data as Record<string, unknown>;
  // The map has exactly one key — the changed monitor. Find it.
  const keys = Object.keys(list);
  if (keys.length === 0) return null;
  const monitorIdStr = keys[0];
  const monitorId = Number(monitorIdStr);
  if (!Number.isFinite(monitorId)) return null;
  const monitors = normalizeMonitorList(list);
  const monitor = monitors.find((m) => m.id === monitorId);
  if (!monitor) return null;
  return { monitorId, monitor };
}

/**
 * Normalize a `deleteMonitorFromList` socket event.
 *
 * Source: `server/uptime-kuma-server.js:245` in Kuma 2.3.2:
 *   this.io.to(socket.userID).emit("deleteMonitorFromList", monitorID);
 *
 * `monitorID` may arrive as a string ("8") or a number.
 */
export function normalizeDeleteMonitorFromList(
  monitorId: unknown
): { monitorId: number } | null {
  const id = Number(monitorId);
  if (!Number.isFinite(id)) return null;
  return { monitorId: id };
}

/**
 * Normalize a `heartbeatList` event that carries the optional `overwrite` flag.
 *
 * Kuma's `heartbeatList(monitorID, rows, overwrite=false)` event may pass
 * `overwrite=true` to signal "the rows are the canonical list, replace
 * whatever you have". The default `overwrite=false` means "merge these
 * onto whatever you have" (the user may have accumulated heartbeats
 * from a previous burst or live events that aren't in this list).
 *
 * Source: Kuma SPA, `src/mixins/socket.js:236-242`:
 *   socket.on("heartbeatList", (monitorID, data, overwrite = false) => {
 *     if (!(monitorID in this.heartbeatList) || overwrite) {
 *       this.heartbeatList[monitorID] = data;
 *     } else {
 *       this.heartbeatList[monitorID] = data.concat(this.heartbeatList[monitorID]);
 *     }
 *   });
 */
export function normalizeHeartbeatListEventV2(
  monitorId: unknown,
  rows: unknown,
  overwrite: unknown
): {
  monitorId: number;
  rows: NormalizedHeartbeatRow[];
  overwrite: boolean;
} | null {
  const id = Number(monitorId);
  if (!Number.isFinite(id)) return null;
  if (!Array.isArray(rows)) return { monitorId: id, rows: [], overwrite: !!overwrite };
  const out: NormalizedHeartbeatRow[] = [];
  for (const row of rows) {
    const n = normalizeHeartbeatListRow(row);
    if (n) out.push(n);
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return { monitorId: id, rows: out, overwrite: overwrite === true };
}

// ---- Kuma 2.3+ chart data (request/response) --------------------------

/**
 * One aggregated datapoint from the `getMonitorChartData` server event.
 *
 * The Kuma server (`server/socket-handlers/chart-socket-handler.js`)
 * calls `UptimeCalculator.getDataArray(period, unit)` and returns one
 * entry per non-empty time bucket (empty buckets are skipped). The
 * unit is chosen by the server: `minute` for period<=24h, `hour` for
 * 24h<period<=720h, `day` for period>720h.
 *
 *   - `timestamp` is Unix **seconds** (not ms!) of the bucket's midpoint
 *   - `up` / `down` are counts of heartbeats in this bucket
 *   - `maintenance` is optional (omitted by the server when zero)
 *   - `avgPing` is **weighted by up-count**: Σ(ping × up) / Σ(up).
 *     When the bucket is fully down, the server reports `avgPing=0`
 *     (Kuma suppresses the line during outages — we should too).
 *   - `minPing` is the minimum response time; `Infinity` if all-down
 *   - `maxPing` is the maximum response time
 */
export interface NormalizedChartDatapoint {
  /** Unix seconds (NOT ms) of the bucket's midpoint. */
  timestamp: number;
  up: number;
  down: number;
  maintenance: number;
  /**
   * Weighted avg: Σ(ping × up) / Σ(up). 0 when the bucket is fully down
   * — the server suppresses the value to avoid a fake "0ms" during outages.
   */
  avgPing: number;
  minPing: number;
  maxPing: number;
}

/**
 * Normalize a single datapoint from the `data` array returned by
 * `getMonitorChartData`. Skips entries that aren't shaped like the
 * expected object (extra safety for future Kuma versions).
 */
export function normalizeChartDatapoint(
  data: unknown
): NormalizedChartDatapoint | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.timestamp !== 'number' || !isFinite(d.timestamp)) return null;
  return {
    timestamp: d.timestamp,
    up: typeof d.up === 'number' ? d.up : 0,
    down: typeof d.down === 'number' ? d.down : 0,
    maintenance: typeof d.maintenance === 'number' ? d.maintenance : 0,
    avgPing: typeof d.avgPing === 'number' ? d.avgPing : 0,
    minPing: typeof d.minPing === 'number' ? d.minPing : Infinity,
    maxPing: typeof d.maxPing === 'number' ? d.maxPing : 0,
  };
}

/**
 * Normalize the full response payload of `getMonitorChartData`:
 *   { ok: true, data: [...] }
 * or:
 *   { ok: false, msg: '...' }
 *
 * Returns the chart points (oldest-first) on success, or an empty
 * array with an `error` field on failure. The empty-array shape lets
 * the chart render its "no data" empty state uniformly.
 */
export function normalizeChartDataResponse(data: unknown): {
  points: NormalizedChartDatapoint[];
  error?: string;
} {
  if (!data || typeof data !== 'object') {
    return { points: [], error: 'Empty response' };
  }
  const r = data as Record<string, unknown>;
  if (r.ok === false) {
    return {
      points: [],
      error: typeof r.msg === 'string' ? r.msg : 'Unknown error',
    };
  }
  if (!Array.isArray(r.data)) {
    return { points: [], error: 'Response missing data array' };
  }
  const out: NormalizedChartDatapoint[] = [];
  for (const row of r.data) {
    const n = normalizeChartDatapoint(row);
    if (n) out.push(n);
  }
  // Server returns oldest-first already, but be defensive.
  out.sort((a, b) => a.timestamp - b.timestamp);
  return { points: out };
}
