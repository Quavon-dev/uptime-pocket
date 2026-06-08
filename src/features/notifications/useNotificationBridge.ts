/**
 * useNotificationBridge — glue between the monitors store and the
 * notification scheduler.
 *
 * Subscribes to every monitor in the active server. When a monitor's
 * status changes (up -> down or down -> up), it asks `decideNotify()`
 * whether to post a local notification, and if so, the scheduler
 * fires it.
 *
 * Why a hook?
 * -----------
 * The connection manager is the layer that talks to the Kuma socket.
 * We don't want the manager to import the notification API because
 * (a) that creates a circular dep, and (b) the manager should work
 * even if notifications are disabled.
 *
 * By doing the wiring in a hook, we can also cleanly gate it on
 * `biometricLock || settings.hydrated || activeServerId != null` etc.
 * without making the manager aware of those concerns.
 *
 * The hook lives at the app root, mounted once.
 */

import { useEffect, useRef } from 'react';
import { useServers, getActiveServer } from '@/data/store/servers';
import { useMonitors, selectMonitorsForServer } from '@/data/store/monitors';
import { useSettings } from '@/data/store/settings';
import { notifyStatus } from './scheduler';
import type { MonitorStateSnapshot, ServerSnapshot } from './decide';
import type { QuietWindow } from './quietHours';

function toQuietWindow(
  enabled: boolean,
  startMinute: number,
  endMinute: number
): QuietWindow {
  return { enabled, startMinute, endMinute };
}

function toServerSnapshot(s: ReturnType<typeof getActiveServer>): ServerSnapshot | null {
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    notificationMode: s.notificationMode,
  };
}

export function useNotificationBridge(): void {
  const servers = useServers((s) => s.servers);
  const activeId = useServers((s) => s.activeServerId);
  const monitors = useMonitors((s) =>
    activeId ? selectMonitorsForServer(s, activeId) : [],
  );
  const quietEnabled = useSettings((s) => s.quietHoursEnabled);
  const quietStart = useSettings((s) => s.quietHoursStartMinute);
  const quietEnd = useSettings((s) => s.quietHoursEndMinute);

  // We keep a per-monitor map of the last seen status so we can
  // detect transitions without re-notifying on every heartbeat.
  const lastStatusByMonitor = useRef<Map<number | string, string>>(new Map());

  const active = getActiveServer(servers, activeId);
  const serverSnap = toServerSnapshot(active);

  useEffect(() => {
    if (!serverSnap) return;
    const window = toQuietWindow(quietEnabled, quietStart, quietEnd);

    for (const m of monitors) {
      const prev = lastStatusByMonitor.current.get(m.id) ?? null;
      if (prev === m.status) continue; // no transition
      // First time we see this monitor (prev === null) we set the
      // baseline and DON'T notify — only real transitions count.
      if (prev === null) {
        lastStatusByMonitor.current.set(m.id, m.status);
        continue;
      }
      lastStatusByMonitor.current.set(m.id, m.status);
      const allSnapshots: MonitorStateSnapshot[] = monitors.map((mm) => ({
        id: mm.id,
        name: mm.name,
        status: mm.status as MonitorStateSnapshot['status'],
      }));
      void notifyStatus({
        server: serverSnap,
        monitor: {
          id: m.id,
          name: m.name,
          status: m.status as MonitorStateSnapshot['status'],
        },
        allMonitors: allSnapshots,
        previousStatus: prev as MonitorStateSnapshot['status'],
        now: new Date(),
        quietHours: window,
      });
    }
  }, [monitors, serverSnap, quietEnabled, quietStart, quietEnd]);
}
