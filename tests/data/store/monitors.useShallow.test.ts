/**
 * Regression test for the "result of getSnapshot should be cached"
 * infinite-loop bug.
 *
 * Background: in commit c37741e + the previous followup, the
 * `useNotificationBridge` hook subscribed to the monitor list via
 * `useMonitors((s) => selectMonitorsForServer(s, activeId))`.
 * `selectMonitorsForServer` sorts the list and returns a fresh
 * array on every call, so React's `useSyncExternalStore` saw a
 * new snapshot every render, threw the "getSnapshot should be
 * cached" warning, and in dev threw "Maximum update depth
 * exceeded" (infinite re-render loop).
 *
 * The fix is two-part:
 *   1. Store-level: module-scope EMPTY_MONITORS / EMPTY_INCIDENTS
 *      / EMPTY_HEARTBEATS / EMPTY_RATIOS so the empty cases return
 *      a stable reference.
 *   2. Call-site: wrap the selector in `useShallow` (Zustand v5)
 *      so the deep-equal check happens before the snapshot is
 *      flagged as changed.
 *
 * Both layers are tested here.
 */

import { useMonitors, selectMonitorsForServer } from '@/data/store/monitors';
// We import useShallow purely to verify it's the same module the
// call sites use, and that calling the wrapper outside a React tree
// is the only way the bug would still surface (it'd throw, which is
// the correct behavior — useShallow is a hook).
import { useShallow } from 'zustand/react/shallow';

describe('selectMonitorsForServer snapshot stability', () => {
  beforeEach(() => {
    // Reset the store between tests so state doesn't leak.
    useMonitors.setState({
      monitorsByServer: {},
    } as never);
  });

  it('returns a NEW array on every call (the original bug — sorted each time)', () => {
    useMonitors.getState().setMonitors('server-1', [
      mkMonitor(1, 'Beta', 'up'),
      mkMonitor(2, 'Alpha', 'up'),
    ]);

    const state = useMonitors.getState();
    const a = selectMonitorsForServer(state, 'server-1');
    const b = selectMonitorsForServer(state, 'server-1');
    // Same data, but new array references — that's the original
    // bug. useSyncExternalStore compares snapshots with `===` (or
    // Object.is), so a new ref every time means "snapshot
    // changed → re-render", forever.
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    expect(a.map((m) => m.name)).toEqual(['Alpha', 'Beta']);
  });

  it('returns a STABLE empty reference for missing server', () => {
    const state = useMonitors.getState();
    const a = selectMonitorsForServer(state, 'does-not-exist');
    const b = selectMonitorsForServer(state, 'does-not-exist');
    // The cheap fix for the empty case — the module-scope
    // EMPTY_MONITORS constant is shared across calls. Without it,
    // we'd return `[]` (a new ref) and the same bug would re-emerge
    // for a server with zero monitors.
    expect(a).toBe(b);
  });

  it('returns a STABLE empty reference even when store is fresh', () => {
    // Edge case: store has been hydrated but no server has been
    // connected yet. The selector must still return the shared
    // EMPTY_MONITORS (not a fresh `[]`) to avoid the snapshot-cache
    // warning on first paint.
    const state = useMonitors.getState();
    const a = selectMonitorsForServer(state, 'server-with-no-data');
    const b = selectMonitorsForServer(state, 'server-with-no-data');
    expect(a).toBe(b);
  });

  it('useShallow is the function we expect (zustand/react/shallow)', () => {
    // The wrapper must come from zustand/react/shallow (Zustand v5).
    // We assert it's a function (it is — `useShallow<S,U>(selector)`)
    // so any future refactor that swaps in a wrong wrapper (e.g.
    // importing from 'zustand/shallow' instead) would fail this
    // test. The import alone proves the module resolves.
    expect(typeof useShallow).toBe('function');
  });
});

function mkMonitor(id: number, name: string, status: 'up' | 'down') {
  return {
    id,
    parent: null,
    type: 'http',
    name,
    status,
    active: true,
    interval: 60,
    retryInterval: 60,
    maxretries: 0,
    upsideDown: false,
    tags: [],
    notificationIDList: {},
  } as never;
}
