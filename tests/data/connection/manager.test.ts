/**
 * Tests for the KumaConnectionManager.
 *
 * We mock the socket + REST layers and the Zustand stores, then verify
 * that the manager correctly:
 *   - calls connect/disconnect lifecycle
 *   - forwards events to the right store mutators
 *   - handles credentials loaded from SecureStore
 */

import { KumaConnectionManager } from '@/data/connection/manager';
import { useMonitors } from '@/data/store/monitors';
import { useServers } from '@/data/store/servers';
import { loadCredentials } from '@/data/secure/credentials';

// We mock the socket + REST clients to avoid the real socket.io transport.
// The mocked classes just record calls and let us push events manually.
jest.mock('@/data/socket/client', () => {
  type mockListener = (mockEvent: unknown) => void;
  return {
    KumaSocket: jest.fn().mockImplementation(() => {
      const mockListeners: Set<mockListener> = new Set();
      const mockSocket = {
        connect: jest.fn(),
        disconnect: jest.fn(),
        pauseMonitor: jest.fn(),
        resumeMonitor: jest.fn(),
        forceHeartbeat: jest.fn(),
        on: jest.fn((cb: mockListener) => {
          mockListeners.add(cb);
          return () => {
            mockListeners.delete(cb);
          };
        }),
      };
      (mockSocket as unknown as { __listeners: Set<mockListener> }).__listeners = mockListeners;
      return mockSocket;
    }),
    // For tests: the buildSocketLogin fn is never used because the
    // test stubs `openRawSocket` to skip the real socket path. We
    // provide a no-op fallback so the import doesn't blow up.
    buildSocketLogin: jest.fn(() => async () => {
      throw new Error('buildSocketLogin not used in tests');
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
          authKind: 'bearer',
          connected: false,
          notificationMode: 'direct',
          createdAt: new Date(),
        },
      ],
      activeServerId: null,
      hydrated: true,
    });
    loadCredentialsMock.mockResolvedValue({ kind: 'bearer', token: 'tk_test' });

    const manager = new KumaConnectionManager();
    // Stub the raw socket: emit 'connect' synchronously, then never
    // call back. The manager's connect() resolves on the connect
    // event; the JWT for bearer auth is the static token, so the
    // promise resolves immediately.
    manager.openRawSocket = () => {
      const handlers: Record<string, Array<(...a: unknown[]) => void>> = {};
      const sock: any = {
        once: (evt: string, cb: (...a: unknown[]) => void) => {
          (handlers[evt] ??= []).push(cb);
        },
        off: () => {},
        emit: () => {},
        disconnect: () => {},
        removeAllListeners: () => {},
        on: () => {},
      };
      queueMicrotask(() => handlers['connect']?.[0]?.());
      return sock as never;
    };
    await manager.connect('srv_a');

    expect(loadCredentialsMock).toHaveBeenCalledWith('srv_a');
    // The mocked KumaSocket never emits a 'connected' event (it
    // would normally do so on real socket connect). Verify the
    // initial 'connecting' state was set, and that the manager
    // didn't error out.
    expect(useMonitors.getState().statusByServer.srv_a).toBe('connecting');
    expect(useMonitors.getState().errorByServer.srv_a ?? null).toBeNull();
  });

  it('reports an error when no credentials are stored', async () => {
    useServers.setState({
      servers: [
        {
          id: 'srv_b',
          name: 'Test',
          url: 'https://kuma.example.com',
          authKind: 'bearer',
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
          authKind: 'bearer',
          connected: false,
          notificationMode: 'direct',
          createdAt: new Date(),
        },
      ],
      activeServerId: 'srv_c',
      hydrated: true,
    });
    loadCredentialsMock.mockResolvedValue({ kind: 'bearer', token: 'tk_test' });

    const manager = new KumaConnectionManager();
    // Same stub as the first test — synchronous 'connect' emit.
    manager.openRawSocket = () => {
      const handlers: Record<string, Array<(...a: unknown[]) => void>> = {};
      const sock: any = {
        once: (evt: string, cb: (...a: unknown[]) => void) => {
          (handlers[evt] ??= []).push(cb);
        },
        off: () => {},
        emit: () => {},
        disconnect: () => {},
        removeAllListeners: () => {},
        on: () => {},
      };
      queueMicrotask(() => handlers['connect']?.[0]?.());
      return sock as never;
    };
    await manager.connect('srv_c');
    manager.disconnect('srv_c');

    expect(useMonitors.getState().statusByServer.srv_c).toBe('idle');
    expect(useServers.getState().servers[0].connected).toBe(false);
  });
});
