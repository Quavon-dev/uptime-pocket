/**
 * Tests for the timezone-offset formatter used by the server detail
 * screen to render Kuma's `serverTimezoneOffset` (minutes east of
 * UTC) as a short string like `+02:00` or `-05:30`.
 *
 * Kuma sends the offset in minutes; we split into hours and minutes,
 * then apply the sign. Returns `+00:00` for null / undefined /
 * non-finite (UTC fallback).
 *
 * The helper lives inline in `app/servers/[id]/index.tsx` so we test
 * the behavior via the public surface (component output) is overkill
 * for a one-line formatter — instead we re-validate the expected
 * output via a focused unit-equivalent that mirrors the helper's
 * behavior. If the helper ever moves into a shared module, this
 * test should follow.
 */
import { formatTimezoneOffset } from '@/lib/timezoneOffset';

describe('formatTimezoneOffset', () => {
  it('formats positive minutes east of UTC', () => {
    expect(formatTimezoneOffset(120)).toBe('+02:00');
    expect(formatTimezoneOffset(60)).toBe('+01:00');
    expect(formatTimezoneOffset(30)).toBe('+00:30');
  });

  it('formats negative minutes west of UTC', () => {
    expect(formatTimezoneOffset(-180)).toBe('-03:00');
    expect(formatTimezoneOffset(-330)).toBe('-05:30');
  });

  it('formats zero as +00:00', () => {
    expect(formatTimezoneOffset(0)).toBe('+00:00');
  });

  it('handles fractional minutes by flooring to whole minutes', () => {
    // Kuma sends integers in practice, but be defensive.
    expect(formatTimezoneOffset(59.9)).toBe('+00:59');
  });

  it('falls back to +00:00 for null / undefined / non-finite', () => {
    expect(formatTimezoneOffset(null)).toBe('+00:00');
    expect(formatTimezoneOffset(undefined)).toBe('+00:00');
    expect(formatTimezoneOffset(Number.NaN)).toBe('+00:00');
    expect(formatTimezoneOffset(Number.POSITIVE_INFINITY)).toBe('+00:00');
  });
});
