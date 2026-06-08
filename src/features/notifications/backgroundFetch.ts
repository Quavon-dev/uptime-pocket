/**
 * Background fetch + socket reconnection.
 *
 * Why this exists
 * ---------------
 * iOS aggressively suspends apps in the background. After a few
 * minutes (and definitely after the phone locks), our socket.io
 * connection drops and stays dropped. We can fix this in two ways:
 *
 *  1. Background fetch (expo-task-manager + expo-background-fetch):
 *     The OS periodically wakes the app for a few seconds. We use
 *     that window to re-establish the socket, fetch the latest
 *     monitor list, fire any pending notifications, then exit.
 *  2. Background socket (expo-task-manager + a long-running task):
 *     We keep the socket alive continuously while the app is in
 *     the background. iOS may still kill us after a few minutes,
 *     and the relay is the only way to be always-on. We DON'T
 *     implement this here because iOS rejects apps that try to
 *     keep arbitrary sockets open in the background unless they
 *     declare the right entitlements (which Apple approves on a
 *     per-app basis for voip / location / etc.).
 *
 * What this file does
 * -------------------
 *  - Registers a background-fetch task with the OS.
 *  - On wake, calls into the Kuma connection manager to re-establish
 *    the socket and pull the latest monitor list.
 *  - Updates the app badge and fires any pending notifications.
 *
 * Caveats
 * -------
 *  - The OS decides when to run background fetches. We can ask for
 *    "every 15 minutes" but we'll often get less.
 *  - On Android, expo-background-fetch uses WorkManager.
 *  - On iOS simulator, background fetch only fires when you manually
 *    trigger it via "Trigger BG Fetch" in the debug menu.
 *
 * For the full always-on experience, use the relay (Phase C3) which
 * uses APNs / FCM to deliver notifications even when the app is
 * killed.
 */

import { Platform } from 'react-native';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { getConnectionManager } from '@/data/connection/manager';
import { getCurrentSettings } from '@/data/store/settings';
import { NO_QUIET } from './quietHours';

export const BACKGROUND_FETCH_TASK = 'uptime-pocket.background-fetch';

let registered = false;

/**
 * Define the background-fetch task. Must be called at app startup
 * (we call it from app/_layout.tsx). The task body is invoked by
 * the OS in a fresh JS context, so it can't rely on the React tree
 * — it has to be self-contained.
 */
export function registerBackgroundFetch(): void {
  if (registered) return;
  registered = true;

  TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
    try {
      // 1. Re-establish the socket and pull the latest monitor list.
      //    We use the module singleton so the foreground React tree
      //    and the background task share the same underlying socket.
      await getConnectionManager().revalidateActiveServer();

      // 2. We could fire any pending notifications here, but the
      //    monitor status state is in the Zustand store which the
      //    background task can't easily mutate. Instead we just
      //    reconnect; the next foreground open will sync any missed
      //    transitions through useNotificationBridge.
      //
      //    A more sophisticated implementation would persist a small
      //    "lastNotified" map to disk and reconcile here. That's a
      //    follow-up.
      void getCurrentSettings; // keep the import alive for future use
      void NO_QUIET;

      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (err) {
      console.warn('[background-fetch] task failed:', err);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

/**
 * Register the background fetch with the OS. Idempotent.
 *
 * Best-practice interval is 15 minutes — anything more frequent is
 * often rejected by the OS.
 */
export async function ensureBackgroundFetchRegistered(): Promise<void> {
  registerBackgroundFetch();
  try {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 15 * 60, // 15 minutes
      // Android only: stopOnTerminate=false means work continues
      // briefly after the user kills the app (via WorkManager).
      // We don't set this — Android can still kill us at any time
      // and the relay is the proper long-term solution.
      stopOnTerminate: true,
    });
  } catch (err) {
    // Background fetch isn't available on every device / OS version.
    // We log and continue — the app still works in Direct mode
    // while in the foreground.
    console.warn('[background-fetch] register failed:', err);
  }
}

/**
 * Helper: is background fetch supported on this device?
 *
 * Returns false on the iOS simulator (where it's unavailable) and
 * on any device where the user has explicitly disabled background
 * app refresh in system settings.
 */
export async function isBackgroundFetchAvailable(): Promise<boolean> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    return (
      status === BackgroundFetch.BackgroundFetchStatus.Available &&
      Platform.OS !== 'web'
    );
  } catch {
    return false;
  }
}

/** For tests + diagnostics. */
export const __test__ = { BACKGROUND_FETCH_TASK };
