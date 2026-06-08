/**
 * Biometric / device-credential lock.
 *
 * The app supports an optional "lock with biometrics" setting
 * (see `useSettings.biometricLock`). When enabled, the user has to
 * pass a local authentication challenge (Face ID / Touch ID / Android
 * fingerprint / device PIN as a fallback) before any UI is shown.
 *
 * Design
 * ------
 * - The lock state is "this session only": we re-lock on every cold
 *   launch, and on `AppState` transitions to background longer than
 *   `LOCK_TIMEOUT_MS` (currently 0 = always re-lock on resume).
 * - We never persist any unlock state. The user re-authenticates each
 *   time. This is the safest default for a security setting.
 * - The biometric prompt itself is delegated to `expo-local-authentication`,
 *   which is the Expo-supported wrapper around:
 *     - iOS:     LAContext (LocalAuthentication.framework)
 *     - Android: BiometricPrompt / KeyguardManager
 *   We never roll our own crypto or our own UI for the prompt.
 *
 * Platform behavior
 * -----------------
 * - iOS Simulator: Face ID is "enrolled" via Features > Face ID > Enrolled.
 *   Without that, the prompt will say "Biometry is not available".
 *   In that case, we DO NOT silently bypass the lock — we show a
 *   "lock unavailable" message. The user can disable the lock in
 *   settings if they're on a simulator.
 * - Android Emulator: Biometric is configured under Extended Controls.
 *   If not enrolled, the prompt is also unavailable.
 * - Web: This is a native-only feature. `isAvailableAsync` returns
 *   false; we treat that as "lock can't be enforced" and let the
 *   setting act as a no-op.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSettings } from '@/data/store/settings';

export type LockStatus =
  /** Lock setting is off — app is always unlocked. */
  | 'disabled'
  /** Setting is on but we haven't yet shown the auth prompt. */
  | 'locked'
  /** Auth prompt is currently being shown. */
  | 'authenticating'
  /** User passed the prompt and the app is unlocked. */
  | 'unlocked'
  /** Device has no biometric / device-credential set up. */
  | 'unavailable';

export interface UseBiometricLockResult {
  status: LockStatus;
  /** Force a re-lock, e.g. when the user explicitly logs out. */
  lock: () => void;
  /** Manually trigger the auth prompt. Used by the lock screen's
   *  "Try again" button. */
  unlock: () => Promise<void>;
  /** Pretty name of the available biometry, e.g. "Face ID". Used for
   *  the lock screen button label. */
  biometryName: string | null;
}

/** How long the app can sit in the background before we re-lock. */
const LOCK_TIMEOUT_MS = 0; // 0 = always re-lock on resume.

/** Map expo's biometry enum to a human label. */
export function biometryLabel(b: LocalAuthentication.AuthenticationType | null): string | null {
  if (b === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) return 'Face ID';
  if (b === LocalAuthentication.AuthenticationType.FINGERPRINT) return 'Touch ID';
  if (b === LocalAuthentication.AuthenticationType.IRIS) return 'Iris';
  return null;
}

/**
 * Pure status-machine helper. Extracted so unit tests can exercise
 * the transition rules without rendering React.
 *
 *   enabled=false             -> 'disabled'
 *   enabled=true, !hasHw      -> 'unavailable'
 *   enabled=true, !enrolled   -> 'unavailable'
 *   enabled=true, !types      -> 'unavailable'
 *   enabled=true, ok          -> 'locked' (then the hook will auto-prompt)
 */
export async function probeLockStatus(
  hasHardware: boolean,
  isEnrolled: boolean,
  supportedTypes: readonly LocalAuthentication.AuthenticationType[],
  enabled: boolean
): Promise<Exclude<LockStatus, 'authenticating' | 'unlocked'>> {
  if (!enabled) return 'disabled';
  if (!hasHardware || !isEnrolled || supportedTypes.length === 0) return 'unavailable';
  return 'locked';
}

