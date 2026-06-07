/**
 * Tests for the pure Kuma payload normalizers.
 *
 * These tests use REAL payload shapes captured from uptime.quavon.de
 * running Kuma 2.3.2 on 2026-06-07. They verify the field-name
 * mapping documented in ./normalize.
 *
 * No mocks, no socket.io — the normalizer module is pure functions
 * over data. Tests are fast and self-contained.
 *
 * To re-capture live payloads:
 *   cat /root/.hermes-private/kuma-pw | node /tmp/kuma-event-capture.js
 */

import {
  normalizeStatus,
  getMonitorId,
  parseKumaTime,
  normalizeMonitor,
  normalizeMonitorList,
  normalizeHeartbeat,
  normalizeMonitorStatus,
  normalizeIncident,
  normalizeHeartbeatRow,
  normalizeHeartbeatHistory,
  normalizeUptime,
} from '@/data/socket/normalize';

// --- Captured live payloads (uptime.quavon.de, Kuma 2.3.2, 2026-06-07) ---

const HEARTBEAT_LIVE = {
  monitorID: 8,
  status: 1,
  time: '2026-06-07 19:21:43.512',
  msg: '200 - OK',
  ping: 59,
  important: false,
  retries: 0,
};

const MONITOR_LIST_OBJECT = {
  '1': {
    id: 1,
    name: 'Quavon Sevices',
    path: ['Quavon Sevices'],
    parent: null,
    childrenIDs: [2, 3, 4, 8],
    url: 'https://',
    active: true,
    type: 'group',
    interval: 60,
    retryInterval: 60,
    maxretries: 0,
    upsideDown: false,
    notificationIDList: { '1': true },
    tags: [],
    maintenance: false,
    status: 1,
  },
  '2': {
    id: 2,
    name: 'Quavon Landing Page',
    parent: null,
    url: 'https://quavon.de',
    type: 'http',
    active: true,
    interval: 60,
    retryInterval: 60,
    maxretries: 0,
    upsideDown: false,
    notificationIDList: {},
    tags: [],
    maintenance: false,
    method: 'GET',
    accepted_statuscodes: ['200-299'],
    status: 1,
  },
  '8': {
    id: 8,
    name: 'Quavon Tracker',
    parent: null,
    url: 'https://tracker.quavon.de',
    type: 'http',
    active: true,
    interval: 60,
    status: 1,
  },
};

// --- Status normalization ---

describe('normalizeStatus', () => {
  it('maps Kuma numeric status codes', () => {
    expect(normalizeStatus(0)).toBe('down');
    expect(normalizeStatus(1)).toBe('up');
    expect(normalizeStatus(2)).toBe('pending');
    expect(normalizeStatus(3)).toBe('maintenance');
  });

  it('falls back to "pending" for unknown numbers', () => {
    expect(normalizeStatus(99)).toBe('pending');
    expect(normalizeStatus(-1)).toBe('pending');
  });

  it('accepts status strings (case-insensitive)', () => {
    expect(normalizeStatus('up')).toBe('up');
    expect(normalizeStatus('DOWN')).toBe('down');
    expect(normalizeStatus('Pending')).toBe('pending');
    expect(normalizeStatus('maintenance')).toBe('maintenance');
    expect(normalizeStatus('paused')).toBe('paused');
  });

  it('returns "pending" for null / undefined / unknown', () => {
    expect(normalizeStatus(null)).toBe('pending');
    expect(normalizeStatus(undefined)).toBe('pending');
    expect(normalizeStatus('weird')).toBe('pending');
  });
});

// --- getMonitorId ---

describe('getMonitorId', () => {
  it('reads monitorID (the live Kuma field name)', () => {
    expect(getMonitorId({ monitorID: 8 })).toBe(8);
  });

  it('falls back to monitor_id for older / fork versions', () => {
    expect(getMonitorId({ monitor_id: 99 })).toBe(99);
  });

  it('prefers monitorID when both are present', () => {
    expect(getMonitorId({ monitorID: 1, monitor_id: 99 })).toBe(1);
  });

  it('returns undefined when neither field is present', () => {
    expect(getMonitorId({})).toBeUndefined();
    expect(getMonitorId({ monitorID: '8' as any })).toBeUndefined(); // wrong type
  });
});

