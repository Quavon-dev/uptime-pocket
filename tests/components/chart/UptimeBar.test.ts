/**
 * Tests for UptimeBar's pure bucketing logic.
 *
 * The visual rendering is tested implicitly via the design-system
 * showcase and the monitors-tab integration; here we test the math
 * that determines segment count, segment color, and the aggregate
 * percentage. `bucketUptimePoints` is the only public testable
 * surface — the component is just a styled wrapper around it.
 */

import { bucketUptimePoints } from '@/components/chart/UptimeBar';
import type { UptimePoint } from '@/domain/models';

const COLORS = {
  up: 'green',
  down: 'red',
  pending: 'amber',
  empty: 'gray',
};

const getColor = (status: 'up' | 'down' | 'pending' | 'empty') => COLORS[status];

// Helper to build a synthetic heartbeat series of N points,
// alternating up/down in the requested ratio.
function makeSeries(count: number, upRatio: number, startMs = 0): UptimePoint[] {
  const out: UptimePoint[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      timestamp: new Date(startMs + i * 1000),
      up: i / count < upRatio,
    });
  }
  return out;
}

describe('bucketUptimePoints()', () => {
  it('returns empty bars + 0% for empty input', () => {
    const { bars, upPct } = bucketUptimePoints([], 50, getColor);
    expect(bars).toEqual([]);
    expect(upPct).toBe(0);
  });

  it('emits exactly N segments when data fills the buckets', () => {
    // 100 points / 50 segments = 2 points per bucket, no remainder
    const { bars } = bucketUptimePoints(makeSeries(100, 1), 50, getColor);
    expect(bars).toHaveLength(50);
  });

  it('still emits N segments when data is shorter than N (empty-bucket branches)', () => {
    // 10 points / 50 segments → bucketSize = floor(10/50) = 0 → clamped to 1
    // So we get 10 buckets with data and 40 empty ones.
    const { bars } = bucketUptimePoints(makeSeries(10, 1), 50, getColor);
    expect(bars).toHaveLength(50);
    // First 10 buckets are "up", last 40 are "empty" (gray).
    expect(bars.slice(0, 10).map((b) => b.color)).toEqual(
      Array(10).fill(COLORS.up)
    );
    expect(bars.slice(10).map((b) => b.color)).toEqual(
      Array(40).fill(COLORS.empty)
    );
  });

  it('marks a fully-up bucket as "up"', () => {
    const { bars } = bucketUptimePoints(makeSeries(100, 1), 50, getColor);
    expect(bars.every((b) => b.color === COLORS.up)).toBe(true);
    expect(bars.every((b) => b.up === true)).toBe(true);
  });

  it('marks a fully-down bucket as "down"', () => {
    const { bars } = bucketUptimePoints(makeSeries(100, 0), 50, getColor);
    expect(bars.every((b) => b.color === COLORS.down)).toBe(true);
    expect(bars.every((b) => b.up === false)).toBe(true);
  });

  it('marks a mixed bucket with majority-up as "pending" (amber)', () => {
    // 6 up + 4 down out of 10 in a single segment
    const mixed: UptimePoint[] = [
      ...Array(6).fill(0).map((_, i) => ({ timestamp: new Date(i * 1000), up: true })),
      ...Array(4).fill(0).map((_, i) => ({ timestamp: new Date((i + 6) * 1000), up: false })),
    ];
    const { bars } = bucketUptimePoints(mixed, 1, getColor);
    expect(bars).toHaveLength(1);
    expect(bars[0].color).toBe(COLORS.pending);
    expect(bars[0].up).toBe(true);
  });

  it('marks a mixed bucket with majority-down as "down"', () => {
    // 2 up + 8 down out of 10 in a single segment
    const mixed: UptimePoint[] = [
      ...Array(2).fill(0).map((_, i) => ({ timestamp: new Date(i * 1000), up: true })),
      ...Array(8).fill(0).map((_, i) => ({ timestamp: new Date((i + 2) * 1000), up: false })),
    ];
    const { bars } = bucketUptimePoints(mixed, 1, getColor);
    expect(bars[0].color).toBe(COLORS.down);
    expect(bars[0].up).toBe(false);
  });

  it('computes the aggregate uptime percentage correctly', () => {
    const { upPct } = bucketUptimePoints(makeSeries(100, 0.75), 50, getColor);
    expect(upPct).toBeCloseTo(75, 5);
  });

  it('returns 0% when the input has no data', () => {
    const { upPct } = bucketUptimePoints([], 50, getColor);
    expect(upPct).toBe(0);
  });

  it('uses the first timestamp in each bucket as the stable id', () => {
    const series = makeSeries(4, 1, 1_000_000);
    const { bars } = bucketUptimePoints(series, 2, getColor);
    // bucketSize = floor(4/2) = 2 → 2 buckets, ids based on slice[0]
    expect(bars[0].id).toBe(`seg-0-${new Date(1_000_000).getTime()}`);
    expect(bars[1].id).toBe(`seg-1-${new Date(1_002_000).getTime()}`);
  });

  it('handles a single point correctly (no division by zero)', () => {
    const { bars, upPct } = bucketUptimePoints(
      [{ timestamp: new Date(0), up: true }],
      50,
      getColor
    );
    // bucketSize = max(1, floor(1/50)) = 1
    // First bucket has the point (up), rest are empty
    expect(bars).toHaveLength(50);
    expect(bars[0].color).toBe(COLORS.up);
    expect(bars[1].color).toBe(COLORS.empty);
    expect(upPct).toBe(100);
  });
});
