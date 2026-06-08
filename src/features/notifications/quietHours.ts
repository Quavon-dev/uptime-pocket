/**
 * Quiet-hours window matching.
 *
 * A "quiet window" is a [startMinute, endMinute) interval on a 24h
 * clock. It can wrap midnight (e.g. 22:00 -> 07:00). The window
 * resolution is 1 minute.
 *
 * Semantics
 * ---------
 * - If start < end: the window is the same calendar day, e.g.
 *   start=13:00, end=15:00 means "between 1pm and 3pm today".
 * - If start > end: the window wraps midnight, e.g. start=22:00,
 *   end=07:00 means "from 10pm to 7am, crossing into the next day".
 * - If start == end: the window covers the entire day
 *   (we treat this as a special "all-day quiet" state).
 * - If `enabled` is false, the window is treated as empty (never
 *   matches).
 *
 * The function is pure and timezone-agnostic. The caller is
 * responsible for passing a `Date` that's already in the user's
 * local timezone (in JS, `new Date()` is always local by default).
 */

export interface QuietWindow {
  enabled: boolean;
  /** Minutes from midnight, 0..1439. */
  startMinute: number;
  /** Minutes from midnight, 0..1439. */
  endMinute: number;
}

/** An always-false quiet window, useful as a default. */
export const NO_QUIET: QuietWindow = {
  enabled: false,
  startMinute: 22 * 60,
  endMinute: 7 * 60,
};

/**
 * Returns true iff the given local Date falls inside the quiet window.
 *
 * Wraps correctly: 22:00 -> 07:00 contains 23:00, 00:00, 06:30, etc.
 */
export function isWithinQuietHours(
  now: Date,
  window: QuietWindow
): boolean {
  if (!window.enabled) return false;
  if (window.startMinute === window.endMinute) {
    // All-day quiet is a separate state the caller should
    // surface in UI; here we treat it as "yes, suppress".
    return true;
  }
  const m = now.getHours() * 60 + now.getMinutes();
  if (window.startMinute < window.endMinute) {
    // Same-day window: m in [start, end)
    return m >= window.startMinute && m < window.endMinute;
  }
  // Wrapping window: m >= start OR m < end
  return m >= window.startMinute || m < window.endMinute;
}