// --- parseKumaTime ---

describe('parseKumaTime', () => {
  it('parses Kuma "YYYY-MM-DD HH:MM:SS.mmm" string', () => {
    const ms = parseKumaTime('2026-06-07 19:21:43.512');
    expect(ms).toBe(Date.parse('2026-06-07T19:21:43.512'));
  });

  it('passes through numeric epoch milliseconds', () => {
    expect(parseKumaTime(1749312000000)).toBe(1749312000000);
  });

  it('accepts ISO strings with the T separator', () => {
    expect(parseKumaTime('2026-06-07T19:21:43.512Z')).toBe(
      Date.parse('2026-06-07T19:21:43.512Z')
    );
  });

  it('returns null for null / undefined / empty', () => {
    expect(parseKumaTime(null)).toBeNull();
    expect(parseKumaTime(undefined)).toBeNull();
    expect(parseKumaTime('')).toBeNull();
  });

  it('returns null for unparseable strings', () => {
    expect(parseKumaTime('not a date')).toBeNull();
  });

  it('returns null for other types', () => {
    expect(parseKumaTime({} as any)).toBeNull();
    expect(parseKumaTime([] as any)).toBeNull();
    expect(parseKumaTime(true as any)).toBeNull();
  });
});

// --- normalizeMonitor ---

describe('normalizeMonitor', () => {
  it('normalizes a live Kuma http monitor', () => {
    const m = normalizeMonitor(MONITOR_LIST_OBJECT['2']);
    expect(m).toEqual({
      id: 2,
      parent: null,
      type: 'http',
      name: 'Quavon Landing Page',
      url: 'https://quavon.de',
      hostname: undefined,
      port: undefined,
      status: 'up',
      active: true,
      interval: 60,
      retryInterval: 60,
      maxretries: 0,
      upsideDown: false,
      tags: [],
      notificationIDList: {},
    });
  });

  it('normalizes a live Kuma group monitor', () => {
    const m = normalizeMonitor(MONITOR_LIST_OBJECT['1']);
    expect(m.id).toBe(1);
    expect(m.type).toBe('group');
    expect(m.name).toBe('Quavon Sevices');
    expect(m.status).toBe('up');
  });

  it('applies sensible defaults for missing fields', () => {
    const m = normalizeMonitor({ id: 99, name: 'minimal', type: 'http' });
    expect(m.parent).toBeNull();
    expect(m.active).toBe(true);
    expect(m.interval).toBe(60);
    expect(m.retryInterval).toBe(60);
    expect(m.maxretries).toBe(0);
    expect(m.upsideDown).toBe(false);
    expect(m.tags).toEqual([]);
    expect(m.notificationIDList).toEqual({});
  });
});

// --- normalizeMonitorList ---

describe('normalizeMonitorList', () => {
  it('normalizes the live object-keyed payload', () => {
    const result = normalizeMonitorList(MONITOR_LIST_OBJECT);
    expect(result).toHaveLength(3);
    const ids = result.map((m) => m.id).sort();
    expect(ids).toEqual([1, 2, 8]);
  });

  it('accepts an array payload (forward compatibility)', () => {
    const arr = [
      { id: 1, name: 'A', type: 'http', status: 1 },
      { id: 2, name: 'B', type: 'http', status: 0 },
    ];
    const result = normalizeMonitorList(arr);
    expect(result).toHaveLength(2);
    expect(result[1].status).toBe('down');
  });

  it('returns [] for null / undefined / non-object payloads', () => {
    expect(normalizeMonitorList(null)).toEqual([]);
    expect(normalizeMonitorList(undefined)).toEqual([]);
    expect(normalizeMonitorList('a string')).toEqual([]);
    expect(normalizeMonitorList(42)).toEqual([]);
  });

  it('returns [] for an empty object', () => {
    expect(normalizeMonitorList({})).toEqual([]);
  });
});

