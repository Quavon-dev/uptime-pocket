/**
 * PII scrubber tests.
 *
 * These tests cover the security-critical behavior: anything that
 * could leak a server URL, auth token, monitor name, or other
 * user-specific data MUST be redacted before the event leaves the
 * device. If you add a new field shape, add a test for it here.
 */

import {
  scrubEvent,
  scrubBreadcrumb,
  scrubString,
  type SentryEvent,
  type SentryBreadcrumb,
} from '../scrubber';

describe('scrubString', () => {
  it('redacts http URLs but keeps the path', () => {
    expect(scrubString('GET http://my-internal-kuma.corp.example/api/status')).toBe(
      'GET http://[Redacted]/api/status',
    );
  });

  it('redacts https URLs but keeps the path', () => {
    expect(scrubString('GET https://kuma.example.com/api/status')).toBe(
      'GET https://[Redacted]/api/status',
    );
  });

  it('redacts https URLs with custom port', () => {
    expect(scrubString('connecting to https://kuma.example.com:8443/')).toBe(
      'connecting to https://[Redacted]/',
    );
  });

  it('redacts ws URLs but keeps the socket.io path', () => {
    expect(scrubString('socket opened to ws://10.0.0.1:3001/socket.io/')).toBe(
      'socket opened to ws://[Redacted]/socket.io/',
    );
  });

  it('redacts wss URLs but keeps the socket.io path', () => {
    expect(scrubString('socket opened to wss://kuma.example.com/socket.io/')).toBe(
      'socket opened to wss://[Redacted]/socket.io/',
    );
  });

  it('redacts query parameter values but preserves keys', () => {
    const input = 'GET https://api.example.com/data?api_key=supersecret123&page=1';
    const out = scrubString(input);
    expect(out).toContain('api_key=Redacted');
    expect(out).toContain('page=Redacted');
    expect(out).not.toContain('supersecret123');
  });

  it('redacts credentials in URLs', () => {
    const input = 'wss://user:hunter2@kuma.example.com/socket.io/';
    const out = scrubString(input);
    expect(out).not.toContain('user');
    expect(out).not.toContain('hunter2');
    expect(out).toContain('wss://[Redacted]/socket.io/');
  });

  it('redacts Authorization: Bearer headers', () => {
    const input = 'Authorization: Bearer abc123def456ghi789';
    const out = scrubString(input);
    expect(out).toContain('Bearer [Redacted]');
    expect(out).not.toContain('abc123def456ghi789');
  });

  it('redacts Authorization: Basic headers', () => {
    const input = 'Authorization: Basic dXNlcjpwYXNz';
    const out = scrubString(input);
    expect(out).toContain('Basic [Redacted]');
    expect(out).not.toContain('dXNlcjpwYXNz');
  });

  it('redacts Authorization: Token headers', () => {
    const input = 'Authorization: Token my-secret-token-12345';
    const out = scrubString(input);
    expect(out).toContain('Token [Redacted]');
    expect(out).not.toContain('my-secret-token-12345');
  });

  it('truncates strings longer than MAX_LEN', () => {
    const long = 'x'.repeat(2000);
    const out = scrubString(long);
    expect(out.length).toBeLessThanOrEqual(1024 + 1); // 1024 + ellipsis char
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns short strings unchanged', () => {
    expect(scrubString('hello world')).toBe('hello world');
  });

  it('is idempotent for plain text', () => {
    const s = 'TypeError: cannot read foo of undefined';
    expect(scrubString(scrubString(s))).toBe(s);
  });
});

describe('scrubBreadcrumb', () => {
  it('redacts URL in data.url but keeps path', () => {
    const crumb: SentryBreadcrumb = {
      category: 'fetch',
      message: 'GET /api/status',
      data: { url: 'https://kuma.example.com/api/status', status: 200 },
    };
    const out = scrubBreadcrumb(crumb);
    expect(out.data?.url).toBe('https://[Redacted]/api/status');
    expect(out.data?.status).toBe(200);
  });

  it('redacts known PII keys in data', () => {
    const crumb: SentryBreadcrumb = {
      category: 'console',
      data: {
        url: 'https://example.com',
        token: 'my-token',
        password: 'hunter2',
        apiKey: 'key-abc',
        serverName: 'production-kuma',
        status: 'ok',
        count: 3,
      },
    };
    const out = scrubBreadcrumb(crumb);
    expect(out.data?.url).toBe('https://[Redacted]/');
    expect(out.data?.token).toBe('[Redacted]');
    expect(out.data?.password).toBe('[Redacted]');
    expect(out.data?.apiKey).toBe('[Redacted]');
    expect(out.data?.serverName).toBe('[Redacted]');
    expect(out.data?.status).toBe('ok');
    expect(out.data?.count).toBe(3);
  });

  it('scrubs free-form message', () => {
    const crumb: SentryBreadcrumb = {
      message: 'failed to fetch https://my-kuma.corp.local/api',
    };
    const out = scrubBreadcrumb(crumb);
    expect(out.message).toBe('failed to fetch https://[Redacted]/api');
  });

  it('does not mutate the input', () => {
    const crumb: SentryBreadcrumb = {
      message: 'GET https://example.com',
      data: { url: 'https://example.com', token: 'abc' },
    };
    const snapshot = JSON.parse(JSON.stringify(crumb));
    scrubBreadcrumb(crumb);
    expect(crumb).toEqual(snapshot);
  });
});

