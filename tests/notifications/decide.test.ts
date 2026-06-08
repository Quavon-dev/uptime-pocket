/**
 * Tests for the pure notification decision logic.
 *
 * The scheduler is not exercised here — that's covered by integration
 * tests in app/ via Maestro (Phase D3). Here we lock down every
 * branch of the decision function with hand-crafted inputs.
 */

import { decideNotify, type DecideNotifyArgs } from '@/features/notifications/decide';
import { isWithinQuietHours, NO_QUIET } from '@/features/notifications/quietHours';

const baseCopy: DecideNotifyArgs['copy'] = {
  downTitle: (s, m) => ({ title: `${m} is down`, body: `${m} on ${s} is not responding.` }),
  recoveredTitle: (s, m) => ({ title: `${m} is up`, body: `${m} on ${s} is back online.` }),
  criticalTitle: (count) => ({ title: `${count} monitors down`, body: 'Multiple monitors down.' }),
};

const baseServer = { id: 'srv1', name: 'Production', notificationMode: 'direct' as const };

function makeArgs(overrides: Partial<DecideNotifyArgs> = {}): DecideNotifyArgs {
  return {
    server: baseServer,
    monitor: { id: 1, name: 'Website', status: 'down' },
    allMonitors: [
      { id: 1, name: 'Website', status: 'down' },
      { id: 2, name: 'API', status: 'up' },
    ],
    previousStatus: 'up',
    now: new Date(2026, 5, 7, 14, 30), // 14:30 local
    quietHours: NO_QUIET,
    copy: baseCopy,
    ...overrides,
  };
}

describe('decideNotify()', () => {
  it('skips when server mode is "none"', () => {
    const d = decideNotify(makeArgs({ server: { ...baseServer, notificationMode: 'none' } }));
    expect(d.shouldNotify).toBe(false);
    expect(d.reason).toBe('mode-off');
  });

  it('skips when there is no transition', () => {
    const d = decideNotify(makeArgs({ previousStatus: 'down' }));
    expect(d.shouldNotify).toBe(false);
    expect(d.reason).toBe('no-transition');
  });

  it('notifies on up -> down during normal hours', () => {
    const d = decideNotify(makeArgs());
    expect(d.shouldNotify).toBe(true);
    expect(d.reason).toBe('down');
    expect(d.title).toBe('Website is down');
    expect(d.body).toContain('Production');
  });

  it('skips a single monitor down during quiet hours', () => {
    const d = decideNotify(
      makeArgs({
        quietHours: { enabled: true, startMinute: 14 * 60, endMinute: 15 * 60 },
      })
    );
    expect(d.shouldNotify).toBe(false);
    expect(d.reason).toBe('quiet-hours');
  });

  it('still notifies when 3+ monitors are down (critical), even in quiet hours', () => {
    const d = decideNotify(
      makeArgs({
        allMonitors: [
          { id: 1, name: 'Website', status: 'down' },
          { id: 2, name: 'API', status: 'down' },
          { id: 3, name: 'DB', status: 'down' },
        ],
        monitor: { id: 1, name: 'Website', status: 'down' },
        quietHours: { enabled: true, startMinute: 14 * 60, endMinute: 15 * 60 },
      })
    );
    expect(d.shouldNotify).toBe(true);
    expect(d.reason).toBe('critical');
    expect(d.title).toBe('3 monitors down');
  });

  it('notifies on down -> up during normal hours', () => {
    const d = decideNotify(
      makeArgs({ monitor: { id: 1, name: 'Website', status: 'up' }, previousStatus: 'down' })
    );
    expect(d.shouldNotify).toBe(true);
    expect(d.reason).toBe('recovered');
    expect(d.title).toBe('Website is up');
  });

  it('silences recovery during quiet hours (no point waking you up for a fix)', () => {
    const d = decideNotify(
      makeArgs({
        monitor: { id: 1, name: 'Website', status: 'up' },
        previousStatus: 'down',
        quietHours: { enabled: true, startMinute: 14 * 60, endMinute: 15 * 60 },
      })
    );
    expect(d.shouldNotify).toBe(false);
    expect(d.reason).toBe('recovered-quiet');
  });

  it('skips transitions to maintenance/paused (no user impact)', () => {
    const d = decideNotify(
      makeArgs({ monitor: { id: 1, name: 'Website', status: 'maintenance' } })
    );
    expect(d.shouldNotify).toBe(false);
  });

  it('returns the down count after the transition for badge updates', () => {
    const d = decideNotify(
      makeArgs({
        allMonitors: [
          { id: 1, name: 'A', status: 'down' },
          { id: 2, name: 'B', status: 'down' },
          { id: 3, name: 'C', status: 'up' },
        ],
        monitor: { id: 1, name: 'A', status: 'down' },
      })
    );
    expect(d.downCountAfter).toBe(2);
  });
});

describe('isWithinQuietHours()', () => {
  const at = (h: number, m: number) => new Date(2026, 0, 1, h, m);

  it('returns false when window is disabled', () => {
    expect(isWithinQuietHours(at(3, 0), NO_QUIET)).toBe(false);
  });

  it('handles a same-day window', () => {
    const w = { enabled: true, startMinute: 13 * 60, endMinute: 15 * 60 };
    expect(isWithinQuietHours(at(12, 59), w)).toBe(false);
    expect(isWithinQuietHours(at(13, 0), w)).toBe(true);
    expect(isWithinQuietHours(at(14, 30), w)).toBe(true);
    expect(isWithinQuietHours(at(15, 0), w)).toBe(false);
  });

  it('handles a wrapping (overnight) window', () => {
    const w = { enabled: true, startMinute: 22 * 60, endMinute: 7 * 60 };
    expect(isWithinQuietHours(at(21, 59), w)).toBe(false);
    expect(isWithinQuietHours(at(22, 0), w)).toBe(true);
    expect(isWithinQuietHours(at(23, 30), w)).toBe(true);
    expect(isWithinQuietHours(at(0, 0), w)).toBe(true);
    expect(isWithinQuietHours(at(6, 59), w)).toBe(true);
    expect(isWithinQuietHours(at(7, 0), w)).toBe(false);
  });

  it('treats start == end as all-day quiet', () => {
    const w = { enabled: true, startMinute: 0, endMinute: 0 };
    expect(isWithinQuietHours(at(0, 0), w)).toBe(true);
    expect(isWithinQuietHours(at(12, 0), w)).toBe(true);
    expect(isWithinQuietHours(at(23, 59), w)).toBe(true);
  });
});
