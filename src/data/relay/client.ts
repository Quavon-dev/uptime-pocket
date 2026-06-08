/**
 * Relay client.
 *
 * The relay is a small server that watches your Kuma instances
 * and forwards status changes as push notifications via APNs
 * (iOS) or FCM (Android). This is "Option C" in the in-app
 * notification mode picker — always-on, even when the phone
 * is locked for hours.
 *
 * When the user picks notification mode = 'relay' for a
 * server, the app registers its push token with the relay,
 * scoped to that server. The relay then sends pushes for
 * status changes on that server until the user:
 *   - turns off relay mode (we send DELETE /v1/devices)
 *   - uninstalls (APNs/FCM returns ErrInvalidToken, relay
 *     cleans up the device)
 *   - rotates their push token (we re-register on token
 *     refresh)
 *
 * The relay URL + API key are configured per-user in the
 * "Notifications" section of the app. We persist them in
 * SQLite alongside the server records (in a future v1.1;
 * for v1.0 they're stored in expo-secure-store keyed by
 * server ID).
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getCurrentSettings } from '@/data/store/settings';

/**
 * Per-server relay configuration. Stored in the secure store
 * keyed by `relay:<serverId>`. We keep this small on purpose:
 * the relay URL is the only knob the user touches.
 */
export interface RelayConfig {
  /** HTTPS URL of the relay, e.g. https://relay.example.com */
  url: string;
  /** The bearer token the user generated when they deployed the relay. */
  apiKey: string;
}

/**
 * The body of POST /v1/devices. The relay will accept
 * missing or empty fields and ignore them.
 */
export interface RegisterDeviceBody {
  deviceId: string;
  platform: 'ios' | 'android';
  pushToken: string;
  servers: Array<{
    id: string;
    label: string;
    url: string;
  }>;
  quietHours: {
    enabled: boolean;
    startMinute: number;
    endMinute: number;
  };
  locale: string;
}

/**
 * Register (or update) a device with a relay.
 *
 * Idempotent: calling this twice with the same deviceId just
 * overwrites the server's stored record.
 *
 * Returns true on 2xx, false otherwise. The caller is
 * expected to log and move on — a failed registration means
 * pushes won't work, but the rest of the app continues.
 */
export async function registerDevice(
  cfg: RelayConfig,
  body: RegisterDeviceBody,
  options: { fetch?: typeof fetch; signal?: AbortSignal } = {}
): Promise<boolean> {
  const f = options.fetch ?? fetch;
  try {
    const res = await f(`${cfg.url.replace(/\/$/, '')}/v1/devices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    return res.status >= 200 && res.status < 300;
  } catch (err) {
    // Network errors are non-fatal — the user can retry.
    // We log and let the caller decide.
    console.warn('[relay] registerDevice failed:', err);
    return false;
  }
}

/**
 * Unregister a device. Used when the user turns off relay
 * mode for a server, or deletes the server entirely.
 *
 * Idempotent: a 404 is treated as success (the device was
 * already gone).
 */
export async function unregisterDevice(
  cfg: RelayConfig,
  deviceId: string,
  options: { fetch?: typeof fetch; signal?: AbortSignal } = {}
): Promise<boolean> {
  const f = options.fetch ?? fetch;
  try {
    const res = await f(`${cfg.url.replace(/\/$/, '')}/v1/devices`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ deviceId }),
      signal: options.signal,
    });
    // 204 is success. 404 means already gone — also success.
    return res.status === 204 || res.status === 404;
  } catch (err) {
    console.warn('[relay] unregisterDevice failed:', err);
    return false;
  }
}

/**
 * Get the device's push token, asking for permission if we
 * don't have it yet. Returns null if permission is denied.
 *
 * On Android <13 the system grants permission by default and
 * getDevicePushTokenAsync resolves without a prompt. On
 * Android 13+ and iOS, the user is prompted the first time.
 */
export async function getDevicePushToken(): Promise<string | null> {
  // Permission check. We do this here (not at the call site)
  // because both the relay registration and the direct-mode
  // bridge need it.
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    if (req.status !== 'granted') {
      return null;
    }
  }

  try {
    const token = await Notifications.getDevicePushTokenAsync();
    return token.data;
  } catch (err) {
    // expo-notifications throws if APNs/FCM returned an
    // error. We log and return null; the user can retry.
    console.warn('[relay] getDevicePushTokenAsync failed:', err);
    return null;
  }
}

/**
 * Determine the platform string the relay expects.
 *
 * The relay's API uses 'ios' and 'android' as the canonical
 * names. React Native's Platform.OS is 'ios' and 'android'
 * already, so this is mostly a type guard.
 */
export function relayPlatform(): 'ios' | 'android' | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

/**
 * Build the registration body for one server. Pulls
 * quiet hours from the persisted settings so the relay
 * honors them server-side.
 */
export function buildRegisterBody(args: {
  deviceId: string;
  pushToken: string;
  server: { id: string; label: string; url: string };
}): RegisterDeviceBody {
  const settings = getCurrentSettings();
  return {
    deviceId: args.deviceId,
    platform: relayPlatform() ?? 'ios', // should be filtered upstream
    pushToken: args.pushToken,
    servers: [
      {
        id: args.server.id,
        label: args.server.label,
        url: args.server.url,
      },
    ],
    quietHours: {
      enabled: settings.quietHoursEnabled,
      startMinute: settings.quietHoursStartMinute,
      endMinute: settings.quietHoursEndMinute,
    },
    // We pull locale from the i18n module's current state.
    // Imported lazily to avoid a circular import.
    locale: getCurrentLocale(),
  };
}

// Lazy import to avoid circular dependency.
import { getLocale } from '@/i18n';
function getCurrentLocale(): string {
  return getLocale();
}
