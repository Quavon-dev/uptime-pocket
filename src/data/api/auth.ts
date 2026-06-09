/**
 * Auth session for Kuma.
 *
 * One strategy is supported: password (username + password). The
 * session is the **owner of the JWT lifecycle** — it knows how to
 * authenticate against a socket (doing `login` on first call,
 * `loginByToken` on subsequent calls) and exposes the cached JWT to
 * REST callers for the `Authorization: Bearer *** header.
 *
 * ## Flow
 *
 * 1. Caller builds a `PasswordSession(username, password)`.
 * 2. Caller calls `await session.authenticate(socket)`. On the first
 *    call this emits `login` over the socket and caches the JWT
 *    Kuma returns. On subsequent calls it tries `loginByToken` with
 *    the cached JWT first; if Kuma says `authInvalidToken` (password
 *    changed, etc.) it falls back to `login` and re-caches.
 * 3. After authenticate succeeds, REST callers can use
 *    `session.applyHeaders(headers)` to add the JWT to outgoing
 *    requests, and the KumaSocket can call `authenticate()` again on
 *    any reconnect.
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
 * The socket.io `loginByToken` event Kuma 2.x uses for socket auth
 * **only accepts JWTs**, not API keys. So if the user pastes an API
 * key into a "bearer token" field, the app's `loginByToken` gets
 * rejected with `authInvalidToken` and the connection hangs. To keep
 * the UX simple, we removed the bearer form option: the user always
 * signs in with username+password.
 *
 * If you ever need to support API keys in the future, the right
 * path is to do HTTP Basic auth on a REST endpoint (Kuma exposes
 * a few) to validate the key, then surface a "this key works for
 * REST but you also need a password for real-time" message. For v1
 * we keep the form simple.
 */

import type { AuthStrategy } from '@/domain/models';

/**
 * The minimum socket shape `authenticate()` needs from socket.io.
 * We type it as a structural interface so we can mock it in tests
 * with a plain object (no need to drag in the real `socket.io-client`
 * `Socket` type which has dozens of methods we don't use).
 */
export interface AuthenticatableSocket {
  emit(event: string, ...args: unknown[]): unknown;
}

export interface AuthSession {
  /** Strategy kind for debugging */
  readonly kind: 'password';

  /**
   * Authenticate against the given socket.io connection. Must be
   * called AFTER the socket has emitted `connect` and `loginRequired`
   * (or proactively, before any request, on a fresh socket). The
   * session handles `loginByToken` → `login` fallback internally and
   * caches the resulting JWT for subsequent calls.
   *
   * Throws if authentication ultimately fails.
   */
  authenticate(socket: AuthenticatableSocket): Promise<void>;

  /**
   * Apply the cached JWT as `Authorization: Bearer *** to a fetch
   * Headers object. No-op if no JWT is cached yet. Used by the REST
   * client to authenticate HTTP calls between socket reconnects.
   */
  applyHeaders(headers: Headers): void;

  /**
   * Whether the cached JWT is past its `exp` claim (with a 30s
   * grace window so we re-login before Kuma actually rejects us).
   * Returns true if no JWT is cached yet.
   */
  isExpired(): boolean;
}

/**
 * Ack callback shape Kuma uses: `{ ok: true, token?: string }` on
 * success, `{ ok: false, msg: 'authInvalidToken', msgi18n: true }`
 * on failure.
 */
interface KumaAuthAck {
  ok: boolean;
  token?: string;
  msg?: string;
}

/**
 * Password-based session.
 *
 * Holds the username + password, plus an optional cached JWT
 * obtained from a previous `authenticate()` call. The session is the
 * only place that knows the password — the socket and REST layers
 * just see a JWT once auth has succeeded.
 */
export class PasswordSession implements AuthSession {
  readonly kind = 'password' as const;
  private token: string | null = null;
  private tokenExpiresAt: number | null = null;
  private inflightAuth: Promise<void> | null = null;

