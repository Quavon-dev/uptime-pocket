/**
 * Regression test for the Kuma auth handshake.
 *
 * Background: Kuma 2.x doesn't read the bearer token from the
 * socket.io handshake `auth` payload. It sends a `loginRequired`
 * event after the initial `info` and expects the client to reply
 * via `socket.emit('loginByToken', token, cb)` (for an existing
 * JWT) or `socket.emit('login', {username, password}, cb)` (for
 * a fresh password login that returns a JWT).
 *
 * ## v0.8.1 design
 *
 * The session owns the JWT lifecycle. The socket layer doesn't
 * know about credentials — it just calls `session.authenticate(socket)`
 * on `loginRequired`, and the session handles the
 * `loginByToken` → `login` fallback internally.
 *
 * ## What this test guards
 *
 * The test reads the source files and asserts the required pieces
 * are present (import-and-grep). We don't mount a real socket (no
 * Kuma in CI), but the pattern is enough to catch a refactor that
 * removes the handler, sends the wrong event name, or moves the
 * auth handshake out of the session.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('Kuma auth handshake — session owns the JWT lifecycle', () => {
  describe('src/data/api/auth.ts (session contract)', () => {
    const source = readSrc('src/data/api/auth.ts');

    it('declares an authenticate() method on the AuthSession interface', () => {
      // The socket layer calls session.authenticate(this.socket) on
      // loginRequired. If this method disappears, the socket layer
      // has no way to log in.
      expect(source).toMatch(
        /interface AuthSession[\s\S]*?authenticate\s*\(/,
      );
    });

    it('has a PasswordSession that implements authenticate()', () => {
      // The concrete session class must override authenticate().
      // We grep for the method signature to catch accidental removal.
      expect(source).toMatch(
        /class PasswordSession[\s\S]*?authenticate\s*\(/,
      );
    });

    it('caches a JWT after a successful login', () => {
      // The session must store the token Kuma returns so subsequent
      // authenticate() calls can use loginByToken instead of
      // re-prompting for the password.
      expect(source).toMatch(/this\.token\s*=\s*ack\.token/);
    });

    it('tries loginByToken first when a cached JWT is available', () => {
      // The whole point of caching the JWT: on reconnects we can
      // skip the password round trip.
      expect(source).toMatch(
        /if\s*\(\s*this\.token\s*&&\s*!\s*this\.isExpired\(\)\s*\)/,
      );
      expect(source).toMatch(
        /emitWithAck[\s\S]*?'loginByToken'/,
      );
    });

    it('falls back to login when loginByToken is rejected', () => {
      // Kuma rejects the cached JWT if the password changed
      // (authInvalidToken). The session must then re-emit `login`.
      expect(source).toMatch(/authInvalidToken|loginByToken/);
      // And re-`login` as the fallback.
      expect(source).toMatch(/emitWithAck[\s\S]*?'login'/);
    });

    it('does NOT export BearerSession (regression: was removed in v0.8)', () => {
      // Kuma 2.x's socket.io auth only accepts JWTs, not API keys.
      // BearerSession was removed so the UI can't offer an option
      // that just hangs the connection on authInvalidToken.
      expect(source).not.toMatch(/export class BearerSession/);
    });

    it('does NOT export SocketLoginFn (regression: was removed in v0.8.1)', () => {
      // The old API took a SocketLoginFn in the constructor. The
      // new API has authenticate(socket) instead. If this type
      // comes back, someone is re-introducing the old plumbing.
      expect(source).not.toMatch(/export type SocketLoginFn/);
    });
  });

  describe('src/data/socket/client.ts (live KumaSocket)', () => {
    const source = readSrc('src/data/socket/client.ts');

    it('registers a loginRequired handler', () => {
      // The socket must listen for `loginRequired` and respond —
      // otherwise Kuma never sees a login and the connection hangs.
      expect(source).toMatch(
        /this\.socket\.on\(\s*['"]loginRequired['"]\s*,/,
      );
    });

    it('delegates the auth round-trip to session.authenticate()', () => {
      // The socket layer should NOT be calling `emit('loginByToken', ...)`
      // or `emit('login', ...)` directly — that's the session's job.
      // The actual call site breaks across lines, so the regex
      // tolerates whitespace including newlines.
      expect(source).toMatch(/this\.session[\s\S]*?\.authenticate\s*\(/);
      expect(source).not.toMatch(/this\.socket\.emit\(\s*['"]loginByToken['"]/);
      expect(source).not.toMatch(/this\.socket\.emit\(\s*['"]login['"]/);
    });

    it('does NOT export buildSocketLogin (regression: was removed in v0.8.1)', () => {
      // The old flow built a SocketLoginFn bound to a raw socket in
      // the manager. The new flow has the session do the auth
      // directly, so buildSocketLogin is gone.
      expect(source).not.toMatch(/export function buildSocketLogin/);
    });
  });

  describe('src/data/api/client.ts (test-connection ping)', () => {
    const source = readSrc('src/data/api/client.ts');

    it('registers a loginRequired handler in pingOverSocket', () => {
      // The probe path also listens for loginRequired, so the
      // session can authenticate on the transient socket.
      expect(source).toMatch(
        /socket\.once\(\s*['"]loginRequired['"]\s*,\s*\(\)\s*=>/,
      );
    });

    it('delegates to session.authenticate() (not direct emit)', () => {
      // Same as the live socket: the probe must not be doing the
      // auth itself, it must delegate to the session. The actual
      // call site breaks across lines, so the regex tolerates
      // whitespace including newlines.
      expect(source).toMatch(/this\.session[\s\S]*?\.authenticate\s*\(/);
      expect(source).not.toMatch(/socket\.emit\(\s*['"]loginByToken['"]/);
    });
  });

  describe('src/data/connection/manager.ts (orchestrator)', () => {
    const source = readSrc('src/data/connection/manager.ts');

    it('does NOT open a throwaway raw socket for the login handshake', () => {
      // The v0.8.0 manager opened a throwaway socket just to do
      // the login round trip and extract a JWT. v0.8.1 lets the
      // KumaSocket handle auth on the live socket — no throwaway.
      expect(source).not.toMatch(/openRawSocket/);
    });

    it('does NOT splice a JWT into the session via private fields', () => {
      // v0.8.0 reached into the session as `as unknown as { token: string }`
      // to inject the JWT. v0.8.1 has the session cache its own JWT.
      expect(source).not.toMatch(/as unknown as[\s\S]*?token/);
    });
  });
});
