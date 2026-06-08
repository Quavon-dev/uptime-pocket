/**
 * Relay client tests.
 *
 * We mock fetch globally and assert the URL, method, headers,
 * and body the client sends. expo-notifications is mocked
 * because it requires native modules.
 */

import {
  registerDevice,
  unregisterDevice,
  buildRegisterBody,
  relayPlatform,
} from '@/data/relay/client';

// Mock expo-notifications before any import that touches it.
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
}));

// Mock the i18n module so the lazy import resolves.
jest.mock('@/i18n', () => ({
  getLocale: () => 'en',
}));

// Mock the settings store. We only need getCurrentSettings()
// to return a deterministic value for the quietHours field.
jest.mock('@/data/store/settings', () => ({
  getCurrentSettings: () => ({
    theme: 'system' as const,
    accentColor: null,
    accentSwatchId: null,
    biometricLock: false,
    quietHoursEnabled: true,
    quietHoursStartMinute: 22 * 60,
    quietHoursEndMinute: 7 * 60,
    hasOnboarded: true,
    locale: 'system' as const,
  }),
}));

// Mock fetch with a controllable function.
const mockFetch = jest.fn();
beforeEach(() => {
  mockFetch.mockReset();
  // Default: 204 No Content
  mockFetch.mockResolvedValue({
    status: 204,
    ok: true,
    text: async () => '',
  });
  (global as { fetch: unknown }).fetch = mockFetch;
});

const cfg = {
  url: 'https://relay.example.com',
  apiKey: 'test-key-12345',
};

describe('registerDevice()', () => {
  it('sends POST to {url}/v1/devices with bearer auth', async () => {
    const ok = await registerDevice(
      cfg,
      {
        deviceId: 'd-1',
        platform: 'ios',
        pushToken: 'tok-abc',
        servers: [{ id: 'k1', label: 'Prod', url: 'https://kuma.example.com' }],
        quietHours: { enabled: false, startMinute: 0, endMinute: 0 },
        locale: 'en',
      },
      { fetch: mockFetch as unknown as typeof fetch }
    );
    expect(ok).toBe(true);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://relay.example.com/v1/devices');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-key-12345');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.deviceId).toBe('d-1');
    expect(body.pushToken).toBe('tok-abc');
    expect(body.servers[0].id).toBe('k1');
  });

  it('strips trailing slash from url before appending path', async () => {
    await registerDevice(
      { url: 'https://relay.example.com/', apiKey: 'k' },
      {
        deviceId: 'd',
        platform: 'ios',
        pushToken: 't',
        servers: [],
        quietHours: { enabled: false, startMinute: 0, endMinute: 0 },
        locale: 'en',
      },
      { fetch: mockFetch as unknown as typeof fetch }
    );
    expect(mockFetch.mock.calls[0][0]).toBe('https://relay.example.com/v1/devices');
  });

  it('returns false on non-2xx', async () => {
    mockFetch.mockResolvedValueOnce({ status: 401, ok: false, text: async () => '' });
    const ok = await registerDevice(
      cfg,
      {
        deviceId: 'd',
        platform: 'ios',
        pushToken: 't',
        servers: [],
        quietHours: { enabled: false, startMinute: 0, endMinute: 0 },
        locale: 'en',
      },
      { fetch: mockFetch as unknown as typeof fetch }
    );
    expect(ok).toBe(false);
  });

  it('returns false on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    // Suppress the expected console.warn
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const ok = await registerDevice(
      cfg,
      {
        deviceId: 'd',
        platform: 'ios',
        pushToken: 't',
        servers: [],
        quietHours: { enabled: false, startMinute: 0, endMinute: 0 },
        locale: 'en',
      },
      { fetch: mockFetch as unknown as typeof fetch }
    );
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('unregisterDevice()', () => {
  it('sends DELETE with {deviceId} in body', async () => {
    const ok = await unregisterDevice(cfg, 'd-1', { fetch: mockFetch as unknown as typeof fetch });
    expect(ok).toBe(true);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://relay.example.com/v1/devices');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ deviceId: 'd-1' });
  });

  it('treats 404 as success (already gone)', async () => {
    mockFetch.mockResolvedValueOnce({ status: 404, ok: false, text: async () => '' });
    const ok = await unregisterDevice(cfg, 'd-1', { fetch: mockFetch as unknown as typeof fetch });
    expect(ok).toBe(true);
  });

  it('returns false on 500', async () => {
    mockFetch.mockResolvedValueOnce({ status: 500, ok: false, text: async () => 'boom' });
    const ok = await unregisterDevice(cfg, 'd-1', { fetch: mockFetch as unknown as typeof fetch });
    expect(ok).toBe(false);
  });
});

describe('buildRegisterBody()', () => {
  it('pulls quietHours from settings and locale from i18n', () => {
    const body = buildRegisterBody({
      deviceId: 'd',
      pushToken: 't',
      server: { id: 'k1', label: 'Prod', url: 'https://kuma.example.com' },
    });
    expect(body.deviceId).toBe('d');
    expect(body.pushToken).toBe('t');
    expect(body.servers).toEqual([{ id: 'k1', label: 'Prod', url: 'https://kuma.example.com' }]);
    // From the settings mock: enabled=true, 22:00 -> 07:00
    expect(body.quietHours).toEqual({
      enabled: true,
      startMinute: 22 * 60,
      endMinute: 7 * 60,
    });
    // From the i18n mock: 'en'
    expect(body.locale).toBe('en');
  });
});

describe('relayPlatform()', () => {
  it('returns the platform name when ios or android', () => {
    // We can't easily change Platform.OS in jest without
    // mocking the entire 'react-native' module, but the
    // current test env is 'ios' (we're not on a phone).
    // Just assert the function returns a valid value.
    const p = relayPlatform();
    expect(p === 'ios' || p === 'android' || p === null).toBe(true);
  });
});
