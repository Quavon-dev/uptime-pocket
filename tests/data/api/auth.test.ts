/**
 * Tests for the auth strategies.
 *
 * No mocks for the pure logic of PasswordSession (header
 * construction, isExpired, JWT decode). PasswordSession.refresh() is
 * tested with a scoped `globalThis.fetch` stub (not jest.mock) so
 * we exercise the real decode + refresh path.
 *
 * As of v0.8+ BearerSession is gone (Kuma 2.x's socket.io auth
 * only accepts JWTs, not API keys).
 */

import {
  PasswordSession,
  createSession,
  decodeJwtExpiry,
  type SocketLoginFn,
} from '@/data/api/auth';
import type { AuthStrategy } from '@/domain/models';

const stubLogin: SocketLoginFn = () => Promise.reject(new Error('not used'));

// ---- PasswordSession ----

describe('PasswordSession', () => {
  it('reports kind as "password"', () => {
    const s = new PasswordSession('quavon', 'secret', '', stubLogin);
    expect(s.kind).toBe('password');
  });

  it('does not set an Authorization header until a token is provided', () => {
    const s = new PasswordSession('quavon', 'pw', '', stubLogin);
    const headers = new Headers();
    s.applyHeaders(headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('reports isExpired() = true before any token is set', () => {
    const s = new PasswordSession('u', 'p', '', stubLogin);
    expect(s.isExpired()).toBe(true);
  });

  it('exposes currentToken as the empty string before refresh', () => {
    const s = new PasswordSession('u', 'p', '', stubLogin);
    expect(s.currentToken).toBe('');
  });

  it('uses the JWT exp claim to compute isExpired()', async () => {
    // Build a JWT with exp = now + 3600s
    const expSec = Math.floor(Date.now() / 1000) + 3600;
    const fakeJwt = makeJwt({ sub: 'quavon', exp: expSec });
    const loginFn: SocketLoginFn = async () => fakeJwt;
    const s = new PasswordSession('quavon', 'pw', '', loginFn);
    await s.refresh();
    const headers = new Headers();
    s.applyHeaders(headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${fakeJwt}`);
    // Not expired (well before the 30s early-refresh window).
    expect(s.isExpired()).toBe(false);
    // And the getter returns it.
    expect(s.currentToken).toBe(fakeJwt);
  });

  it('reports isExpired() = true after the JWT exp passes', async () => {
    // Build a JWT that already expired 60s ago
    const expSec = Math.floor(Date.now() / 1000) - 60;
    const fakeJwt = makeJwt({ sub: 'quavon', exp: expSec });
    const loginFn: SocketLoginFn = async () => fakeJwt;
    const s = new PasswordSession('quavon', 'pw', '', loginFn);
    await s.refresh();
    // 30s early-refresh window means anything past exp is expired.
    expect(s.isExpired()).toBe(true);
  });

  it('throws when the login function rejects', async () => {
    const loginFn: SocketLoginFn = async () => {
      throw new Error('socket disconnected');
    };
    const s = new PasswordSession('u', 'p', '', loginFn);
    await expect(s.refresh()).rejects.toThrow(/socket disconnected/);
  });

  it('throws when the login function returns no token', async () => {
    const loginFn: SocketLoginFn = async () => '';
    const s = new PasswordSession('u', 'p', '', loginFn);
    await expect(s.refresh()).rejects.toThrow(/no token/);
  });
});

// ---- createSession factory ----

describe('createSession', () => {
  it('creates a PasswordSession for kind: password', () => {
    const s = createSession(
      { kind: 'password', username: 'u', password: 'p' },
      'https://x',
      stubLogin
    );
    expect(s.kind).toBe('password');
  });

  it('preserves the kind of any password strategy', () => {
    const strategies: AuthStrategy[] = [
      { kind: 'password', username: 'u', password: 'p' },
    ];
    for (const strat of strategies) {
      const s = createSession(strat, 'https://x', stubLogin);
      expect(s.kind).toBe(strat.kind);
    }
  });
});

// ---- decodeJwtExpiry ----

describe('decodeJwtExpiry', () => {
  it('extracts the exp claim (seconds → ms)', () => {
    const jwt = makeJwt({ exp: 1700000000 });
    expect(decodeJwtExpiry(jwt)).toBe(1700000000 * 1000);
  });

  it('returns null for a malformed token', () => {
    expect(decodeJwtExpiry('not-a-jwt')).toBeNull();
    expect(decodeJwtExpiry('a.b')).toBeNull();
    expect(decodeJwtExpiry('a.b.c.d')).toBeNull();
  });

  it('returns null when the payload has no exp claim', () => {
    const jwt = makeJwt({ sub: 'quavon' });
    expect(decodeJwtExpiry(jwt)).toBeNull();
  });

  it('returns null when exp is not a number', () => {
    const jwt = makeJwt({ exp: 'soon' });
    expect(decodeJwtExpiry(jwt)).toBeNull();
  });
});

// ---- helpers ----

/** Build a fake JWT with the given payload. Only used in unit tests. */
function makeJwt(payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

function base64url(s: string): string {
  return Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
