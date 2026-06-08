/**
 * Version-string comparison utilities.
 *
 * Used to gate features on a minimum Kuma version. We compare
 * dot-separated numeric strings component-by-component. Non-numeric
 * suffixes (e.g. "2.3.2-beta.1") are ignored — we treat the version
 * as the longest leading run of integers separated by dots.
 *
 * Examples:
 *   thisIsOlder("1.23.0", "2.0.0")  // true
 *   thisIsOlder("2.0.0",  "2.0.0")  // false (equal, not older)
 *   thisIsOlder("2.3.2",  "2.3")    // false
 *   thisIsOlder("2.3",    "2.3.1")  // true
 */

export function thisIsOlder(version: string, minVersion: string): boolean {
  const v = version.split('.').map((s) => Number.parseInt(s, 10) || 0);
  const m = minVersion.split('.').map((s) => Number.parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(v.length, m.length); i++) {
    const a = v[i] ?? 0;
    const b = m[i] ?? 0;
    if (a < b) return true;
    if (a > b) return false;
  }
  return false;
}

/** Parse "2.3.2-beta.1" -> [2, 3, 2]. Used for display / comparison. */
export function parseVersion(version: string): number[] {
  return version
    .split('.')
    .map((s) => Number.parseInt(s, 10) || 0);
}
