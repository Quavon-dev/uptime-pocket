/**
 * Tests for the widget snapshot builder. Pure-function tests
 * (no React, no native modules) so they run in <100ms.
 */
import {
  buildWidgetSnapshot,
  worstStatus,
  type BuildSnapshotInput,
} from '../snapshot';
import type { Monitor, MonitorStatus } from '@/domain/models';

function makeMonitor(overrides: Partial<Monitor> & { id: number; name: string; status: MonitorStatus }): Monitor {
  return {
    type: 'http',
    parent: null,
    active: true,
    interval: 60,
    retryInterval: 60,
    maxretries: 0,
    upsideDown: false,
    tags: [],
    notificationIDList: {},
    lastCheckAt: undefined,
    responseTime: undefined,
    ...overrides,
  };
}

describe('worstStatus', () => {
  it('returns up for an empty list', () => {
    expect(worstStatus([])).toBe('up');
  });
  it('returns the worst across all', () => {
    expect(
      worstStatus([
        makeMonitor({ id: 1, name: 'a', status: 'up' }),
        makeMonitor({ id: 2, name: 'b', status: 'down' }),
        makeMonitor({ id: 3, name: 'c', status: 'pending' }),
      ])
    ).toBe('down');
  });
  it('treats paused as worse than up', () => {
    expect(
      worstStatus([
        makeMonitor({ id: 1, name: 'a', status: 'up' }),
        makeMonitor({ id: 2, name: 'b', status: 'paused' }),
      ])
    ).toBe('paused');
  });
});