  constructor(
    private readonly username: string,
    private readonly password: string
  ) {}

  /**
   * Authenticate against `socket`:
   *   1. If we have a non-expired cached JWT, try `loginByToken`
   *      first. Kuma responds with `{ ok: true }` on success.
   *   2. If that fails (no token cached, or Kuma returns
   *      `authInvalidToken` because the password changed), emit
   *      `login` with the username + password. Kuma responds with
   *      `{ ok: true, token: '<jwt>' }`. Cache the new JWT.
   *
   * Concurrent calls are de-duplicated: if two callers race
   * authenticate() they share the same underlying `login` round
   * trip rather than each firing one.
   *
   * Throws on auth failure (so the caller can surface the error to
   * the user with the original Kuma error message).
   */
  authenticate(socket: AuthenticatableSocket): Promise<void> {
    if (this.inflightAuth) {
      return this.inflightAuth;
    }
    this.inflightAuth = this.doAuthenticate(socket).finally(() => {
      this.inflightAuth = null;
    });
    return this.inflightAuth;
  }

  private async doAuthenticate(socket: AuthenticatableSocket): Promise<void> {
    // Try loginByToken first if we have a cached token and it's not
    // past its expiry. Kuma's verify call also re-checks against
    // the user's current password hash, so a token issued before a
    // password change will be rejected with authInvalidToken.
    if (this.token && !this.isExpired()) {
      try {
        const ack = await this.emitWithAck<KumaAuthAck>(
          socket,
          'loginByToken',
          this.token
        );
        if (ack?.ok) {
          return;
        }
        // Ack said no — clear the cached token and fall through to
        // the password login below.
        this.token = null;
        this.tokenExpiresAt = null;
      } catch {
        // The socket itself errored (timeout, disconnect, etc.).
        // Surface that error to the caller rather than silently
        // retrying with a password that may also fail.
        throw new Error('Kuma rejected the cached JWT and the socket errored during loginByToken');
      }
    }

    // No cached token, or the cached one was rejected. Do the full
    // username + password login. Kuma returns `{ ok: true, token }`
    // on success or `{ ok: false, msg }` on failure.
    const ack = await this.emitWithAck<KumaAuthAck>(socket, 'login', {
      username: this.username,
      password: this.password,
    });
    if (!ack?.ok || typeof ack.token !== 'string') {
      throw new Error(
        'Kuma login failed: ' +
          (ack?.msg ? `${ack.msg}` : 'no token in response')
      );
    }
    this.token = ack.token;
    this.tokenExpiresAt = decodeJwtExpiry(ack.token);
  }

  /**
   * Wrap socket.io's callback-ack pattern in a Promise. The last
   * argument to `emit` is the ack callback; everything before it is
   * the event payload.
   */
  private emitWithAck<T>(
    socket: AuthenticatableSocket,
    event: string,
    ...args: unknown[]
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${event} timed out after 10s — Kuma did not acknowledge`));
      }, 10_000);
      const cb = (res: T) => {
        clearTimeout(timer);
        resolve(res);
      };
      socket.emit(event, ...args, cb);
    });
  }

  applyHeaders(headers: Headers): void {
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
  }

  isExpired(): boolean {
    if (!this.tokenExpiresAt) return true;
    // Refresh 30s early so we re-login before Kuma actually rejects
    // a request with the stale token.
    return Date.now() > this.tokenExpiresAt - 30_000;
  }

  /**
   * Clear the cached JWT. Called by the connection manager on
   * `authInvalidToken` so the next authenticate() will fall back to
   * the full password login. Mostly useful for tests and explicit
   * "force re-login" UI affordances.
   */
  reset(): void {
    this.token = null;
    this.tokenExpiresAt = null;
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
 * For `password`, this is a fresh `PasswordSession` with no cached
 * JWT — the first `authenticate()` call will do the full
 * username + password login against Kuma.
 */
export function createSession(strategy: AuthStrategy): AuthSession {
  return new PasswordSession(strategy.username, strategy.password);
}
