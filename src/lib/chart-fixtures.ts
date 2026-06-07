/**
 * Deterministic chart fixtures for the design system and component previews.
 *
 * These exist ONLY for places that need to show a "filled-in" chart or uptime bar
 * without a real data source — primarily the design system / storybook screen
 * and component previews. Real app data flows through the Kuma connection
 * manager.
 *
 * The randomness is a tiny linear-congruential generator seeded with `seed`,
 * so the same monitor id always produces the same chart shape.
 */

import type { TimePoint, UptimePoint } from '@/domain/models';

/**
 * Generate sample response time data for a chart preview.
 * Produces N points with realistic-looking variation.
 */
export function generateResponseTimeData(
  count: number = 60,
  base: number = 120,
  variance: number = 40,
  seed: number = 1
): TimePoint[] {
  const data: TimePoint[] = [];
  const now = Date.now();
  let value = base;

  // Simple LCG for deterministic randomness
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  for (let i = 0; i < count; i++) {
    // Random walk with mean reversion
    const target = base + (rand() - 0.5) * variance * 2;
    value = value * 0.7 + target * 0.3;
    // Occasional spike
    if (rand() > 0.95) value += variance * 1.5;
    data.push({
      timestamp: new Date(now - (count - i) * 60_000),
      value: Math.max(10, value),
    });
  }
  return data;
}

/**
 * Generate sample uptime data for an UptimeBar preview.
 * Mostly up, with a few down periods.
 */
export function generateUptimeData(
  count: number = 200,
  downtimeRate: number = 0.02,
  seed: number = 2
): UptimePoint[] {
  const data: UptimePoint[] = [];
  const now = Date.now();

  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  // Add a small outage cluster around the middle
  const outageStart = Math.floor(count * 0.4);
  const outageEnd = outageStart + 8;

  for (let i = 0; i < count; i++) {
    let up = rand() > downtimeRate;
    if (i >= outageStart && i < outageEnd) {
      up = false; // outage
    }
    data.push({
      timestamp: new Date(now - (count - i) * 60_000),
      up,
    });
  }
  return data;
}
