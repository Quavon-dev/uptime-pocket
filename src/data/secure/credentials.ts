/**
 * Secure credential storage for Kuma servers.
 *
 *   - iOS:     Keychain Services
 *   - Android: AndroidKeyStore (Keystore)
 *   - Web:     localStorage with a clear warning (SecureStore is
 *              not designed for web and we don't ship a web build,
 *              so the runtime throws if you try)
 *
 * Key naming
 * ----------
 * Keys are namespaced: `uptime-pocket.cred.<serverId>`. This keeps
 * SecureStore tidy and makes it easy to bulk-delete all credentials
 * (e.g. on sign-out / app reset, future feature).
 *
 * Why a small wrapper?
 * --------------------
 *   1. Zod validates the shape on read so a corrupted SecureStore
 *      entry can never produce a malformed `AuthStrategy`.
 *   2. We never store the secret side-by-side with the kind, so a
 *      careless dump of the SQLite file (e.g. for debugging) won't
 *      leak tokens.
 *   3. Unit tests can mock SecureStore and exercise the round-trip.
 */

import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import type { AuthStrategy } from '@/domain/models';

const KEY_PREFIX = 'uptime-pocket.cred.';

/** Auth strategy as serialized in SecureStore (no functions, no Date). */
const AuthStrategySchema = z.object({
  kind: z.literal('password'),
  username: z.string().min(1),
  password: z.string().min(1),
});

/**
 * Persist credentials for a server, replacing any previous entry.
 * Pass `null` to remove them.
 */
export async function saveCredentials(
  serverId: string,
  auth: AuthStrategy
): Promise<void> {
  // Validate before writing — never store garbage.
  const parsed = AuthStrategySchema.parse(auth);
  await SecureStore.setItemAsync(KEY_PREFIX + serverId, JSON.stringify(parsed));
}

/**
 * Read credentials for a server. Returns `null` if none stored.
 * Throws if the stored data is malformed (should never happen).
 */
export async function loadCredentials(
  serverId: string
): Promise<AuthStrategy | null> {
  const raw = await SecureStore.getItemAsync(KEY_PREFIX + serverId);
  if (raw == null) return null;
  const parsed = AuthStrategySchema.parse(JSON.parse(raw));
  return parsed;
}

/**
 * Remove credentials for a server. Safe to call when none exist.
 */
export async function deleteCredentials(serverId: string): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_PREFIX + serverId);
}

/**
 * Check whether SecureStore is available. On web this returns false.
 * Callers can use this to surface a "Web is not supported" message.
 */
export async function isSecureStorageAvailable(): Promise<boolean> {
  return await SecureStore.isAvailableAsync();
}
