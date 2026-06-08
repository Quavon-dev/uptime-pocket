/**
 * Pure decision logic for the ExpiryBanner component on the monitor
 * detail screen.
 *
 * The component itself (in `app/monitors/[monitorId].tsx`) renders
 * two kinds of banners: TLS cert expiry (HTTPS monitors) and domain
 * expiry (domain monitors). Both are gated by Kuma's payload —
 * we don't show anything for a healthy cert or a domain that isn't
 * expiring soon.
 *
 * The decision of "should this banner appear, and with what
 * severity?" is the kind of logic that benefits from a unit test
 * with a matrix of edge cases (cert at 31 days → silent; at 30
 * days → pending; at 0 days → down; invalid → down; expired
 * days=-1 → down). Extracting it here keeps the React component
 * lean and the test targeted.
 */
import type { KumaCertInfo } from '@/data/socket/normalize';

export type ExpirySeverity = 'down' | 'pending';

export interface ExpiryAssessment {
  severity: ExpirySeverity | null;
  /**
   * Human-readable body, e.g. "Certificate for example.com expires
   * in 7 days." The component can drop this directly into the
   * banner. The title is keyed by the caller (different for cert
   * vs. domain). Null = no banner.
   */
  body: string | null;
  /**
   * Pre-formatted "Expires in N days" / "Expired" / "Expires
   * tomorrow" / etc. for use in body templates. Null when there's
   * no actionable risk.
   */
  daysText: string | null;
}

/**
 * Decide whether the TLS-cert banner should appear, and with what
 * severity. Mirrors the ladder documented on the component:
 *
 *   - days < 0 (expired)      → 'down'
 *   - !valid (chain error…)   → 'down'
 *   - days ≤ 30 (expiring)    → 'pending'
 *   - days > 30  (healthy)    → null
 *   - certInfo === null       → null (Kuma hasn't pushed it yet)
 */
export function assessCertExpiry(
  certInfo: KumaCertInfo | null,
  formatDays: (days: number) => string,
  bodyFor: (key: 'body' | 'bodyInvalid' | 'expired', params: Record<string, string | number>) => string
): ExpiryAssessment {
  if (!certInfo) {
    return { severity: null, body: null, daysText: null };
  }
  const days = certInfo.daysRemaining;
  const subject = certInfo.subject ?? 'this certificate';
  if (days != null && days < 0) {
    return {
      severity: 'down',
      body: bodyFor('expired', { subject }),
      daysText: formatDays(days),
    };
  }
  if (!certInfo.valid) {
    return {
      severity: 'down',
      body: bodyFor('bodyInvalid', { subject }),
      daysText: null,
    };
  }
  if (days != null && days <= 30) {
    return {
      severity: 'pending',
      body: bodyFor('body', { subject, days: formatDays(days) }),
      daysText: formatDays(days),
    };
  }
  return { severity: null, body: null, daysText: null };
}

/**
 * Decide whether the domain-expiry banner should appear, and with
 * what severity.
 *
 *   - days < 0 (expired)   → 'down'
 *   - days ≤ 60 (expiring) → 'pending' (Kuma's own threshold)
 *   - days > 60  (healthy) → null
 *   - domainInfo === null  → null
 */
export function assessDomainExpiry(
  domainInfo: { daysRemaining: number | null; expiresOn: string | null } | null,
  formatDays: (days: number) => string,
  bodyFor: (key: 'body' | 'expired') => string
): ExpiryAssessment {
  if (!domainInfo) {
    return { severity: null, body: null, daysText: null };
  }
  const days = domainInfo.daysRemaining;
  if (days != null && days < 0) {
    return {
      severity: 'down',
      body: bodyFor('expired'),
      daysText: formatDays(days),
    };
  }
  if (days != null && days <= 60) {
    return {
      severity: 'pending',
      body: bodyFor('body'),
      daysText: formatDays(days),
    };
  }
  return { severity: null, body: null, daysText: null };
}
