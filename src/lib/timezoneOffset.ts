/**
 * Timezone-offset formatting helper.
 *
 * Kuma's `info` socket event ships the server's UTC offset as a
 * plain number of minutes east of UTC (e.g. +120 for Europe/Berlin
 * in winter, -300 for America/New_York). We render that as a short
 * ISO-style string like `+02:00` or `-05:30` for the server detail
 * screen's "Timezone" row.
 *
 * Returns `+00:00` for null / undefined / non-finite input (UTC
 * fallback). The helper is intentionally tiny and pure so it can be
 * unit-tested directly.
 *
 * @param minutes east-of-UTC offset (Kuma's `serverTimezoneOffset`)
 * @returns short string like `+02:00`, `-05:30`, or `+00:00`
 */
export function formatTimezoneOffset(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return '+00:00';
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.floor(Math.abs(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
