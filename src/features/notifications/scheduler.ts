/**
 * Notification scheduler.
 *
 * Wires the pure `decideNotify()` decision function to the side-effecting
 * `expo-notifications` API. Sets up the Android channel, requests
 * permission, and posts local notifications + updates the app badge
 * when a monitor transitions state.
 *
 * Permission
 * ----------
 * On iOS, we request permission on first monitor transition (not on
 * app start) — this is the recommended pattern; asking on first run
 * gets denied 80%+ of the time. We only ask if the user has set
 * notificationMode != 'none' on any server, and we only ask once.
 *
 * On Android 13+ the same prompt fires via expo-notifications.
 * On Android 12 and below, no prompt is needed (notifications are
 * enabled by default at install time).
 *
 * Channel
 * -------
 * Android requires every notification to be assigned to a "channel".
 * We use a single 'monitors' channel with high importance so that
 * the OS shows our notifications as heads-up popups. Sound is on.
 * Vibration is on. The user can change the importance level in
 * Android system settings; we don't override that.
 *
 * Idempotency
 * -----------
 * The decision function handles "no transition" (e.g. up->up) by
 * returning shouldNotify=false, so it's safe to call `notifyStatus()`
 * on every socket event. The scheduler does NOT deduplicate further
 * — that would be premature optimization at this scale.
 *
 * Background mode
 * ---------------
 * In v1 this only works while the app is in the foreground. The
 * socket may continue receiving events for a few minutes after
 * backgrounding (until the OS suspends us), which is enough for the
 * common case. For always-on background, see docs/notifications.md
 * and the Phase B2 background-fetch work.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { decideNotify, type DecideNotifyArgs } from './decide';
import { t, tn } from '@/i18n';

const ANDROID_CHANNEL_ID = 'monitors';
const ANDROID_CHANNEL_NAME = 'Monitors';
const PERMISSION_REQUESTED_KEY = 'uptime-pocket.notify.permissionRequested';

/**
 * Build the localized copy callbacks expected by `decideNotify()`.
 * Lives in the side-effectful layer so we can call i18n here.
 */
function buildCopy(): DecideNotifyArgs['copy'] {
  return {
    downTitle: (serverName, monitorName) => ({
      title: tn('notifications.copy.downTitle', { monitor: monitorName }),
      body: tn('notifications.copy.downBody', { monitor: monitorName, server: serverName }),
    }),
    recoveredTitle: (serverName, monitorName) => ({
      title: tn('notifications.copy.recoveredTitle', { monitor: monitorName }),
      body: tn('notifications.copy.recoveredBody', {
        monitor: monitorName,
        server: serverName,
      }),
    }),
    criticalTitle: (count) => ({
      title: tn('notifications.copy.criticalTitle', { count }),
      body: t('notifications.copy.criticalBody'),
    }),
  };
}

let channelEnsured = false;
/** Idempotent — sets up the Android channel. No-op on iOS. */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (channelEnsured) return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: ANDROID_CHANNEL_NAME,
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250],
    showBadge: true,
  });
  channelEnsured = true;
}

/**
 * Request permission the first time we need it. Subsequent calls are
 * no-ops, so the caller can fire this on every event without nagging
 * the user.
 */
let permissionRequested = false;
export async function ensurePermission(): Promise<boolean> {
  if (permissionRequested) {
    // We may have already cached the result. Re-check.
    const cur = await Notifications.getPermissionsAsync();
    return cur.granted || cur.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  }
  permissionRequested = true;
  await ensureAndroidChannel();
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted || cur.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  const req = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      allowDisplayInCarPlay: false,
    },
  });
  return req.granted;
}

/**
 * Main entry point. Call this on every monitor-status change event
 * from the Kuma socket. The function:
 *   1. Decides whether to notify (pure function, fully testable)
 *   2. If yes, ensures the channel + permission, then posts a
 *      local notification and updates the app badge
 *   3. Returns the decision so the caller can log or assert
 */
export async function notifyStatus(
  args: Omit<DecideNotifyArgs, 'copy'>
): Promise<ReturnType<typeof decideNotify>> {
  const decision = decideNotify({ ...args, copy: buildCopy() });
  if (!decision.shouldNotify) return decision;

  const ok = await ensurePermission();
  if (!ok) return decision;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: decision.title,
      body: decision.body,
      sound: 'default',
      // data field is what the response listener gets when the user
      // taps the notification. We use it to deep-link into the
      // monitor detail screen.
      data: {
        kind: 'monitor-status',
        // Server/monitor ids are NOT in DecideNotifyArgs by design
        // (the scheduler doesn't need them to make the decision).
        // They are in the surrounding socket event, which the caller
        // is responsible for attaching here in a follow-up. For now
        // we just emit the title/body.
      },
    },
    trigger: null, // immediate
  });

  if (decision.downCountAfter > 0) {
    await Notifications.setBadgeCountAsync(decision.downCountAfter);
  } else {
    await Notifications.setBadgeCountAsync(0);
  }

  return decision;
}

/** Clear the app badge (e.g. when the user opens the app). */
export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0).catch(() => {});
}

// Re-export the constant for tests that need to know we've asked.
export const __test__ = { PERMISSION_REQUESTED_KEY };
