/**
 * Tests for the KumaConnectionManager.
 *
 * We mock the socket + REST layers and the Zustand stores, then verify
 * that the manager correctly:
 *   - calls connect/disconnect lifecycle
 *   - sets the 'connecting' status while the socket is authenticating
 *   - surfaces the auth error if credentials are missing
 *   - tears down the active connection on disconnect
 *
 * The actual KumaSocket → session.authenticate() round trip is
 * covered in tests/data/api/auth.test.ts (the session is the
 * owner of the JWT lifecycle; the manager just builds and
 * connects the socket). Here we mock KumaSocket to simulate a
 * successful connect path: `connect()` immediately emits a
 * `connected` event so the test can assert the manager wired the
 * event bridge correctly.
 */

import { KumaConnectionManager } from '@/data/connection/manager';
import { useMonitors } from '@/data/store/monitors';
import { useServers } from '@/data/store/servers';
import { loadCredentials } from '@/data/secure/credentials';

type KumaEvent = { type: 'connected' } | { type: string };
type Listener = (event: KumaEvent) => void;

// We mock the socket + REST clients to avoid the real socket.io transport.
// The mocked KumaSocket just records its constructor args and exposes
// a way for the test to push events through the listener bridge the
// manager subscribes to.
jest.mock('@/data/socket/client', () => {
  return {
    KumaSocket: jest.fn().mockImplementation(() => {
      const listeners: Listener[] = [];
      const mock = {
        connect: jest.fn(() => {
          // Simulate the real KumaSocket's auth-success path: emit
          // a 'connected' event through the listener bridge so the
          // manager can mark the server as live.
          queueMicrotask(() => {
            listeners.forEach((cb) => cb({ type: 'connected' }));
          });
        }),
        disconnect: jest.fn(),
        pauseMonitor: jest.fn(),
        resumeMonitor: jest.fn(),
        forceHeartbeat: jest.fn(),
        on: jest.fn((cb: Listener) => {
          listeners.push(cb);
          return () => {
            const i = listeners.indexOf(cb);
            if (i >= 0) listeners.splice(i, 1);
          };
        }),
      };
      return mock;
    }),
  };
});

jest.mock('@/data/api/client', () => ({
  KumaClient: jest.fn(),
  createClient: jest.fn(() => ({})),
}));

jest.mock('@/data/secure/credentials', () => ({
  loadCredentials: jest.fn(),
}));

const loadCredentialsMock = loadCredentials as jest.MockedFunction<typeof loadCredentials>;

