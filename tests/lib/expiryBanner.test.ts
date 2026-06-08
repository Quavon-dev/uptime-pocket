/**
 * Tests for the pure decision logic that drives the
 * ExpiryBanner component.
 *
 * We test `assessCertExpiry` and `assessDomainExpiry` with a
 * matrix of edge cases. The body-text generation depends on the
 * i18n layer (not the focus of this test), so we pass a stub
 * formatter / translator in.
 */
import { assessCertExpiry, assessDomainExpiry } from '@/lib/expiryBanner';
import type { KumaCertInfo } from '@/data/socket/normalize';

const days = (d: number) => `in ${d} days`;
const tBody = (key: string, params: Record<string, string | number> = {}) =>
  `[${key}:${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')}]`;

describe('assessCertExpiry', () => {
  it('returns null when certInfo is null (Kuma hasn’t pushed yet)', () => {
    const out = assessCertExpiry(null, days, tBody);
    expect(out.severity).toBeNull();
    expect(out.body).toBeNull();
  });

  it('treats days < 0 as expired (down severity)', () => {
    const cert: KumaCertInfo = {
      valid: true,
      daysRemaining: -3,
      validTo: null,
      subject: 'example.com',
      issuer: null,
    };
    const out = assessCertExpiry(cert, days, tBody);
    expect(out.severity).toBe('down');
    expect(out.body).toBe('[expired:subject=example.com]');
  });

  it('treats !valid as invalid (down severity)', () => {
    const cert: KumaCertInfo = {
      valid: false,
      daysRemaining: 60,
      validTo: null,
      subject: 'example.com',
      issuer: null,
    };
    const out = assessCertExpiry(cert, days, tBody);
    expect(out.severity).toBe('down');
    expect(out.body).toBe('[bodyInvalid:subject=example.com]');
  });

  it('treats days <= 30 as expiring (pending severity)', () => {
    const cert: KumaCertInfo = {
      valid: true,
      daysRemaining: 7,
      validTo: null,
      subject: 'example.com',
      issuer: null,
    };
    const out = assessCertExpiry(cert, days, tBody);
    expect(out.severity).toBe('pending');
    expect(out.body).toBe('[body:subject=example.com,days=in 7 days]');
  });

  it('treats exactly 30 days as expiring (boundary)', () => {
    const cert: KumaCertInfo = {
      valid: true,
      daysRemaining: 30,
      validTo: null,
      subject: 'example.com',
      issuer: null,
    };
    const out = assessCertExpiry(cert, days, tBody);
    expect(out.severity).toBe('pending');
  });

  it('treats 31 days as healthy (silent)', () => {
    const cert: KumaCertInfo = {
      valid: true,
      daysRemaining: 31,
      validTo: null,
      subject: 'example.com',
      issuer: null,
    };
    const out = assessCertExpiry(cert, days, tBody);
    expect(out.severity).toBeNull();
    expect(out.body).toBeNull();
  });

  it('treats null daysRemaining + valid as healthy (silent)', () => {
    // Kuma can send daysRemaining=null if the cert chain is valid
    // but no expiry is parsed (rare, but defensive).
    const cert: KumaCertInfo = {
      valid: true,
      daysRemaining: null,
      validTo: '2099-01-01T00:00:00Z',
      subject: 'example.com',
      issuer: null,
    };
    const out = assessCertExpiry(cert, days, tBody);
    expect(out.severity).toBeNull();
  });
});

describe('assessDomainExpiry', () => {
  it('returns null when domainInfo is null', () => {
    const out = assessDomainExpiry(null, days, tBody);
    expect(out.severity).toBeNull();
  });

  it('treats days < 0 as expired (down severity)', () => {
    const out = assessDomainExpiry(
      { daysRemaining: -5, expiresOn: null },
      days,
      tBody
    );
    expect(out.severity).toBe('down');
    // The stub translator always emits a trailing `:params` segment
    // (empty for the domain helpers which have no params), so we
    // expect `[expired:]` — the body string the component will
    // surface.
    expect(out.body).toBe('[expired:]');
  });

  it('treats days <= 60 as expiring (pending severity)', () => {
    const out = assessDomainExpiry(
      { daysRemaining: 45, expiresOn: null },
      days,
      tBody
    );
    expect(out.severity).toBe('pending');
    expect(out.body).toBe('[body:]');
  });

  it('treats exactly 60 days as expiring (boundary)', () => {
    const out = assessDomainExpiry(
      { daysRemaining: 60, expiresOn: null },
      days,
      tBody
    );
    expect(out.severity).toBe('pending');
  });

  it('treats 61 days as healthy (silent)', () => {
    const out = assessDomainExpiry(
      { daysRemaining: 61, expiresOn: null },
      days,
      tBody
    );
    expect(out.severity).toBeNull();
  });

  it('treats null daysRemaining as healthy (silent)', () => {
    const out = assessDomainExpiry(
      { daysRemaining: null, expiresOn: null },
      days,
      tBody
    );
    expect(out.severity).toBeNull();
  });
});
