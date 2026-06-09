/**
 * Tests for the auth strategies.
 *
 * As of v0.8.1 BearerSession is gone (Kuma 2.x's socket.io auth
 * only accepts JWTs, not API keys). The session owns the JWT
 * lifecycle: `authenticate(socket)` does the `loginByToken` →
 * `login` round trip and caches the resulting JWT for subsequent
 * calls. `applyHeaders` puts the cached JWT into REST requests.
 *
 * No mocks for the pure logic of PasswordSession (header
 * construction, isExpired, JWT decode). `authenticate()` is tested
 * with a hand-rolled fake socket that records the `emit` calls and
 * lets us drive the ack callbacks.
 */

import {
  PasswordSession,
  createSession,
  decodeJwtExpiry,
  type AuthenticatableSocket,
} from '@/data/api/auth';

// ---- helpers ----

/**
 * Build a fake socket that records every `emit` call and lets the
 * test drive the ack callback. The last argument to `emit` is the
 * ack — we pull it out and store it in `pendingAcks` keyed by
 * event name so the test can call it with a chosen response.
 */
function makeFakeSocket(): AuthenticatableSocket & {
  /** Calls keyed by event name (most recent at the end). */
  pendingAcks: Map<string, Array<(res: unknown) => void>>;
  /** The args passed to each emit call (without the trailing ack). */
  calls: Array<{ event: string; args: unknown[] }>;
} {
  const pendingAcks = new Map<string, Array<(res: unknown) => void>>();
  const calls: Array<{ event: string; args: unknown[] }> = [];
  return {
    pendingAcks,
    calls,
    emit(event: string, ...args: unknown[]) {
      // The last arg is the ack callback; everything before is the
      // event payload. We strip it out so `calls` records only the
      // real args.
      const ack = args[args.length - 1];
      if (typeof ack === 'function') {
        const arr = pendingAcks.get(event) ?? [];
        arr.push(ack as (res: unknown) => void);
        pendingAcks.set(event, arr);
        calls.push({ event, args: args.slice(0, -1) });
        return;
      }
      // No ack — record all args as-is.
      calls.push({ event, args });
    },
  };
}

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

// ---- PasswordSession ----

