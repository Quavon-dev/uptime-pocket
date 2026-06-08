/**
 * Tests for swatches + TimePicker formatting helpers.
 *
 * The full TimePicker component is a flatlist of touch targets and
 * snapshotting it is more brittle than it's worth. We test the pure
 * helpers (formatMinute, quietHoursHint) and the swatch data shape.
 */

import {
  formatMinute,
  quietHoursHint,
} from '@/components/ui/TimePicker';
import { ACCENT_SWATCHES, findSwatch } from '@/theme/swatches';
import { t } from '@/i18n';

describe('formatMinute()', () => {
  it('zero-pads hours and minutes', () => {
    expect(formatMinute(0)).toBe('00:00');
    expect(formatMinute(60)).toBe('01:00');
    expect(formatMinute(7 * 60 + 5)).toBe('07:05');
    expect(formatMinute(22 * 60)).toBe('22:00');
  });

  it('handles the full range 0..1439', () => {
    expect(formatMinute(1439)).toBe('23:59');
  });
});

describe('quietHoursHint()', () => {
  it('returns null for a same-day range', () => {
    expect(quietHoursHint(60, 120)).toBeNull();
  });

  it('returns the overnight hint when start > end', () => {
    const hint = quietHoursHint(22 * 60, 7 * 60);
    expect(hint).toBe(t('settings.quietHours.overnightHint'));
  });

  it('returns the all-day hint when start == end', () => {
    const hint = quietHoursHint(0, 0);
    expect(hint).toBe(t('settings.quietHours.allDayHint'));
  });
});

describe('ACCENT_SWATCHES', () => {
  it('exposes a non-empty list of swatches with stable ids', () => {
    expect(ACCENT_SWATCHES.length).toBeGreaterThan(0);
    for (const sw of ACCENT_SWATCHES) {
      expect(sw.id).toMatch(/^[a-z]+$/);
      expect(sw.hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(sw.brand).toMatch(/^#[0-9A-F]{6}$/);
      expect(sw.fill).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('has unique ids', () => {
    const ids = ACCENT_SWATCHES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('first swatch is the brand default (emerald)', () => {
    expect(ACCENT_SWATCHES[0].id).toBe('emerald');
    expect(ACCENT_SWATCHES[0].hex).toBe('#10B981');
  });
});

describe('findSwatch()', () => {
  it('returns the first swatch when id is null', () => {
    expect(findSwatch(null).id).toBe('emerald');
  });

  it('returns the matching swatch when id matches', () => {
    expect(findSwatch('violet').id).toBe('violet');
  });

  it('falls back to the first swatch when id is unknown', () => {
    expect(findSwatch('nope-not-a-real-id').id).toBe('emerald');
  });
});