// --- normalizeHeartbeat ---

describe('normalizeHeartbeat', () => {
  it('normalizes the live heartbeat payload', () => {
    const norm = normalizeHeartbeat(HEARTBEAT_LIVE);
    expect(norm).not.toBeNull();
    expect(norm!.monitorId).toBe(8); // the critical field-name fix
    expect(norm!.status).toBe('up');
    expect(norm!.responseTime).toBe(59);
    expect(typeof norm!.timestamp).toBe('number');
    expect(norm!.timestamp).toBeGreaterThan(1749310000000);
  });

  it('handles epoch-ms time format', () => {
    const norm = normalizeHeartbeat({
      monitorID: 2,
      status: 1,
      time: 1749312000000,
      ping: 42,
    });
    expect(norm!.monitorId).toBe(2);
    expect(norm!.responseTime).toBe(42);
    expect(norm!.timestamp).toBe(1749312000000);
  });

  it('falls back to monitor_id for legacy payloads', () => {
    const norm = normalizeHeartbeat({
      monitor_id: 99,
      status: 1,
      time: 1749312000000,
      ping: 100,
    });
    expect(norm!.monitorId).toBe(99);
  });

  it('treats missing ping as 0', () => {
    const norm = normalizeHeartbeat({
      monitorID: 1,
      status: 1,
      time: '2026-06-07 19:21:43.512',
    });
    expect(norm!.responseTime).toBe(0);
  });

  it('returns null if the monitor id is missing', () => {
    expect(normalizeHeartbeat({ status: 1, time: 1, ping: 1 })).toBeNull();
  });

  it('uses Date.now() if time is missing', () => {
    const before = Date.now();
    const norm = normalizeHeartbeat({ monitorID: 1, status: 1, ping: 0 });
    const after = Date.now();
    expect(norm!.timestamp).toBeGreaterThanOrEqual(before);
    expect(norm!.timestamp).toBeLessThanOrEqual(after);
  });
});

// --- normalizeMonitorStatus ---

describe('normalizeMonitorStatus', () => {
  it('normalizes a status event', () => {
    const norm = normalizeMonitorStatus({
      monitorID: 5,
      status: 0,
      time: '2026-06-07 19:21:43.512',
    });
    expect(norm!.monitorId).toBe(5);
    expect(norm!.status).toBe('down');
    expect(norm!.timestamp).toBe(Date.parse('2026-06-07T19:21:43.512'));
  });

  it('returns null if monitor id is missing', () => {
    expect(normalizeMonitorStatus({ status: 1, time: 1 })).toBeNull();
  });
});

// --- normalizeIncident ---

describe('normalizeIncident', () => {
  it('normalizes a down incident (status === 0)', () => {
    const norm = normalizeIncident({
      monitorID: 8,
      status: 0,
      time: '2026-06-07 19:21:43.512',
    });
    expect(norm!.monitorId).toBe(8);
    expect(norm!.cause).toBe('down');
    expect(norm!.startedAt).toBeInstanceOf(Date);
    expect(norm!.id).toBe('8-2026-06-07 19:21:43.512');
  });

  it('normalizes a recovery incident (status !== 0)', () => {
    const norm = normalizeIncident({
      monitorID: 8,
      status: 1,
      time: '2026-06-07 19:25:00.000',
    });
    expect(norm!.cause).toBe('recovery');
  });

  it('returns null if monitor id or time is missing', () => {
    expect(normalizeIncident({ status: 0, time: '2026-06-07 19:21:43.512' })).toBeNull();
    expect(normalizeIncident({ monitorID: 1, status: 0 })).toBeNull();
  });
});

// ---- REST /api/heartbeat/:id normalizers ------------------------------

