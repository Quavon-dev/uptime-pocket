/**
 * Pure notification decision logic.
 *
 * Given a Kuma socket event, a server config, the user's quiet-hours
 * setting, and the current set of monitor states, decide:
 *   - Should we post a local notification?
 *   - If so, what title + body should it have?
 *   - Should we update the app icon badge?
 *
 * Extracted from the side-effecting scheduler (./scheduler.ts) so we
 * can unit-test every edge case without touching expo-notifications.
 *
 * Events handled
 * --------------
 * - monitor_status: monitor changed from up to down (or vice versa)
 * - heartbeat: a new ping arrived (we use it to detect rapid up<->down
 *   flips for flapping detection — but in v1 we just notify on the
 *   first transition; flap detection lives in a follow-up)
 *
 * Quiet hours
 * -----------
 * If the current local time falls inside the user's quiet window
 * (which can wrap midnight), we suppress the notification. Critical
 * events (more than N monitors down at once) bypass quiet hours.
 *
 * Critical-threshold semantics
 * ----------------------------
 * "Critical" = at least 3 monitors are down at the same time. This
 * is a heuristic — if 3+ things break simultaneously it's likely
 * something infrastructure-level (your Kuma's database, your network,
 * your cloud) rather than a single flapping monitor, so we always
 * notify regardless of quiet hours.
 */

import { isWithinQuietHours, type QuietWindow } from './quietHours';

export type MonitorStatusKind = 'up' | 'down' | 'pending' | 'maintenance' | 'paused';

export interface MonitorStateSnapshot {
  id: number | string;
  name: string;
  status: MonitorStatusKind;
}

export interface ServerSnapshot {
  id: string;
  name: string;
  /** Per-server notification mode. 'none' means the user has opted
   *  out of notifications for this server; we skip them. */
  notificationMode: 'none' | 'direct' | 'relay';
}

export interface NotifyCopy {
  title: string;
  body: string;
}

export interface DecideNotifyArgs {
  server: ServerSnapshot;
  monitor: MonitorStateSnapshot;
  /** All monitor states for the server (used to count how many are down). */
  allMonitors: readonly MonitorStateSnapshot[];
  /** Previous status for the same monitor. If the event is a no-op
   *  transition (e.g. up -> up), the caller should not call us at
   *  all. This is just for safety. */
  previousStatus: MonitorStatusKind | null;
  /** Local time, in the user's local timezone. The caller (UI) is
   *  responsible for providing this so we can stay pure. */
  now: Date;
  quietHours: QuietWindow;
  /** Hard threshold: if >= this many monitors are down, bypass quiet
   *  hours. Default 3. */
  criticalThreshold?: number;
  /** Localized strings for the notification copy. Provided by the
   *  caller (which has i18n) so this module stays free of React/i18n
   *  imports and is trivially unit-testable. */
  copy: {
    downTitle: (serverName: string, monitorName: string) => NotifyCopy;
    recoveredTitle: (serverName: string, monitorName: string) => NotifyCopy;
    criticalTitle: (count: number) => NotifyCopy;
  };
}

export interface NotifyDecision {
  /** Whether to post a local notification. */
  shouldNotify: boolean;
  /** Why we're (not) posting — useful for logging + tests. */
  reason:
    | 'mode-off'
    | 'no-transition'
    | 'recovered'
    | 'down'
    | 'quiet-hours'
    | 'critical'
    | 'recovered-quiet';
  title: string;
  body: string;
  /** The number of currently-down monitors AFTER this transition.
   *  Used by the scheduler to update the app badge. */
  downCountAfter: number;
}

const DEFAULT_CRITICAL_THRESHOLD = 3;

export function decideNotify(args: DecideNotifyArgs): NotifyDecision {
  const {
    server,
    monitor,
    allMonitors,
    previousStatus,
    now,
    quietHours,
    criticalThreshold = DEFAULT_CRITICAL_THRESHOLD,
    copy,
  } = args;

  const downCountAfter = allMonitors.filter((m) => m.status === 'down').length;

  // 1. Server is in 'off' mode — never notify.
  if (server.notificationMode === 'none') {
    return skip('mode-off', downCountAfter);
  }

  // 2. No transition (caller should not have called us, but be safe).
  if (previousStatus === monitor.status) {
    return skip('no-transition', downCountAfter);
  }

  // 3. Recovered: down/pending -> up.
  if (monitor.status === 'up') {
    const inQuiet = isWithinQuietHours(now, quietHours);
    const c = copy.recoveredTitle(server.name, monitor.name);
    if (inQuiet) {
      return {
        shouldNotify: false,
        reason: 'recovered-quiet',
        title: c.title,
        body: c.body,
        downCountAfter,
      };
    }
    return {
      shouldNotify: true,
      reason: 'recovered',
      title: c.title,
      body: c.body,
      downCountAfter,
    };
  }

  // 4. Went down (up/pending -> down). Decide if it's critical.
  if (monitor.status === 'down') {
    const inQuiet = isWithinQuietHours(now, quietHours);
    const isCritical = downCountAfter >= criticalThreshold;
    if (inQuiet && !isCritical) {
      const c = copy.downTitle(server.name, monitor.name);
      return {
        shouldNotify: false,
        reason: 'quiet-hours',
        title: c.title,
        body: c.body,
        downCountAfter,
      };
    }
    const title = isCritical
      ? copy.criticalTitle(downCountAfter).title
      : copy.downTitle(server.name, monitor.name).title;
    const body = copy.downTitle(server.name, monitor.name).body;
    return {
      shouldNotify: true,
      reason: isCritical ? 'critical' : 'down',
      title,
      body,
      downCountAfter,
    };
  }

  // 5. Other transitions (e.g. -> maintenance, -> paused) — silent.
  return skip('no-transition', downCountAfter);
}

function skip(
  reason: NotifyDecision['reason'],
  downCountAfter: number
): NotifyDecision {
  return {
    shouldNotify: false,
    reason,
    title: '',
    body: '',
    downCountAfter,
  };
}
