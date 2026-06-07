/**
 * Tests for the auth strategies.
 *
 * No mocks for the pure logic of BearerSession and PasswordSession
 * (header construction, socket auth payload, isExpired, JWT decode).
 * PasswordSession.refresh() is tested with a scoped `globalThis.fetch`
 * stub (not jest.mock) so we exercise the real decode + refresh path.
 */

import {
  BearerSession,
  PasswordSession,
  createSession,
  decodeJwtExpiry,
  type SocketLoginFn,
} from '@/data/api/auth';
import type { AuthStrategy } from '@/domain/models';

const stubLogin: SocketLoginFn = () => Promise.reject(new Error('not used'));

// ---- BearerSession ----

describe('BearerSession', () => {
  it('sets the Authorization: Bearer *** header', () => {
    const s = new BearerSession('tok_abc123');
    const headers = new Headers();
    s.applyHeaders(headers);
    expect(headers.get('Authorization')).toBe('Bearer tok_abc123');
  });

  it('appends the token to the socket auth payload as { auth: { token } }', () => {
    const s = new BearerSession('tok_xyz');
    const payload = s.applySocketAuth({ existing: 'value' });
    expect(payload).toEqual({ existing: 'value', auth: { token: 'tok_xyz' } });
  });

  it('does not mutate the original socket-auth payload', () => {
    const s = new BearerSession('t');
    const original = { foo: 1 };
    s.applySocketAuth(original);
    expect(original).toEqual({ foo: 1 });
  });

  it('reports kind as "bearer"', () => {
    expect(new BearerSession('x').kind).toBe('bearer');
  });

  it('never reports as expired (bearer tokens are valid until revoked)', () => {
    expect(new BearerSession('x').isExpired()).toBe(false);
  });

  it('overwrites any pre-existing Authorization header', () => {
    const s = new BearerSession('new');
    const headers = new Headers({ Authorization: 'Bearer old' });
    s.applyHeaders(headers);
    expect(headers.get('Authorization')).toBe('Bearer new');
  });
});

// ---- PasswordSession (pure bits) ----

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

  it('does not include a token in socket auth until a token is provided', () => {
    const s = new PasswordSession('quavon', 'pw', '', stubLogin);
    const payload = s.applySocketAuth({});
    expect(payload).toEqual({});
  });

  it('reports isExpired() = true before any token is set', () => {
    const s = new PasswordSession('u', 'p', '', stubLogin);
    expect(s.isExpired()).toBe(true);
  });

  it('uses the JWT exp claim to compute isExpired()', async () => {
    // Build a JWT with exp = now + 3600s
    const expSec = Math.floor(Date.now() / 1000) + 3600;
    const fakeJwt = makeJwt({ sub: 'quavon', exp: expSec });
    const loginFn: SocketLoginFn = async () => fakeJwt;
    const s = new PasswordSession('quavon', 'pw', '', loginFn);
    await s.refresh!();
    const headers = new Headers();
    s.applyHeaders(headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${fakeJwt}`);
    // Not expired (well before the 30s early-refresh window).
    expect(s.isExpired()).toBe(false);
  });

  it('reports isExpired() = true after the JWT exp passes', async () => {
    // Build a JWT that already expired 60s ago
    const expSec = Math.floor(Date.now() / 1000) - 60;
    const fakeJwt = makeJwt({ sub: 'quavon', exp: expSec });
    const loginFn: SocketLoginFn = async () => fakeJwt;
    const s = new PasswordSession('quavon', 'pw', '', loginFn);
    await s.refresh!();
    // 30s early-refresh window means anything past exp is expired.
    expect(s.isExpired()).toBe(true);
  });

  it('throws when the login function rejects', async () => {
    const loginFn: SocketLoginFn = async () => {
      throw new Error('socket disconnected');
    };
    const s = new PasswordSession('u', 'p', '', loginFn);
    await expect(s.refresh!()).rejects.toThrow(/socket disconnected/);
  });

  it('throws when the login function returns no token', async () => {
    const loginFn: SocketLoginFn = async () => '';
    const s = new PasswordSession('u', 'p', '', loginFn);
    await expect(s.refresh!()).rejects.toThrow(/no token/);
  });
});

// ---- createSession factory ----

describe('createSession', () => {
  it('creates a BearerSession for kind: bearer', () => {
    const s = createSession({ kind: 'bearer', token: 't' }, 'https://x', stubLogin);
    expect(s.kind).toBe('bearer');
  });

  it('creates a PasswordSession for kind: password', () => {
    const s = createSession(
      { kind: 'password', username: 'u', password: 'p' },
      'https://x',
      stubLogin
    );
    expect(s.kind).toBe('password');
  });

  it('respects the discriminated union exhaustively', () => {
    const strategies: AuthStrategy[] = [
      { kind: 'bearer', token: 'a' },
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
