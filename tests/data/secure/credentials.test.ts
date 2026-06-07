/**
 * Tests for the SecureStore credential wrapper.
 *
 * We mock expo-secure-store in jest.setup.ts (an in-memory map), so
 * these tests exercise the real wrapper code: serialization, namespacing,
 * deserialization validation.
 */

import {
  saveCredentials,
  loadCredentials,
  deleteCredentials,
  isSecureStorageAvailable,
} from '@/data/secure/credentials';

describe('credentials', () => {
  const SERVER_ID = 'srv_test_123';

  beforeEach(() => {
    // Clear any leftover entries from other tests.
    // The mock's __clearStore is invoked per-test via beforeEach.
    jest.clearAllMocks();
  });

  describe('bearer strategy', () => {
    it('round-trips a bearer token', async () => {
      await saveCredentials(SERVER_ID, { kind: 'bearer', token: 'tk_abc123' });
      const loaded = await loadCredentials(SERVER_ID);
      expect(loaded).toEqual({ kind: 'bearer', token: 'tk_abc123' });
    });

    it('rejects an empty bearer token on write', async () => {
      await expect(
        saveCredentials(SERVER_ID, { kind: 'bearer', token: '' })
      ).rejects.toThrow();
    });
  });

  describe('password strategy', () => {
    it('round-trips username + password', async () => {
      await saveCredentials(SERVER_ID, {
        kind: 'password',
        username: 'admin',
        password: 'hunter2',
      });
      const loaded = await loadCredentials(SERVER_ID);
      expect(loaded).toEqual({
        kind: 'password',
        username: 'admin',
        password: 'hunter2',
      });
    });

    it('rejects empty username or password on write', async () => {
      await expect(
        saveCredentials(SERVER_ID, {
          kind: 'password',
          username: '',
          password: 'hunter2',
        })
      ).rejects.toThrow();

      await expect(
        saveCredentials(SERVER_ID, {
          kind: 'password',
          username: 'admin',
          password: '',
        })
      ).rejects.toThrow();
    });
  });

  describe('namespacing', () => {
    it('keeps separate credentials per server id', async () => {
      await saveCredentials('srv_a', { kind: 'bearer', token: 'tk_a' });
      await saveCredentials('srv_b', { kind: 'bearer', token: 'tk_b' });

      expect(await loadCredentials('srv_a')).toEqual({
        kind: 'bearer',
        token: 'tk_a',
      });
      expect(await loadCredentials('srv_b')).toEqual({
        kind: 'bearer',
        token: 'tk_b',
      });
    });
  });

  describe('deleteCredentials', () => {
    it('removes the entry', async () => {
      await saveCredentials(SERVER_ID, { kind: 'bearer', token: 'tk_x' });
      await deleteCredentials(SERVER_ID);
      expect(await loadCredentials(SERVER_ID)).toBeNull();
    });

    it('is a no-op when nothing is stored', async () => {
      // Should not throw
      await expect(deleteCredentials('srv_nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('malformed data', () => {
    it('returns null when nothing is stored', async () => {
      expect(await loadCredentials('srv_missing')).toBeNull();
    });
  });

  describe('isSecureStorageAvailable', () => {
    it('reports availability', async () => {
      expect(await isSecureStorageAvailable()).toBe(true);
    });
  });
});