describe('scrubEvent', () => {
  it('scrubs the event message', () => {
    const event: SentryEvent = {
      message: 'failed connecting to https://kuma.example.com',
    };
    const out = scrubEvent(event);
    expect(out?.message).toBe('failed connecting to https://[Redacted]/');
  });

  it('drops server_name', () => {
    const event: SentryEvent = {
      server_name: 'my-internal-kuma.corp.example',
      message: 'crash',
    };
    const out = scrubEvent(event);
    expect(out?.server_name).toBeUndefined();
  });

  it('scrubs tags by redacting PII keys', () => {
    const event: SentryEvent = {
      tags: {
        server_url: 'https://kuma.example.com',
        monitor_name: 'web-prod',
        environment: 'production',
      },
    };
    const out = scrubEvent(event);
    expect(out?.tags?.server_url).toBe('[Redacted]');
    expect(out?.tags?.monitor_name).toBe('[Redacted]');
    expect(out?.tags?.environment).toBe('production');
  });

  it('scrubs extra by redacting PII keys', () => {
    const event: SentryEvent = {
      extra: {
        serverUrl: 'https://kuma.example.com',
        monitorCount: 12,
        sampleMonitorName: 'web-prod',
      },
    };
    const out = scrubEvent(event);
    expect(out?.extra?.serverUrl).toBe('[Redacted]');
    expect(out?.extra?.sampleMonitorName).toBe('[Redacted]');
    expect(out?.extra?.monitorCount).toBe(12);
  });

  it('scrubs user context to only the id field', () => {
    const event: SentryEvent = {
      user: {
        id: 'anon-hash-abc123',
        email: 'leopold@example.com',
        ip_address: '203.0.113.42',
        username: 'leopold',
      },
    };
    const out = scrubEvent(event);
    expect(out?.user).toEqual({ id: 'anon-hash-abc123' });
  });

  it('scrubs exception values', () => {
    const event: SentryEvent = {
      exception: {
        values: [
          {
            type: 'TypeError',
            value: 'request to https://kuma.example.com/api failed',
          },
        ],
      },
    };
    const out = scrubEvent(event);
    expect(out?.exception?.values?.[0]?.value).toBe(
      'request to https://[Redacted]/api failed',
    );
  });

  it('redacts file:// scheme in frame abs_path', () => {
    const event: SentryEvent = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                { abs_path: 'file:///Users/leopold/Library/.../main.jsbundle' },
                { abs_path: 'app:///main.jsbundle' },
              ],
            },
          },
        ],
      },
    };
    const out = scrubEvent(event);
    const frames = out?.exception?.values?.[0]?.stacktrace?.frames ?? [];
    // file:// is a scheme-bearing path — drop abs_path entirely
    expect(frames[0]?.abs_path).toBeUndefined();
    // app:// is also scheme-bearing — also dropped (we keep filename only)
    expect(frames[1]?.abs_path).toBeUndefined();
  });

  it('scrubs all breadcrumbs', () => {
    const event: SentryEvent = {
      breadcrumbs: {
        values: [
          {
            message: 'connecting to https://kuma.example.com',
            data: { url: 'https://kuma.example.com' },
          },
          {
            message: 'Authorization: Bearer abc123def456ghi789',
          },
        ],
      },
    };
    const out = scrubEvent(event);
    const crumbs = out?.breadcrumbs?.values ?? [];
    expect(crumbs[0]?.message).toBe('connecting to https://[Redacted]/');
    expect(crumbs[0]?.data?.url).toBe('https://[Redacted]/');
    expect(crumbs[1]?.message).toContain('Bearer [Redacted]');
  });

  it('returns null for non-object input', () => {
    expect(scrubEvent(null as unknown as SentryEvent)).toBeNull();
    expect(scrubEvent(undefined as unknown as SentryEvent)).toBeNull();
    expect(scrubEvent('string' as unknown as SentryEvent)).toBeNull();
  });

  it('does not mutate the input event', () => {
    const event: SentryEvent = {
      message: 'https://kuma.example.com',
      user: { id: 'x', email: 'a@b.com' },
      tags: { server_url: 'https://kuma.example.com' },
    };
    const snapshot = JSON.parse(JSON.stringify(event));
    scrubEvent(event);
    expect(event).toEqual(snapshot);
  });

  it('passes through clean data unchanged', () => {
    const event: SentryEvent = {
      message: 'TypeError: foo is not a function',
      tags: { environment: 'production', version: '1.2.3' },
    };
    const out = scrubEvent(event);
    expect(out?.message).toBe('TypeError: foo is not a function');
    expect(out?.tags).toEqual({ environment: 'production', version: '1.2.3' });
  });
});
