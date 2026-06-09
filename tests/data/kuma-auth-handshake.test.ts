/**
 * Regression test for the Kuma auth handshake.
 *
 * Background: the app used to put the bearer token in the
 * socket.io handshake `auth` payload (`io(url, { auth: { token } })`).
 * That's the socket.io v4 idiom for token auth, but Kuma 2.x
 * doesn't read from there. Kuma sends a `loginRequired` event after
 * the initial `info` and expects the client to reply with
 * `socket.emit('loginByToken', token, callback)`. The previous code
 * ignored `loginRequired`, so Kuma never authenticated the session
 * and the connection sat idle (no `info` with `version`, no
 * `monitorList`).
 *
 * Fixed in src/data/socket/client.ts and src/data/api/client.ts:
 * both now register a `loginRequired` handler that emits
 * `loginByToken` with `session.currentToken`.
 *
 * This test guards the contract by grepping the source files for
 * the required pieces. We don't mount the socket (no real Kuma in
 * CI), but the import-and-grep pattern is enough to catch a
 * refactor that removes the handler or sends the wrong event name.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('Kuma auth handshake — emits loginByToken on loginRequired', () => {
  describe('src/data/socket/client.ts (live KumaSocket)', () => {
    const source = readSrc('src/data/socket/client.ts');

    it('registers a loginRequired handler', () => {
      // Match `socket.on('loginRequired', ...)` or `socket.once(...)`.
      // We don't want a `socket.emit('loginRequired')` (which would
      // mean WE are sending the event) — only a listener.
      expect(source).toMatch(
        /this\.socket\.on\(\s*['"]loginRequired['"]\s*,/,
      );
    });

    it('emits loginByToken with the session token', () => {
      // The handler must call `socket.emit('loginByToken', token, cb)`.
      expect(source).toMatch(
        /this\.socket\.emit\(\s*['"]loginByToken['"]\s*,\s*[^,)]+/,
      );
    });

    it('reads the token from session.currentToken', () => {
      // We want the token to come from the session abstraction, not
      // from a hardcoded constant. This makes both bearer and
      // password sessions work uniformly.
      expect(source).toMatch(/this\.session\.currentToken/);
    });
  });

  describe('src/data/api/client.ts (test-connection ping)', () => {
    const source = readSrc('src/data/api/client.ts');

    it('registers a loginRequired handler in pingOverSocket', () => {
      expect(source).toMatch(
        /socket\.once\(\s*['"]loginRequired['"]\s*,\s*\(\)\s*=>/,
      );
    });

    it('emits loginByToken with session.currentToken', () => {
      // The handler should use the session's currentToken — not
      // re-derive the token from the auth payload.
      expect(source).toMatch(
        /socket\.emit\(\s*['"]loginByToken['"]\s*,\s*[^,)]+/,
      );
      expect(source).toMatch(/this\.session\.currentToken/);
    });

    it('does not reject password auth in ping (regression: c9f1... was password-only-stub)', () => {
      // The old code short-circuited with "Password-based test
      // connection is not yet supported in ping()". That message
      // must be gone — both kinds now work via loginByToken.
      expect(source).not.toMatch(/Password-based test connection is not yet supported/);
    });
  });

  describe('src/data/api/auth.ts (session contract)', () => {
    const source = readSrc('src/data/api/auth.ts');

    it('exposes currentToken on both BearerSession and PasswordSession', () => {
      // BearerSession needs a getter (token is private).
      expect(source).toMatch(/class BearerSession[\s\S]*?get currentToken/);
      // PasswordSession already had it; guard against accidental removal.
      expect(source).toMatch(/class PasswordSession[\s\S]*?get currentToken/);
    });

    it('declares currentToken on the AuthSession interface', () => {
      // Forces both classes to implement it (TS will fail to compile
      // if either misses the getter).
      expect(source).toMatch(/interface AuthSession[\s\S]*?readonly currentToken: string/);
    });
  });
});