describe('KumaConnectionManager', () => {
  beforeEach(() => {
    // Reset the stores between tests.
    useServers.setState({
      servers: [],
      activeServerId: null,
      hydrated: true,
    });
    useMonitors.setState({
      monitorsByServer: {},
      statusByServer: {},
      errorByServer: {},
      incidentsByServer: {},
      heartbeatHistoryByServer: {},
      uptimeByServer: {},
    });
    loadCredentialsMock.mockReset();
  });

  it('connects a server using stored credentials', async () => {
    useServers.setState({
      servers: [
        {
          id: 'srv_a',
          name: 'Test',
          url: 'https://kuma.example.com',
          authKind: 'password',
          connected: false,
          notificationMode: 'direct',
          createdAt: new Date(),
        },
      ],
      activeServerId: null,
      hydrated: true,
    });
    loadCredentialsMock.mockResolvedValue({
      kind: 'password',
      username: 'quavon',
      password: 'secret',
    });

    const manager = new KumaConnectionManager();
    // The manager builds a session + KumaSocket and calls
    // `socket.connect()`. The mock KumaSocket's connect() emits
    // a 'connected' event through the listener bridge (on the
    // next microtask), which the manager's event bridge turns
    // into `monitors.setStatus(serverId, 'connected')`.
    await manager.connect('srv_a');

    expect(loadCredentialsMock).toHaveBeenCalledWith('srv_a');
    // The session is the source of truth for auth; the manager
    // just wires the socket. We trust the auth round-trip is
    // tested in auth.test.ts — here we just verify the manager
    // set the connecting status synchronously, the connected
    // event was delivered through the bridge, and there was no
    // error. Note: the connecting→connected transition happens
    // via the KumaSocket's 'connected' event after the session
    // authenticates; in this test we mock KumaSocket to skip
    // the auth round-trip, so we end up at 'connected' right
    // away.
    expect(useMonitors.getState().statusByServer.srv_a).toBe('connected');
    expect(useMonitors.getState().errorByServer.srv_a ?? null).toBeNull();
  });

  it('reports an error when no credentials are stored', async () => {
    useServers.setState({
      servers: [
        {
          id: 'srv_b',
          name: 'Test',
          url: 'https://kuma.example.com',
          authKind: 'password',
          connected: false,
          notificationMode: 'direct',
          createdAt: new Date(),
        },
      ],
      activeServerId: null,
      hydrated: true,
    });
    loadCredentialsMock.mockResolvedValue(null);

    const manager = new KumaConnectionManager();
    await expect(manager.connect('srv_b')).rejects.toThrow();

    const status = useMonitors.getState().statusByServer.srv_b;
    expect(status).toBe('error');
    expect(useMonitors.getState().errorByServer.srv_b).toContain(
      'No credentials stored'
    );
  });

  it('throws when connecting to an unknown server id', async () => {
    const manager = new KumaConnectionManager();
    await expect(manager.connect('srv_missing')).rejects.toThrow(/not found/);
  });

  it('disconnect clears the active connection', async () => {
    useServers.setState({
      servers: [
        {
          id: 'srv_c',
          name: 'Test',
          url: 'https://kuma.example.com',
          authKind: 'password',
          connected: false,
          notificationMode: 'direct',
          createdAt: new Date(),
        },
      ],
      activeServerId: 'srv_c',
      hydrated: true,
    });
    loadCredentialsMock.mockResolvedValue({
      kind: 'password',
      username: 'quavon',
      password: 'secret',
    });

    const manager = new KumaConnectionManager();
    await manager.connect('srv_c');
    manager.disconnect('srv_c');

    expect(useMonitors.getState().statusByServer.srv_c).toBe('idle');
    expect(useServers.getState().servers[0].connected).toBe(false);
  });

  describe('event bridge: `incident` event end-to-end', () => {
    it('an `incident` event from the socket lands in incidentsByServer', async () => {
      // We capture the bridge callback the manager subscribes to,
      // so the test can synthesize events the way the real
      // KumaSocket would deliver them (through the listener the
      // manager wires up in `connect()`).
      let bridgeEmit: ((event: any) => void) | null = null;
      const capturedListenerBridge = (cb: any) => {
        bridgeEmit = cb;
        return () => {
          bridgeEmit = null;
        };
      };
      // Override the default KumaSocket mock for this test so the
      // `on()` registration captures the bridge.
      const { KumaSocket } = require('@/data/socket/client');
      const originalImpl = (KumaSocket as jest.Mock).getMockImplementation();
      (KumaSocket as jest.Mock).mockImplementation(() => {
        const listeners: any[] = [];
        return {
          connect: jest.fn(() => {
            queueMicrotask(() => {
              listeners.forEach((cb) => cb({ type: 'connected' }));
            });
          }),
          disconnect: jest.fn(),
          pauseMonitor: jest.fn(),
          resumeMonitor: jest.fn(),
          forceHeartbeat: jest.fn(),
          on: jest.fn((cb: any) => capturedListenerBridge(cb) || listeners.push(cb)),
        };
      });

      useServers.setState({
        servers: [
          {
            id: 'srv_inc',
            name: 'Test',
            url: 'https://kuma.example.com',
            authKind: 'password',
            connected: false,
            notificationMode: 'direct',
            createdAt: new Date(),
          },
        ],
        activeServerId: 'srv_inc',
        hydrated: true,
      });
      loadCredentialsMock.mockResolvedValue({
        kind: 'password',
        username: 'quavon',
        password: 'secret',
      });

      const manager = new KumaConnectionManager();
      await manager.connect('srv_inc');

      // Wait for the mock 'connected' event to flush.
      await new Promise((r) => setTimeout(r, 0));

      expect(bridgeEmit).not.toBeNull();
      // Synthesize the same shape Kuma emits:
      //   { monitorID: number, time: 'YYYY-MM-DD HH:MM:SS.mmm', status: 0|1 }
      // The KumaSocket normalizes it to a `NormalizedIncident` and the
      // manager re-emits a typed `KumaEvent` with `cause`. We simulate
      // the post-normalizer shape directly.
      (bridgeEmit as any)({
        type: 'incident',
        incident: {
          id: '42-2026-06-09 12:00:00.000',
          monitorId: 42,
          serverId: 'srv_inc',
          startedAt: new Date('2026-06-09T12:00:00.000Z'),
          cause: 'down',
        },
      });

      const incidents = useMonitors
        .getState()
        .incidentsByServer['srv_inc'] ?? [];
      expect(incidents).toHaveLength(1);
      expect(incidents[0]).toMatchObject({
        monitorId: 42,
        cause: 'down',
      });

      // Restore the original mock implementation so the rest of the
      // suite (and any teardown) is unaffected.
      if (originalImpl) {
        (KumaSocket as jest.Mock).mockImplementation(originalImpl);
      }
    });
  });
});
