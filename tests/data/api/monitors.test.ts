/**
 * Tests for the monitor write API (`KumaMonitorWriter`).
 *
 * Strategy: use a real EventEmitter to simulate a socket.io socket,
 * so we exercise the actual emit-with-callback + sanitization logic
 * without jest.mock. The Kuma 2.3.2 quirk handling (empty `tags`,
 * `follow_redirect*` stripping) is the most important behavior to
 * pin down — these tests are the regression guard.
 */

import { EventEmitter } from 'events';
import { KumaMonitorWriter } from '@/data/api/monitors';
import type { MonitorDraft } from '@/data/api/monitors';

/**
 * Fake socket that records every emit and lets the test fire the
 * callback synchronously with a chosen response shape.
 */
class FakeSocket extends EventEmitter {
  public lastEmit: { event: string; args: unknown[] } | null = null;
  public autoRespondWith: unknown = { ok: true, monitorID: 42 };

  emit(event: string, ...args: unknown[]): boolean {
    this.lastEmit = { event, args };
    // Auto-invoke the callback (the last arg if it's a function).
    const cb = args[args.length - 1];
    if (typeof cb === 'function') {
      // The real emit is `emit(event, payload, cb)`, so we pass the
      // auto-respond value to the cb.
      (cb as (res: unknown) => void)(this.autoRespondWith);
    }
    return true;
  }
}

function makeWriter() {
  const sock = new FakeSocket();
  const writer = new KumaMonitorWriter(sock as any);
  return { writer, sock };
}

