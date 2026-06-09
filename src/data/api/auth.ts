/**
 * Auth strategies for Kuma.
 *
 * Two strategies are supported:
 * - bearer: a long-lived API token (Kuma 2.0+) - preferred
 * - password: username + password (Kuma 1.x or user preference)
 *
 * ## Kuma 2.3+ API note
 *
 * As of Kuma 2.3, the REST API (`POST /api/login`) was removed. Login
 * happens exclusively over socket.io via `socket.emit('login', {...}, cb)`.
 * The JWT returned by that callback is the bearer token used in all
 * subsequent socket + REST requests.
 *
 * This means:
 *   - `BearerSession` is simple — it just wraps a long-lived token.
 *   - `PasswordSession` is also simple — it just wraps the JWT we got
 *     from socket login. Re-issuing the JWT (e.g. after expiry) is the
 *     job of the `KumaConnectionManager`, which owns the socket.
 *   - The `AuthSession.refresh()` method is provided as a hook for
 *     callers that want a "is this still good?" check. For
 *     `PasswordSession` it triggers a re-login via the supplied socket
 *     login function.
 *
 * Each session knows how to:
 *   - add auth headers to a fetch request
 *   - build the socket.io auth payload
 *   - detect (and optionally refresh) expiry
 */

import type { AuthStrategy } from '@/domain/models';

export interface AuthSession {
  /** Apply auth headers to a fetch request */
  applyHeaders(headers: Headers): void;

  /** Apply auth payload to a socket.io connection */
  applySocketAuth(payload: Record<string, unknown>): Record<string, unknown>;

  /** Whether the session has expired and needs refresh */
  isExpired(): boolean;

  /**
   * Refresh the session if possible.
   * For bearer sessions: throws (you need a new API key).
   * For password sessions: re-issues a JWT via the supplied login function.
   */
  refresh?(): Promise<void>;

  /** Strategy kind for debugging */
  readonly kind: 'bearer' | 'password';
}

export class BearerSession implements AuthSession {
  readonly kind = 'bearer' as const;
  constructor(private token: string) {}

  applyHeaders(headers: Headers): void {
    headers.set('Authorization', `Bearer ${this.token}`);
  }

  applySocketAuth(payload: Record<string, unknown>): Record<string, unknown> {
    return { ...payload, auth: { token: this.token } };
  }

  isExpired(): boolean {
    return false; // Bearer tokens are valid until revoked
  }
}

export type SocketLoginFn = (username: string, password: string) => Promise<string>;

/**
 * Password-based session.
 *
 * Holds a JWT obtained from socket login. The `refresh()` method uses
 * the supplied `loginFn` to re-issue the JWT — this is invoked by
 * `KumaConnectionManager` whenever the JWT's `exp` claim gets close.
 *
 * The JWT decode is done once on construction (or refresh) and the
 * expiry is cached. We don't re-decode on every `isExpired()` call.
 */
export class PasswordSession implements AuthSession {
  readonly kind = 'password' as const;
  private token: string;
  private tokenExpiresAt: number | null;

  constructor(
    private username: string,
    private password: string,
    initialToken: string,
    private loginFn: SocketLoginFn
  ) {
    this.token = initialToken;
    this.tokenExpiresAt = decodeJwtExpiry(initialToken);
  }

  async refresh(): Promise<void> {
    const newToken = await this.loginFn(this.username, this.password);
    if (!newToken) throw new Error('Login returned no token');
    this.token = newToken;
    this.tokenExpiresAt = decodeJwtExpiry(newToken);
  }

  applyHeaders(headers: Headers): void {
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
  }

  applySocketAuth(payload: Record<string, unknown>): Record<string, unknown> {
    if (this.token) {
      return { ...payload, auth: { token: this.token } };
    }
    return payload;
  }

  isExpired(): boolean {
    if (!this.tokenExpiresAt) return true;
    return Date.now() > this.tokenExpiresAt - 30_000; // refresh 30s early
  }

  /** Current JWT — for tests and debugging. */
  get currentToken(): string {
    return this.token;
  }
}

/**
 * Decode a JWT's `exp` claim without verifying the signature.
 * Returns the expiry as milliseconds-since-epoch, or null if not
 * parseable. Used to drive `isExpired()` for password-based sessions.
 */
export function decodeJwtExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      base64UrlDecode(parts[1])
    );
    if (typeof payload.exp === 'number') {
      return payload.exp * 1000;
    }
  } catch {
    return null;
  }
  return null;
}

function base64UrlDecode(s: string): string {
  // Buffer is available in Node + React Native
  // (and Hermes polyfills atob; we use Buffer here for tests + parity).
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf8');
  }
  // Fallback: global atob (browser / older RN)
  return atob(padded);
}

/**
 * Factory: build a session for the given strategy.
 *
 * For `bearer`, this is straightforward — wrap the token.
 * For `password`, this is a **deferred login**: the returned session
 * exposes `login()` which must be awaited to get the actual JWT. We
 * do this so the manager can build the socket first, then log in
 * through it (since Kuma 2.3+ has no REST login endpoint).
 */
export function createSession(
  strategy: AuthStrategy,
  baseUrl: string,
  loginFn: SocketLoginFn,
  initialToken?: string
): AuthSession {
  switch (strategy.kind) {
    case 'bearer':
      return new BearerSession(strategy.token);
    case 'password':
      return new PasswordSession(
        strategy.username,
        strategy.password,
        initialToken ?? '',
        loginFn
      );
  }
}

/**
 * Async factory — preferred. Logs in via the supplied function first,
 * then returns a fully-armed PasswordSession.
 */
export async function createSessionAsync(
  strategy: AuthStrategy,
  baseUrl: string,
  loginFn: SocketLoginFn
): Promise<AuthSession> {
  switch (strategy.kind) {
    case 'bearer':
      return new BearerSession(strategy.token);
    case 'password': {
      const token = await loginFn(strategy.username, strategy.password);
      return new PasswordSession(strategy.username, strategy.password, token, loginFn);
    }
  }
}
