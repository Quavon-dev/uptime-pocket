/**
 * Widget snapshot — the data shape the Android home-screen widget reads
 * from disk to render.
 *
 * Why a file (not SQLite)?
 * ------------------------
 * The Android widget runs in a different process from the main app. They
 * can both read the app's `filesDir`, but coordinating SQLite writes
 * across two processes (with WAL mode and a busy timeout) is more code
 * and more bug surface than just writing a tiny JSON snapshot.
 *
 * The snapshot is:
 *   - small (<10 KB even with 50 monitors per server × 5 servers)
 *   - written at most every 2 seconds (debounced in the hook)
 *   - read-only for the widget (it never writes back)
 *   - missing files are treated as "no data" (widget shows a placeholder)
 *
 * We keep the shape narrow and stable so changes to the rest of the app
 * (new fields on Monitor, new connection states) don't silently break
 * the widget. Anything the widget doesn't know how to render simply
 * doesn't appear in the snapshot.
 */
import type { Monitor, MonitorStatus } from '@/domain/models';

/**
 * A trimmed monitor — only the fields the widget actually uses.
 * The widget doesn't care about tags, notification lists, or
 * retry intervals; it only cares about "what's the status, what
 * is it called, when did we last check it".
 */
export interface WidgetMonitor {
  /** Stable ID. We use `${serverId}::${monitor.id}` so two servers
   *  can't collide if both have a monitor with id 1. */
  id: string;
  /** Display name (truncated by the widget if too long). */
  name: string;
  /** Current status. */
  status: MonitorStatus;
  /** When the app last got a heartbeat for this monitor. Unix ms. */
  lastCheckAt: number | null;
  /** Most recent response time in ms, if known. */
  responseTime: number | null;
  /** Server label, prefixed to the monitor name on the widget
   *  so users can tell which Kuma instance a row came from. */
  serverLabel: string;
}

/**
 * A trimmed server — connection state + a flat list of monitors.
 * We flatten so the widget doesn't have to do a two-level traversal
 * (it can just iterate the monitors array).
 */
export interface WidgetServer {
  id: string;
  name: string;
  connected: boolean;
  /** Worst status across the server's monitors, used for the
   *  server dot. If no monitors, 'pending'. */
  worstStatus: MonitorStatus;
  /** Cap at 20 monitors per server to keep the snapshot small
   *  even with hundreds of total monitors across servers. */
  monitors: WidgetMonitor[];
}

/**
 * Top-level snapshot written to disk. Bounded size, no PII.
 */
export interface WidgetSnapshot {
  /** When the snapshot was written. The widget uses this to show
   *  "last updated 3m ago" if the app process is no longer
   *  pushing fresh data. */
  generatedAt: number;
  /** Schema version. Bump if the shape changes incompatibly. */
  version: 1;
  /** Sorted by server name for deterministic disk output. */
  servers: WidgetServer[];
}

/** Worst-status ordering: down > pending > maintenance > paused > up. */
const WORST_STATUS_RANK: Record<MonitorStatus, number> = {
  down: 5,
  pending: 4,
  maintenance: 3,
  paused: 2,
  up: 1,
};

/** Pick the worst status from a list of monitors. */
export function worstStatus(monitors: ReadonlyArray<Monitor>): MonitorStatus {
  let worst: MonitorStatus = 'up';
  for (const m of monitors) {
    if (WORST_STATUS_RANK[m.status] > WORST_STATUS_RANK[worst]) {
      worst = m.status;
    }
  }
  return worst;
}

/**
 * Build a snapshot from the live in-memory state.
 *
 * The caller passes in a `Map<serverId, Monitor[]>` (the same shape
 * that lives in the Zustand `monitorsByServer` slice) and a parallel
 * map of connection statuses. We never read from Zustand directly
 * here — this is a pure function so it can be unit-tested without
 * a React tree.
 */
export interface BuildSnapshotInput {
  monitorsByServer: ReadonlyMap<string, ReadonlyArray<Monitor>>;
  serverNameById: ReadonlyMap<string, string>;
  connectedByServer: ReadonlyMap<string, boolean>;
  /** Cap per server. Default 20. */
  maxMonitorsPerServer?: number;
  /** Cap total. Default 100 (5 servers × 20 monitors). */
  maxMonitorsTotal?: number;
}

export function buildWidgetSnapshot(input: BuildSnapshotInput): WidgetSnapshot {
  const maxPer = input.maxMonitorsPerServer ?? 20;
  const maxTotal = input.maxMonitorsTotal ?? 100;

  const servers: WidgetServer[] = [];
  let remaining = maxTotal;

  // Sort server IDs for deterministic output.
  const sortedServerIds = Array.from(input.monitorsByServer.keys()).sort();

  for (const serverId of sortedServerIds) {
    if (remaining <= 0) break;
    const monitors = input.monitorsByServer.get(serverId) ?? [];
    const serverName = input.serverNameById.get(serverId) ?? serverId;
    const connected = input.connectedByServer.get(serverId) ?? false;

    // Sort monitors: down first, then by lastCheckAt desc. This way
    // the most-actionable items appear at the top of the widget.
    const sortedMonitors = [...monitors].sort((a, b) => {
      const rankDiff =
        WORST_STATUS_RANK[b.status] - WORST_STATUS_RANK[a.status];
      if (rankDiff !== 0) return rankDiff;
      const aTime = a.lastCheckAt?.getTime() ?? 0;
      const bTime = b.lastCheckAt?.getTime() ?? 0;
      return bTime - aTime;
    });

    const trimmed = sortedMonitors.slice(0, Math.min(maxPer, remaining));
    remaining -= trimmed.length;

    const widgetMonitors: WidgetMonitor[] = trimmed.map((m) => ({
      id: `${serverId}::${m.id}`,
      name: m.name,
      status: m.status,
      lastCheckAt: m.lastCheckAt?.getTime() ?? null,
      responseTime: m.responseTime ?? null,
      serverLabel: serverName,
    }));

    servers.push({
      id: serverId,
      name: serverName,
      connected,
      worstStatus: monitors.length > 0 ? worstStatus(monitors) : 'pending',
      monitors: widgetMonitors,
    });
  }

  return {
    generatedAt: Date.now(),
    version: 1,
    servers,
  };
}