describe('KumaMonitorWriter', () => {
  // ---- add() -----------------------------------------------------------

  describe('add()', () => {
    it('emits an "add" event with the draft + callback', async () => {
      const { writer, sock } = makeWriter();
      const draft: MonitorDraft = {
        name: 'My Monitor',
        type: 'http',
        url: 'https://example.com',
        method: 'GET',
        interval: 60,
        retryInterval: 60,
        maxretries: 0,
      };
      sock.autoRespondWith = { ok: true, monitorID: 7 };
      const result = await writer.add(draft);
      expect(sock.lastEmit?.event).toBe('add');
      expect(result.ok).toBe(true);
      expect(result.monitorID).toBe(7);
    });

    // Kuma 2.3.2 SQL-bug guards — these are the load-bearing tests.
    it('strips empty `tags: []` (Kuma 2.3.2 SQL bug)', async () => {
      const { writer, sock } = makeWriter();
      await writer.add({
        name: 'X',
        type: 'http',
        url: 'https://x.com',
        tags: [], // <-- the problematic empty array
      });
      const sentDraft = sock.lastEmit!.args[0] as Record<string, unknown>;
      expect('tags' in sentDraft).toBe(false);
    });

    it('strips `follow_redirect: true` (Kuma 2.3.2 unknown column)', async () => {
      const { writer, sock } = makeWriter();
      await writer.add({
        name: 'X',
        type: 'http',
        url: 'https://x.com',
        follow_redirect: true,
      });
      const sentDraft = sock.lastEmit!.args[0] as Record<string, unknown>;
      expect('follow_redirect' in sentDraft).toBe(false);
    });

    it('strips `follow_redirects: true` (Kuma 2.3.2 unknown column)', async () => {
      const { writer, sock } = makeWriter();
      await writer.add({
        name: 'X',
        type: 'http',
        url: 'https://x.com',
        follow_redirects: true,
      });
      const sentDraft = sock.lastEmit!.args[0] as Record<string, unknown>;
      expect('follow_redirects' in sentDraft).toBe(false);
    });

    it('preserves non-empty `tags`', async () => {
      const { writer, sock } = makeWriter();
      await writer.add({
        name: 'X',
        type: 'http',
        url: 'https://x.com',
        tags: { '1': true, '2': true },
      });
      const sentDraft = sock.lastEmit!.args[0] as Record<string, unknown>;
      expect(sentDraft.tags).toEqual({ '1': true, '2': true });
    });

    it('preserves all other draft fields', async () => {
      const { writer, sock } = makeWriter();
      await writer.add({
        name: 'Full',
        type: 'http',
        url: 'https://example.com',
        method: 'POST',
        interval: 120,
        retryInterval: 30,
        maxretries: 3,
        accepted_statuscodes: ['200-299'],
        maxredirects: 5,
        ignoreTls: true,
      });
      const sentDraft = sock.lastEmit!.args[0] as Record<string, unknown>;
      expect(sentDraft.name).toBe('Full');
      expect(sentDraft.method).toBe('POST');
      expect(sentDraft.interval).toBe(120);
      expect(sentDraft.maxretries).toBe(3);
      expect(sentDraft.accepted_statuscodes).toEqual(['200-299']);
      expect(sentDraft.maxredirects).toBe(5);
      expect(sentDraft.ignoreTls).toBe(true);
    });

    // Kuma 2.3.2 second bug: non-HTTP types crash on `add` with
    // "Cannot read properties of undefined (reading 'every')" if
    // `accepted_statuscodes` is missing. We always include it in
    // buildDraft() in add.tsx — this test guards the contract by
    // asserting the field is required to pass through.
    it('passes through accepted_statuscodes for non-HTTP types', async () => {
      const { writer, sock } = makeWriter();
      sock.autoRespondWith = { ok: true, monitorID: 5 };
      await writer.add({
        name: 'Ping',
        type: 'ping',
        hostname: '1.1.1.1',
        accepted_statuscodes: ['200-299'],
        interval: 60, retryInterval: 60, maxretries: 0,
      });
      const sentDraft = sock.lastEmit!.args[0] as Record<string, unknown>;
      expect(sentDraft.accepted_statuscodes).toEqual(['200-299']);
    });

    it('returns the error from Kuma when ok=false', async () => {
      const { writer, sock } = makeWriter();
      sock.autoRespondWith = { ok: false, msg: 'Insert failed' };
      const result = await writer.add({ name: 'X', type: 'http', url: 'https://x' });
      expect(result.ok).toBe(false);
      expect(result.msg).toBe('Insert failed');
    });
  });

  // ---- edit() ----------------------------------------------------------

  describe('edit()', () => {
    it('emits an "editMonitor" event with the full bean', async () => {
      const { writer, sock } = makeWriter();
      sock.autoRespondWith = { ok: true, msg: 'Saved.', monitorID: 8 };
      const fullBean = {
        id: 8,
        type: 'http',
        name: 'Renamed',
        url: 'https://example.com',
        interval: 60,
        retryInterval: 60,
        maxretries: 0,
        active: true,
        // ... 100+ more fields, but we only need to send what's defined
        method: 'GET',
        upsideDown: false,
        parent: null,
        tags: [],
        notificationIDList: {},
      };
      const result = await writer.edit(fullBean as any);
      expect(sock.lastEmit?.event).toBe('editMonitor');
      expect(sock.lastEmit!.args[0]).toBe(fullBean);
      expect(result.ok).toBe(true);
      expect(result.msg).toBe('Saved.');
    });
  });

  // ---- delete() --------------------------------------------------------

  describe('delete()', () => {
    it('emits a "deleteMonitor" event with the id + callback', async () => {
      const { writer, sock } = makeWriter();
      sock.autoRespondWith = { ok: true, msg: 'successDeleted' };
      const result = await writer.delete(7);
      expect(sock.lastEmit?.event).toBe('deleteMonitor');
      expect(sock.lastEmit!.args[0]).toBe(7);
      expect(result.ok).toBe(true);
      expect(result.msg).toBe('successDeleted');
    });
  });

  // ---- get() -----------------------------------------------------------

  describe('get()', () => {
    it('emits a "getMonitor" event and returns the wrapper', async () => {
      const { writer, sock } = makeWriter();
      const monitor = { id: 3, name: 'foo', type: 'http' };
      sock.autoRespondWith = { ok: true, monitor };
      const result = await writer.get(3);
      expect(sock.lastEmit?.event).toBe('getMonitor');
      expect(sock.lastEmit!.args[0]).toBe(3);
      expect(result.ok).toBe(true);
      expect(result.monitor).toEqual(monitor);
    });

    it('handles a missing monitor (monitor: null)', async () => {
      const { writer, sock } = makeWriter();
      sock.autoRespondWith = { ok: true, monitor: null };
      const result = await writer.get(9999);
      expect(result.ok).toBe(true);
      expect(result.monitor).toBeNull();
    });
  });
});