describe('buildWidgetSnapshot', () => {
  it('returns an empty snapshot for no servers', () => {
    const snap = buildWidgetSnapshot({
      monitorsByServer: new Map(),
      serverNameById: new Map(),
      connectedByServer: new Map(),
    });
    expect(snap.version).toBe(1);
    expect(snap.servers).toEqual([]);
    expect(snap.generatedAt).toBeGreaterThan(0);
  });

  it('skips servers not in the name map', () => {
    const monitors = new Map([
      ['s1', [makeMonitor({ id: 1, name: 'a', status: 'up' })]],
    ]);
    const snap = buildWidgetSnapshot({
      monitorsByServer: monitors,
      serverNameById: new Map(), // no names!
      connectedByServer: new Map([['s1', true]]),
    });
    // The server's monitors are still included but with the id as the label.
    expect(snap.servers).toHaveLength(1);
    expect(snap.servers[0].monitors[0].serverLabel).toBe('s1');
  });

  it('sorts servers by id for determinism', () => {
    const monitors = new Map<string, Monitor[]>([
      ['zeta', [makeMonitor({ id: 1, name: 'z', status: 'up' })]],
      ['alpha', [makeMonitor({ id: 1, name: 'a', status: 'up' })]],
      ['mike', [makeMonitor({ id: 1, name: 'm', status: 'up' })]],
    ]);
    const snap = buildWidgetSnapshot({
      monitorsByServer: monitors,
      serverNameById: new Map([
        ['zeta', 'Z'],
        ['alpha', 'A'],
        ['mike', 'M'],
      ]),
      connectedByServer: new Map([
        ['zeta', true],
        ['alpha', true],
        ['mike', true],
      ]),
    });
    expect(snap.servers.map((s) => s.id)).toEqual(['alpha', 'mike', 'zeta']);
  });

  it('places down monitors first within a server', () => {
    const monitors = new Map([
      [
        's1',
        [
          makeMonitor({ id: 1, name: 'a', status: 'up' }),
          makeMonitor({ id: 2, name: 'b', status: 'down' }),
          makeMonitor({ id: 3, name: 'c', status: 'pending' }),
        ],
      ],
    ]);
    const snap = buildWidgetSnapshot({
      monitorsByServer: monitors,
      serverNameById: new Map([['s1', 'S1']]),
      connectedByServer: new Map([['s1', true]]),
    });
    expect(snap.servers[0].monitors.map((m) => m.status)).toEqual(['down', 'pending', 'up']);
  });

  it('namespaces monitor ids with the server id', () => {
    const monitors = new Map([
      ['s1', [makeMonitor({ id: 1, name: 'a', status: 'up' })]],
      ['s2', [makeMonitor({ id: 1, name: 'a', status: 'up' })]],
    ]);
    const snap = buildWidgetSnapshot({
      monitorsByServer: monitors,
      serverNameById: new Map([['s1', 'S1'], ['s2', 'S2']]),
      connectedByServer: new Map([['s1', true], ['s2', true]]),
    });
    const ids = snap.servers.flatMap((s) => s.monitors.map((m) => m.id));
    expect(ids).toContain('s1::1');
    expect(ids).toContain('s2::1');
  });

  it('respects maxMonitorsPerServer', () => {
    const monitors = new Map<string, Monitor[]>([
      [
        's1',
        Array.from({ length: 50 }, (_, i) =>
          makeMonitor({ id: i, name: `m${i}`, status: 'up' })
        ),
      ],
    ]);
    const snap = buildWidgetSnapshot({
      monitorsByServer: monitors,
      serverNameById: new Map([['s1', 'S1']]),
      connectedByServer: new Map([['s1', true]]),
      maxMonitorsPerServer: 5,
    });
    expect(snap.servers[0].monitors).toHaveLength(5);
  });

  it('respects maxMonitorsTotal across servers', () => {
    const monitors = new Map<string, Monitor[]>([
      ['s1', Array.from({ length: 30 }, (_, i) => makeMonitor({ id: i, name: `a${i}`, status: 'up' }))],
      ['s2', Array.from({ length: 30 }, (_, i) => makeMonitor({ id: i, name: `b${i}`, status: 'up' }))],
    ]);
    const snap = buildWidgetSnapshot({
      monitorsByServer: monitors,
      serverNameById: new Map([['s1', 'S1'], ['s2', 'S2']]),
      connectedByServer: new Map([['s1', true], ['s2', true]]),
      maxMonitorsTotal: 25,
      maxMonitorsPerServer: 30,
    });
    const total = snap.servers.reduce((acc, s) => acc + s.monitors.length, 0);
    expect(total).toBe(25);
  });

  it('computes worstStatus per server', () => {
    const monitors = new Map<string, Monitor[]>([
      ['s1', [makeMonitor({ id: 1, name: 'a', status: 'up' })]],
      ['s2', [makeMonitor({ id: 1, name: 'a', status: 'down' })]],
      ['s3', [makeMonitor({ id: 1, name: 'a', status: 'pending' })]],
      ['s4', []], // no monitors
    ]);
    const snap = buildWidgetSnapshot({
      monitorsByServer: monitors,
      serverNameById: new Map<string, string>([
        ['s1', 'S1'],
        ['s2', 'S2'],
        ['s3', 'S3'],
        ['s4', 'S4'],
      ]),
      connectedByServer: new Map<string, boolean>([
        ['s1', true],
        ['s2', true],
        ['s3', true],
        ['s4', false],
      ]),
    });
    const byId = Object.fromEntries(snap.servers.map((s) => [s.id, s.worstStatus]));
    expect(byId.s1).toBe('up');
    expect(byId.s2).toBe('down');
    expect(byId.s3).toBe('pending');
    expect(byId.s4).toBe('pending'); // no monitors → pending
  });

  it('preserves response time and lastCheckAt', () => {
    const when = new Date('2026-06-08T12:00:00Z');
    const monitors = new Map([
      [
        's1',
        [
          makeMonitor({
            id: 1,
            name: 'API',
            status: 'up',
            responseTime: 142,
            lastCheckAt: when,
          }),
        ],
      ],
    ]);
    const snap = buildWidgetSnapshot({
      monitorsByServer: monitors,
      serverNameById: new Map([['s1', 'S1']]),
      connectedByServer: new Map([['s1', true]]),
    });
    const m = snap.servers[0].monitors[0];
    expect(m.responseTime).toBe(142);
    expect(m.lastCheckAt).toBe(when.getTime());
  });

  it('captures the connection state from the parallel map', () => {
    const monitors = new Map([['s1', [makeMonitor({ id: 1, name: 'a', status: 'up' })]]]);
    const snap = buildWidgetSnapshot({
      monitorsByServer: monitors,
      serverNameById: new Map([['s1', 'S1']]),
      connectedByServer: new Map([['s1', false]]),
    });
    expect(snap.servers[0].connected).toBe(false);
  });
});
