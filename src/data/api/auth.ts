/**
 * Auth session for Kuma.
 *
 * One strategy is supported: password (username + password). On the
 * first connect the app does a socket.io `login` to get a JWT, then
 * stores it in the session for subsequent reconnects.
 *
 * ## Why no API-key / "bearer" mode?
 *
 * Kuma 2.x has TWO different "tokens":
 *   - **API Key** — created in the Kuma dashboard at Settings →
 *     API Keys. Format `uk{id}_{nanoid40}`. Works for HTTP Basic
 *     auth on the REST API only.
 *   - **JWT** — returned by `socket.emit('login', {...})` (or
 *     `loginByToken` on a subsequent reconnect). Format
 *     `eyJ.eyJ.signature`. Works for both socket.io and REST.
 *
 * The socket.io `loginByToken` event Kuma 2.x uses for socket
 * auth **only accepts JWTs**, not API keys. So if the user pastes
 * an API key into a "bearer token" field, the app's `loginByToken`
 * gets rejected with `authInvalidToken` and the connection hangs.
 *
 * To keep the UX simple, we removed the bearer form option: the
 * user always signs in with username+password, the app stores the
 * resulting JWT in the session, and reconnects via `loginByToken`
 * with that JWT. The JWT is long-lived (Kuma's default is 1 year
 * unless `jwt: maxExpiresIn` is set shorter), so the user only
 * has to type their password once per install.
 *
 * If you ever need to support API keys in the future, the right
 * path is to do HTTP Basic auth on a REST endpoint (Kuma exposes
 * a few) to validate the key, then surface a "this key works for
 * REST but you also need a password for real-time" message. For
 * v1 we keep the form simple.
 *
 * Each session knows how to:
 *   - add auth headers to a fetch request
 *   - detect (and optionally refresh) JWT expiry
 *   - expose its current JWT so the socket can `loginByToken` it
 */

import type { AuthStrategy } from '@/domain/models';

export interface AuthSession {
  /** Apply auth headers to a fetch request */
  applyHeaders(headers: Headers): void;

  /** Whether the session has expired and needs refresh */
  isExpired(): boolean;

  /**
   * Re-issue the JWT via the supplied login function. Invoked by
   * `KumaConnectionManager` when the JWT's `exp` claim gets close
   * (or on the first connection when the session was built with a
   * placeholder token).
   */
  refresh(): Promise<void>;

  /** Strategy kind for debugging */
  readonly kind: 'password';

  /**
   * The current JWT to send in Kuma's `loginByToken` socket event.
   * The socket client reads this in its `loginRequired` handler.
   * May be an empty string before the first successful login.
   */
  readonly currentToken: string;
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
 * For `password`, this is a **deferred login**: the returned session
 * has an empty `currentToken` until `refresh()` succeeds. We do
 * this so the manager can build the socket first, then log in
 * through it (Kuma 2.3+ has no REST login endpoint).
 *
 * For convenience, real callers should use `createSessionAsync`
 * which awaits the login before returning.
 */
export function createSession(
  strategy: AuthStrategy,
  _baseUrl: string,
  loginFn: SocketLoginFn
): AuthSession {
  return createPasswordSessionSync(strategy.username, strategy.password, loginFn);
}

/**
 * Synchronous session builder — returns a session that has not yet
 * logged in. `applyHeaders` will be a no-op until `refresh()` runs.
 * The refresh will fail loudly if the caller hasn't provided a
 * working loginFn.
 */
function createPasswordSessionSync(
  username: string,
  password: string,
  loginFn: SocketLoginFn
): PasswordSession {
  // Start with a sentinel empty token; the first refresh() will replace it.
  return new PasswordSession(username, password, '', loginFn);
}

/**
 * Async factory — preferred. Logs in via the supplied function first,
 * then returns a fully-armed PasswordSession.
 */
export async function createSessionAsync(
  strategy: AuthStrategy,
  _baseUrl: string,
  loginFn: SocketLoginFn
): Promise<AuthSession> {
  const token = await loginFn(strategy.username, strategy.password);
  return new PasswordSession(strategy.username, strategy.password, token, loginFn);
}
