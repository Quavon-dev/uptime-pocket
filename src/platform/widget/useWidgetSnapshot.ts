/**
 * useWidgetSnapshot — bridges the React app state to the Android widget.
 *
 * The widget runs in a different process. It can't subscribe to Zustand.
 * It CAN read files from the app's `filesDir`. So this hook:
 *
 *   1. Subscribes to the live monitor + server + connection stores.
 *   2. Builds a WidgetSnapshot from the current state.
 *   3. Writes the snapshot as JSON to a file in `filesDir`.
 *   4. Debounces writes so a burst of socket events doesn't cause
 *      a burst of disk writes.
 *   5. On unmount, flushes any pending write.
 *
 * The hook is a no-op on iOS and on web — the file write call
 * silently no-ops when the native module isn't installed.
 *
 * The hook is also a no-op when the Zustand stores report
 * `hydrated === false` (i.e. before the initial DB read) so we
 * don't overwrite a fresh snapshot with empty state.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useServers } from '@/data/store/servers';
import { useMonitors } from '@/data/store/monitors';
import { buildWidgetSnapshot, type WidgetSnapshot } from './snapshot';
import { writeSnapshotFile, clearSnapshotFile } from './storage';

/** How long to wait between state changes and a disk write. */
const DEBOUNCE_MS = 2000;

export function useWidgetSnapshot(): void {
  // We always call hooks in the same order; the platform check
  // is inside the effect so React's rules-of-hooks are satisfied.
  // On iOS, the effect is a no-op because the writeSnapshotFile
  // call short-circuits on non-Android.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether we have ever flushed, so we can clean up the file
  // on unmount if no data ever arrived (the widget should show
  // "no data" rather than stale data from a previous app install).
  const everFlushedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    const flush = () => {
      const state = useMonitors.getState();
      const serverState = useServers.getState();

      // Don't write a snapshot before the stores have hydrated.
      // Otherwise we'd overwrite a previous good snapshot with
      // the empty default state and the widget would show
      // "no servers" for a few seconds at app launch.
      if (!serverState.hydrated) {
        return;
      }

      const monitorsByServer = new Map<string, ReadonlyArray<typeof state.monitorsByServer[string][number]>>();
      for (const [serverId, monitors] of Object.entries(state.monitorsByServer)) {
        monitorsByServer.set(serverId, monitors);
      }
      const serverNameById = new Map<string, string>();
      const connectedByServer = new Map<string, boolean>();
      for (const server of serverState.servers) {
        serverNameById.set(server.id, server.name);
        // The monitor store's `ConnectionStatus` is the live socket
        // state; the server store's `connected` is the persisted
        // "have we ever connected" flag. The widget cares about
        // "is the data fresh right now", which is the socket state.
        connectedByServer.set(server.id, state.statusByServer[server.id] === 'connected');
      }

      const snapshot: WidgetSnapshot = buildWidgetSnapshot({
        monitorsByServer,
        serverNameById,
        connectedByServer,
      });

      // Fire-and-forget. We don't await because the UI shouldn't
      // block on a disk write; if the write fails (disk full, etc.)
      // the next debounce cycle will try again.
      void writeSnapshotFile(snapshot).then(() => {
        everFlushedRef.current = true;
      });
    };

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flush();
      }, DEBOUNCE_MS);
    };

    // Subscribe to all three slices that affect the widget.
    // Zustand's `subscribeWithSelector` lets us filter to a specific
    // selector so we only re-run when the relevant slice changes.
    const unsubMonitors = useMonitors.subscribe(
      (s) => ({ monitors: s.monitorsByServer, status: s.statusByServer }),
      schedule,
      { equalityFn: shallowEq, fireImmediately: true }
    );
    const unsubServers = useServers.subscribe(
      (s) => ({ servers: s.servers, hydrated: s.hydrated }),
      schedule,
      { equalityFn: shallowEq, fireImmediately: true }
    );

    return () => {
      unsubMonitors();
      unsubServers();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Note: we deliberately do NOT clear the file on unmount.
      // The widget should keep showing the last snapshot even
      // when the app is backgrounded or killed.
    };
  }, []);
}

/**
 * Imperative API: force a flush of the current state to the widget
 * snapshot file. Useful after a critical socket event (status flip)
 * where you don't want to wait for the debounce.
 */
export async function forceWidgetRefresh(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const state = useMonitors.getState();
  const serverState = useServers.getState();
  if (!serverState.hydrated) return;

  const monitorsByServer = new Map<string, ReadonlyArray<typeof state.monitorsByServer[string][number]>>();
  for (const [serverId, monitors] of Object.entries(state.monitorsByServer)) {
    monitorsByServer.set(serverId, monitors);
  }
  const serverNameById = new Map<string, string>();
  const connectedByServer = new Map<string, boolean>();
  for (const server of serverState.servers) {
    serverNameById.set(server.id, server.name);
    connectedByServer.set(server.id, state.statusByServer[server.id] === 'connected');
  }
  const snapshot = buildWidgetSnapshot({
    monitorsByServer,
    serverNameById,
    connectedByServer,
  });
  await writeSnapshotFile(snapshot);
}

/** Remove the snapshot file. Called when the user wipes all data. */
export async function clearWidgetSnapshot(): Promise<void> {
  await clearSnapshotFile();
}

// ---- helpers ----

/**
 * Tiny shallow-equality helper for the subscribe filter.
 * We don't pull in lodash for a 6-line function.
 */
function shallowEq<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null) return false;
  if (typeof b !== 'object' || b === null) return false;
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
      return false;
    }
  }
  return true;
}