describe('PasswordSession', () => {
  it('reports kind as "password"', () => {
    const s = new PasswordSession('quavon', 'secret');
    expect(s.kind).toBe('password');
  });

  it('does not set an Authorization header until a token is cached', () => {
    const s = new PasswordSession('quavon', 'pw');
    const headers = new Headers();
    s.applyHeaders(headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('reports isExpired() = true before any token is cached', () => {
    const s = new PasswordSession('u', 'p');
    expect(s.isExpired()).toBe(true);
  });

  describe('authenticate()', () => {
    it('emits login (not loginByToken) on a fresh session', async () => {
      const sock = makeFakeSocket();
      const s = new PasswordSession('quavon', 'secret');

      const promise = s.authenticate(sock);
      // Drain the ack on the `login` event.
      expect(sock.pendingAcks.has('login')).toBe(true);
      expect(sock.pendingAcks.has('loginByToken')).toBe(false);
      const loginAcks = sock.pendingAcks.get('login')!;
      loginAcks[0]({ ok: true, token: makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }) });

      await promise;
      // The args we sent to login: { username, password }.
      expect(sock.calls[0].args[0]).toEqual({ username: 'quavon', password: 'secret' });
    });

    it('caches the JWT from a successful login', async () => {
      const sock = makeFakeSocket();
      const s = new PasswordSession('quavon', 'pw');
      const fakeJwt = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });

      const promise = s.authenticate(sock);
      sock.pendingAcks.get('login')![0]({ ok: true, token: fakeJwt });
      await promise;

      const headers = new Headers();
      s.applyHeaders(headers);
      expect(headers.get('Authorization')).toBe(`Bearer ${fakeJwt}`);
      expect(s.isExpired()).toBe(false);
    });

    it('emits loginByToken on a subsequent call (token cached, not expired)', async () => {
      const sock1 = makeFakeSocket();
      const sock2 = makeFakeSocket();
      const s = new PasswordSession('quavon', 'pw');
      const fakeJwt = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });

      // First call: login
      const p1 = s.authenticate(sock1);
      sock1.pendingAcks.get('login')![0]({ ok: true, token: fakeJwt });
      await p1;

      // Second call on a new socket: loginByToken with the cached JWT
      const p2 = s.authenticate(sock2);
      expect(sock2.pendingAcks.has('loginByToken')).toBe(true);
      expect(sock2.pendingAcks.has('login')).toBe(false);
      expect(sock2.calls[0].args[0]).toBe(fakeJwt);
      sock2.pendingAcks.get('loginByToken')![0]({ ok: true });
      await p2;
    });

    it('falls back to login when loginByToken is rejected (e.g. password changed)', async () => {
      const sock1 = makeFakeSocket();
      const sock2 = makeFakeSocket();
      const s = new PasswordSession('quavon', 'pw');
      const staleJwt = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
      const freshJwt = makeJwt({ exp: Math.floor(Date.now() / 1000) + 7200 });

      // First call: login → stale JWT
      const p1 = s.authenticate(sock1);
      sock1.pendingAcks.get('login')![0]({ ok: true, token: staleJwt });
      await p1;

      // Second call: loginByToken rejected → fall back to login → fresh JWT.
      // Drive the rejection synchronously, then wait one microtask
      // for the session to schedule the fallback `login` emit before
      // we assert.
      const p2 = s.authenticate(sock2);
      expect(sock2.pendingAcks.has('loginByToken')).toBe(true);
      sock2.pendingAcks.get('loginByToken')![0]({
        ok: false,
        msg: 'authInvalidToken',
        msgi18n: true,
      });
      // Allow the session's rejection handler to schedule the
      // fallback `login` emit.
      await new Promise((r) => setImmediate(r));
      // Now the session should have re-emitted `login` on the same socket.
      expect(sock2.pendingAcks.has('login')).toBe(true);
      sock2.pendingAcks.get('login')![0]({ ok: true, token: freshJwt });
      await p2;

      const headers = new Headers();
      s.applyHeaders(headers);
      expect(headers.get('Authorization')).toBe(`Bearer ${freshJwt}`);
    });

    it('throws when login returns ok:false with a message', async () => {
      const sock = makeFakeSocket();
      const s = new PasswordSession('u', 'p');

      const promise = s.authenticate(sock);
      sock.pendingAcks.get('login')![0]({ ok: false, msg: 'authInvalidToken' });
      await expect(promise).rejects.toThrow(/authInvalidToken/);
    });

    it('throws when login succeeds but returns no token', async () => {
      const sock = makeFakeSocket();
      const s = new PasswordSession('u', 'p');

      const promise = s.authenticate(sock);
      sock.pendingAcks.get('login')![0]({ ok: true });
      await expect(promise).rejects.toThrow(/no token/);
    });

    it('de-duplicates concurrent authenticate() calls', async () => {
      const sock = makeFakeSocket();
      const s = new PasswordSession('u', 'p');
      const fakeJwt = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });

      // Two concurrent calls share the same underlying round-trip.
      const p1 = s.authenticate(sock);
      const p2 = s.authenticate(sock);

      // The first call drives the ack; the second should be observing
      // the same in-flight Promise (no second `login` emit).
      expect(sock.calls.length).toBe(1);
      sock.pendingAcks.get('login')![0]({ ok: true, token: fakeJwt });
      await Promise.all([p1, p2]);

      // Still only one emit happened.
      expect(sock.calls.length).toBe(1);
    });
  });
});

// ---- createSession factory ----

describe('createSession', () => {
  it('creates a PasswordSession for kind: password', () => {
    const s = createSession({ kind: 'password', username: 'u', password: 'p' });
    expect(s.kind).toBe('password');
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
