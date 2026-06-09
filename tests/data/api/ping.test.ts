/**
 * Tests for KumaClient.ping() — the version/connectivity probe.
 *
 * Strategy: stub `globalThis.fetch` to simulate Kuma responses.
 * - On Kuma 2.0–2.2, /api/status returns `{ version: "x.y.z" }` JSON.
 * - On Kuma 2.3+, /api/status returns the SPA HTML at HTTP 200.
 *   The old code's `res.json()` would throw and bubble up as
 *   "Couldn't reach"; the new code falls through to the socket path.
 *
 * The socket path is not unit-tested here (it needs the real
 * `socket.io-client` transport which is hard to stub without a lot
 * of plumbing). It is exercised by the live E2E script
 * `scripts/e2e-ping.js` against the real Kuma.
 */

import { KumaClient } from '@/data/api/client';
import { PasswordSession } from '@/data/api/auth';
import type { Server } from '@/domain/models';

function makeServer(url = 'https://kuma.example.com'): Server {
  return {
    id: 'test',
    name: 'Test',
    url,
    authKind: 'password',
    connected: false,
    notificationMode: 'direct',
    createdAt: new Date(),
  };
}

function makeClient(): KumaClient {
  return new KumaClient(
    makeServer(),
    new PasswordSession('u', 'p', '', () => Promise.reject(new Error('test'))),
  );
}

// ---- Path 1: REST happy path (Kuma 2.0–2.2) --------------------------

describe('KumaClient.ping() — REST path', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns the version when /api/status returns JSON (Kuma 2.0–2.2)', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ version: '2.2.0' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    ) as unknown as typeof fetch;

    const result = await makeClient().ping();
    expect(result.connected).toBe(true);
    expect(result.version).toBe('2.2.0');
    expect(result.error).toBeUndefined();
  });

  it('treats a non-JSON 200 response as "not REST, fall through"', async () => {
    // Kuma 2.3+ returns the SPA HTML with HTTP 200 and content-type: text/html.
    // The new code should not crash, not return connected:true, and
    // not return a JSON parse error. It should fall through to the
    // socket path (which is the canonical 2.3+ check).
    globalThis.fetch = jest.fn(async () =>
      new Response('<!DOCTYPE html><html>...</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    ) as unknown as typeof fetch;

    // The socket path will also fail (no real socket), but the test
    // asserts that we get a structured error rather than a crash.
    const result = await makeClient().ping();
    expect(result.connected).toBe(false);
    // Should not be the old "Could not parse JSON" error; should be
    // something socket-related.
    expect(result.error).toBeDefined();
    expect(result.error).not.toMatch(/JSON/);
  });

  it('returns connected:false with a network error message when fetch throws', async () => {
    // The new code should swallow the fetch error and try the
    // socket path. The socket path will then fail (no real socket),
    // but we should still get a structured error message.
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;

    const result = await makeClient().ping();
    expect(result.connected).toBe(false);
    expect(result.error).toBeDefined();
    // We don't assert the exact message because it depends on the
    // socket.io-client's behavior in the test env, but it should
    // be a non-empty string.
    expect(result.error!.length).toBeGreaterThan(0);
  });

  it('treats a 5xx response as "not REST, fall through" (not as connected)', async () => {
    // Old behavior: 5xx → { connected: false } (correct by accident)
    // New behavior: 5xx → fall through to socket (also correct, since
    // a 5xx on /api/status probably means the API endpoint doesn't exist
    // or is broken, but the socket might still work)
    globalThis.fetch = jest.fn(async () =>
      new Response('Server Error', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      })
    ) as unknown as typeof fetch;

    const result = await makeClient().ping();
    // Will go to socket path, which will fail in unit test env
    // (no real socket server), but the result is structured.
    expect(result.connected).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('handles a 200 with no content-type header gracefully', async () => {
    // Some Kuma proxies strip content-type. We treat that as "not JSON"
    // and fall through to the socket.
    globalThis.fetch = jest.fn(async () =>
      new Response('{"version":"2.1.0"}', { status: 200 })
    ) as unknown as typeof fetch;

    const result = await makeClient().ping();
    // Falls through to socket, which fails in test env.
    expect(result.connected).toBe(false);
    expect(result.error).toBeDefined();
  });
});
