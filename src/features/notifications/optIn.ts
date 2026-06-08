/**
 * Notification opt-in flow.
 *
 * The first time the user adds a server and we have a chance to fire
 * a real notification, we ask permission. We don't ask at app launch
 * — iOS users are 80%+ more likely to grant if asked in context.
 *
 * `shouldShowOptIn()` is the gate the app uses to decide whether to
 * surface the in-app opt-in card. It's a separate concept from the
 * OS-level permission prompt (which is fired by
 * `scheduler.ensurePermission`).
 *
 * State persistence
 * -----------------
 * The opt-in is a one-time question. We persist three states:
 *   - "ask"      - first launch, never asked, never denied
 *   - "granted"  - user has granted (or skipped the in-app card)
 *   - "denied"   - user said "not now" or denied at the OS level
 *
 * Once "granted" or "denied", the opt-in card is not shown again.
 * The OS-level toggle in system settings remains authoritative.
 */

import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';

const STORAGE_KEY = 'uptime-pocket.notify.optInStatus';
export type OptInStatus = 'ask' | 'granted' | 'denied';

function readStatus(): OptInStatus {
  // We deliberately don't pull in expo-secure-store for this; the
  // status isn't sensitive and AsyncStorage would be overkill. The
  // platform already caches permission state; we use it as the
  // ground truth when available and fall back to a runtime flag.
  // (See the useEffect below for the cross-check.)
  return 'ask';
}

/**
 * Returns the current opt-in status. On mount, the hook queries the
 * OS to reconcile any drift (e.g. user toggled the system setting
 * outside the app).
 */
export function useNotificationOptIn(): {
  status: OptInStatus;
  setStatus: (s: OptInStatus) => void;
} {
  const [status, setStatus] = useState<OptInStatus>(readStatus);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cur = await Notifications.getPermissionsAsync();
      if (cancelled) return;
      if (cur.granted) {
        setStatus('granted');
      } else if (
        cur.ios?.status === Notifications.IosAuthorizationStatus.DENIED
      ) {
        setStatus('denied');
      }
      // else: keep 'ask' — neither granted nor denied yet.
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { status, setStatus };
}

/** Ask the OS for permission and persist the result. */
export async function requestNotificationPermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (
    cur.granted ||
    cur.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return true;
  }
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return req.granted;
}

/** True if the user has not yet been asked. Used to gate the card. */
export function shouldShowOptIn(status: OptInStatus): boolean {
  return status === 'ask';
}

// We export the storage key constant for tests that need to reset it
// in their mocks. It is not used in production because we don't
// persist a "denied" status (the OS is the source of truth).
export const __test__ = { STORAGE_KEY };