/**
 * Hook returning the current lock status + actions.
 *
 * The status machine is intentionally simple:
 *
 *   enabled && not unlocked && no prompt running  -> 'locked'
 *   enabled && prompt running                     -> 'authenticating'
 *   enabled && passed prompt                      -> 'unlocked'
 *   enabled but device has no auth available       -> 'unavailable'
 *   !enabled                                      -> 'disabled'
 *
 * Auto-unlock behavior: when the status is 'locked' the hook shows the
 * auth prompt automatically. When the user backgrounds the app and
 * returns, we transition back to 'locked' (or 'authenticating' if a
 * prompt is in flight) which re-runs the effect.
 */
export function useBiometricLock(): UseBiometricLockResult {
  const biometricLockEnabled = useSettings((s) => s.biometricLock);
  const settingsHydrated = useSettings((s) => s.hydrated);

  const [status, setStatus] = useState<LockStatus>(
    biometricLockEnabled ? 'locked' : 'disabled',
  );
  const [biometryName, setBiometryName] = useState<string | null>(null);
  // Guard so we don't run two prompts at once if React double-invokes
  // effects in StrictMode.
  const inFlightRef = useRef(false);

  // Probe device capabilities on first run (and whenever settings hydrate).
  useEffect(() => {
    if (!settingsHydrated) return;
    if (!biometricLockEnabled) {
      setStatus('disabled');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const supportedTypes =
          await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (cancelled) return;
        const probed = await probeLockStatus(
          hasHardware,
          isEnrolled,
          supportedTypes,
          true,
        );
        if (probed === 'unavailable') {
          setStatus('unavailable');
          return;
        }
        // probed === 'locked'
        // Pick the first non-iris type for the user-facing label
        // (iris is rare; Face/Touch are what users expect to see).
        const first =
          supportedTypes.find(
            (t) =>
              t === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION ||
              t === LocalAuthentication.AuthenticationType.FINGERPRINT,
          ) ?? supportedTypes[0];
        setBiometryName(biometryLabel(first));
        setStatus('locked');
      } catch (err) {
        // If the module throws, treat as unavailable rather than locking
        // the user out of their own app.
        console.warn('[biometric] probe failed:', err);
        if (!cancelled) setStatus('unavailable');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [biometricLockEnabled, settingsHydrated]);

  const unlock = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setStatus('authenticating');
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: biometryName
          ? `Unlock with ${biometryName}`
          : 'Unlock Uptime Pocket',
        // Show the cancel button explicitly on iOS so the user isn't
        // trapped if the prompt is up.
        cancelLabel: 'Cancel',
        // Don't allow the OS-level fallback passcode if the device has
        // no biometric enrolled — we already check isEnrolled above,
        // but this is a belt-and-suspenders for older iOS.
        disableDeviceFallback: false,
      });
      if (result.success) {
        setStatus('unlocked');
      } else if (result.error === 'user_cancel' || result.error === 'system_cancel') {
        // User dismissed — go back to 'locked' so the lock screen
        // renders the "Try again" button.
        setStatus('locked');
      } else {
        // Auth failed (e.g. wrong finger, locked out). Treat the same
        // as cancel for UI purposes.
        console.warn('[biometric] auth failed:', result.error);
        setStatus('locked');
      }
    } catch (err) {
      console.warn('[biometric] auth threw:', err);
      setStatus('locked');
    } finally {
      inFlightRef.current = false;
    }
  }, [biometryName]);

  // Auto-show the prompt whenever we enter 'locked'.
  useEffect(() => {
    if (status === 'locked') {
      void unlock();
    }
  }, [status, unlock]);

  // Re-lock on background → foreground transitions.
  useEffect(() => {
    if (!biometricLockEnabled) return;
    let lastBackgroundedAt: number | null = null;
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'background' || s === 'inactive') {
        lastBackgroundedAt = Date.now();
      } else if (s === 'active' && lastBackgroundedAt !== null) {
        const elapsed = Date.now() - lastBackgroundedAt;
        lastBackgroundedAt = null;
        if (elapsed >= LOCK_TIMEOUT_MS) {
          setStatus('locked');
        }
      }
    });
    return () => sub.remove();
  }, [biometricLockEnabled]);

  const lock = useCallback(() => {
    if (biometricLockEnabled) setStatus('locked');
  }, [biometricLockEnabled]);

  return { status, lock, unlock, biometryName };
}