describe('normalizeHeartbeatRow', () => {
  it('normalizes a single live heartbeat row', () => {
    const row = normalizeHeartbeatRow({
      status: 1,
      time: '2026-06-07 19:21:43.512',
      ping: 59,
      msg: '200 - OK',
      important: false,
    });
    expect(row).not.toBeNull();
    expect(row!.status).toBe('up');
    expect(row!.responseTime).toBe(59);
    expect(row!.timestamp).toBe(Date.parse('2026-06-07T19:21:43.512'));
    expect(row!.important).toBe(false);
  });

  it('treats a missing ping as 0', () => {
    const row = normalizeHeartbeatRow({
      status: 1,
      time: 1749312000000,
    });
    expect(row!.responseTime).toBe(0);
  });

  it('reads important: true correctly', () => {
    const row = normalizeHeartbeatRow({
      status: 0,
      time: 1749312000000,
      important: true,
    });
    expect(row!.important).toBe(true);
    expect(row!.status).toBe('down');
  });

  it('returns null for unparseable time', () => {
    expect(normalizeHeartbeatRow({ status: 1, time: 'not-a-date' })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(normalizeHeartbeatRow(null)).toBeNull();
    expect(normalizeHeartbeatRow('x')).toBeNull();
    expect(normalizeHeartbeatRow(42)).toBeNull();
  });
});

describe('normalizeHeartbeatHistory', () => {
  it('normalizes a live Kuma response (array, newest-first)', () => {
    const live = [
      { status: 1, time: '2026-06-07 19:21:43.512', ping: 59 },
      { status: 0, time: '2026-06-07 19:20:43.512', ping: 0 },
      { status: 1, time: '2026-06-07 19:19:43.512', ping: 42 },
    ];
    const out = normalizeHeartbeatHistory(live);
    expect(out).toHaveLength(3);
    // Sorted oldest-first so the chart line is left-to-right.
    expect(out[0].responseTime).toBe(42);
    expect(out[1].status).toBe('down');
    expect(out[2].responseTime).toBe(59);
  });

  it('drops unparseable rows but keeps the rest', () => {
    const out = normalizeHeartbeatHistory([
      { status: 1, time: '2026-06-07 19:21:43.512', ping: 59 },
      { status: 1, time: 'oops' },
      { status: 1, time: '2026-06-07 19:19:43.512', ping: 42 },
    ]);
    expect(out).toHaveLength(2);
  });

  it('returns [] for non-array payloads', () => {
    expect(normalizeHeartbeatHistory(null)).toEqual([]);
    expect(normalizeHeartbeatHistory({})).toEqual([]);
    expect(normalizeHeartbeatHistory('garbage')).toEqual([]);
  });
});

describe('normalizeUptime', () => {
  it('converts ratio values to 0-100 percentages', () => {
    const out = normalizeUptime({ '24': 0.9986, '168': 0.9912, '720': 0.9854 });
    expect(out.uptime24h).toBeCloseTo(99.86, 2);
    expect(out.uptime7d).toBeCloseTo(99.12, 2);
    expect(out.uptime30d).toBeCloseTo(98.54, 2);
  });

  it('returns null for missing keys', () => {
    const out = normalizeUptime({ '24': 0.99 });
    expect(out.uptime24h).toBeCloseTo(99, 2);
    expect(out.uptime7d).toBeNull();
    expect(out.uptime30d).toBeNull();
  });

  it('returns all-nulls for a non-object', () => {
    const out = normalizeUptime(null);
    expect(out).toEqual({ uptime24h: null, uptime7d: null, uptime30d: null });
    const out2 = normalizeUptime('x');
    expect(out2).toEqual({ uptime24h: null, uptime7d: null, uptime30d: null });
  });

  it('returns null for non-numeric values', () => {
    const out = normalizeUptime({ '24': 'oops', '168': null });
    expect(out.uptime24h).toBeNull();
    expect(out.uptime7d).toBeNull();
  });
});
