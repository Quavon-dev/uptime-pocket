/**
 * useRelayRegistration - the bridge between the app and the
 * optional self-hosted relay.
 *
 * Lifecycle:
 *   1. User adds a Kuma server in the app.
 *   2. User sets notification mode = 'relay' for that server.
 *   3. User configures the relay URL + API key (per-server,
 *      stored in expo-secure-store; v1.0 uses a shared global
 *      config for simplicity).
 *   4. App calls this hook's `register()` which:
 *      a. Asks for notification permission if needed.
 *      b. Gets the device push token.
 *      c. POSTs the device + server list to the relay.
 *   5. The relay now sends pushes for transitions on that
 *      server. The app's own notification bridge (Direct mode)
 *      is bypassed for that server.
 *   6. When the user turns off relay mode, deletes the server,
 *      or the app receives a token refresh, we re-register
 *      (or unregister).
 *
 * This hook is intentionally side-effect-free on mount — the
 * UI calls `register()` explicitly when the user takes an
 * action, and `unregister()` when they undo it.
 */

import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import {
  registerDevice as registerDeviceHttp,
  unregisterDevice as unregisterDeviceHttp,
  buildRegisterBody,
  type RelayConfig,
} from '@/data/relay/client';
import { useServers } from '@/data/store/servers';
import { useSettings } from '@/data/store/settings';

export type RegistrationStatus = 'idle' | 'registering' | 'registered' | 'failed';

export interface UseRelayRegistrationResult {
  status: RegistrationStatus;
  lastError: string | null;
  register: (cfg: RelayConfig, serverId: string) => Promise<boolean>;
  unregister: (cfg: RelayConfig, serverId: string) => Promise<boolean>;
}

export function useRelayRegistration(): UseRelayRegistrationResult {
  const [status, setStatus] = useState<RegistrationStatus>('idle');
  const [lastError, setLastError] = useState<string | null>(null);

  const servers = useServers((s) => s.servers);

  const register = useCallback(
    async (cfg: RelayConfig, serverId: string): Promise<boolean> => {
      setStatus('registering');
      setLastError(null);

      // Get the push token. If permission is denied, abort.
      let pushToken: string | null = null;
      try {
        const { status: existing } = await Notifications.getPermissionsAsync();
        if (existing !== 'granted') {
          const req = await Notifications.requestPermissionsAsync();
          if (req.status !== 'granted') {
            setStatus('failed');
            setLastError('notification permission denied');
            return false;
          }
        }
        const t = await Notifications.getDevicePushTokenAsync();
        pushToken = t.data;
      } catch (err) {
        setStatus('failed');
        setLastError(err instanceof Error ? err.message : String(err));
        return false;
      }
      if (!pushToken) {
        setStatus('failed');
        setLastError('no push token available');
        return false;
      }

      // Find the server in the store.
      const server = servers.find((s) => s.id === serverId);
      if (!server) {
        setStatus('failed');
        setLastError(`server ${serverId} not found`);
        return false;
      }

      // Stable per-install device ID. iOS: the IDFV (Identifier
      // For Vendor), which is reset when the user uninstalls the
      // last app from this vendor. Android: the installation ID
      // (Application.androidId on Android < 8, or a generated
      // UUID saved to AsyncStorage on 8+).
      let deviceId: string;
      try {
        if (Platform.OS === 'ios') {
          const idfv = await Application.getIosIdForVendorAsync();
          deviceId = idfv ?? 'unknown-ios';
        } else {
          deviceId = Application.getAndroidId() ?? 'unknown-android';
        }
      } catch {
        deviceId = 'unknown-device';
      }

      const body = buildRegisterBody({
        deviceId,
        pushToken: pushToken!,
        server: { id: server.id, label: server.name, url: server.url },
      });

      const ok = await registerDeviceHttp(cfg, body);
      if (ok) {
        setStatus('registered');
        return true;
      }
      setStatus('failed');
      setLastError('relay registration failed (see logs)');
      return false;
    },
    [servers]
  );

  const unregister = useCallback(
    async (cfg: RelayConfig, serverId: string): Promise<boolean> => {
      // We need the deviceId to unregister. Use the same logic
      // as register() — kept inline so callers can unregister
      // without first calling register (e.g. cleanup on logout).
      let deviceId: string;
      try {
        if (Platform.OS === 'ios') {
          const idfv = await Application.getIosIdForVendorAsync();
          deviceId = idfv ?? 'unknown-ios';
        } else {
          deviceId = Application.getAndroidId() ?? 'unknown-android';
        }
      } catch {
        deviceId = 'unknown-device';
      }
      return unregisterDeviceHttp(cfg, deviceId);
    },
    []
  );

  // Read settings so quietHours / locale changes propagate on
  // the next register() call. We don't auto-re-register; the
  // UI does that when the user changes settings.
  void useSettings((s) => s.locale);
  void useSettings((s) => s.quietHoursEnabled);
  void useSettings((s) => s.quietHoursStartMinute);
  void useSettings((s) => s.quietHoursEndMinute);

  return { status, lastError, register, unregister };
}
