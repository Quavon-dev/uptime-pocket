/**
 * useIncidentMonitorName — returns a function that resolves a monitorId
 * to its current name for a given server.
 *
 * The Incidents tab shows a list of status-change events. The event
 * payload only carries `monitorId` — to show a friendly name in the
 * list, we look it up against the current monitor cache. If the cache
 * is empty (monitor was removed, server just connected, etc.) we fall
 * back to `#<id>` so the UI never goes blank.
 *
 * Subscribes to the per-server monitor list so the names update live
 * (e.g. when a monitor is renamed on the Kuma side and we receive the
 * new monitorList).
 */

import { useCallback } from 'react';
import { useMonitors } from '@/data/store/monitors';

export function useMonitorsStoreForMonitorName(
  serverId: string | undefined
): (monitorId: number) => string {
  const list = useMonitors((s) =>
    serverId ? s.monitorsByServer[serverId] : undefined
  );

  return useCallback(
    (monitorId: number) => {
      const found = list?.find((m) => m.id === monitorId);
      return found ? found.name : `#${monitorId}`;
    },
    [list]
  );
}
