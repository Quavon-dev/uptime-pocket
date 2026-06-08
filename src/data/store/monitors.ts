/**
 * Live monitor store.
 *
 * The Kuma connection manager pushes events here. UI components
 * subscribe to the relevant slices.
 *
 * What lives here:
 *   - Map<serverId, Monitor[]>   — the current monitor list per server
 *   - Map<serverId, ConnectionStatus> — connected | reconnecting | disconnected
 *   - Map<serverId, number>      — last heartbeat timestamp per server
 *   - Map<serverId, Incident[]>  — recent incidents per server
 *
 * Out of scope here:
 *   - Heartbeat history / response time series (those come in
 *     Phase 3, when we add the chart data path).
 *   - User actions (pause/resume) — those are forwarded through the
 *     manager to the socket, not stored here.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  Monitor,
  MonitorStatus,
  Incident,
} from '@/domain/models';
import type {
  NormalizedHeartbeatRow,
  KumaServerInfo,
  KumaCertInfo,
} from '@/data/socket/normalize';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface ServerMonitorsState {
  /** Per server: the latest monitor list. */
  monitorsByServer: Record<string, Monitor[]>;
  /** Per server: current connection status. */
  statusByServer: Record<string, ConnectionStatus>;
  /** Per server: last error message if status is 'error'. */
  errorByServer: Record<string, string | null>;
  /** Per server: recent incidents (capped at 50 most recent). */
  incidentsByServer: Record<string, Incident[]>;
  /**
   * Per server, per monitor: the most recent heartbeat rows from
   * Kuma's `heartbeatList` socket event (~100 rows on connect,
   * sorted oldest-first).
   */
  heartbeatHistoryByServer: Record<string, Record<number, NormalizedHeartbeatRow[]>>;
  /**
   * Per server, per monitor: the latest uptime ratios from Kuma's
   * `uptime` socket event. Keys are window labels: '24' | '168'
   * | '720' | '1y'. Values are 0-1 ratios.
   */
  uptimeByServer: Record<
    string,
    Record<
      number,
      Partial<Record<'24' | '168' | '720' | '1y', number>>
    >
  >;
  /**
   * Per server: the `info` event payload (server version, timezone, etc.).
   * Used to surface "Kuma X.Y.Z" + "Update available" in the servers tab.
   */
  infoByServer: Record<string, KumaServerInfo>;
  /**
   * Per server, per monitor: the 24h average ping in ms. Kuma pushes
   * this once on connect via the `avgPing` event.
   */
  avgPingByServer: Record<string, Record<number, number | null>>;
  /**
   * Per server, per monitor: the latest cert info Kuma has for HTTPS
   * monitors. null if the monitor isn't HTTPS, the cert check failed,
   * or Kuma hasn't pushed it yet.
   */
  certInfoByServer: Record<string, Record<number, KumaCertInfo | null>>;
  /**
   * Per server, per monitor: domain-expiry info for domain monitors.
   * null if the monitor isn't a domain monitor, the check failed,
   * or Kuma hasn't pushed it yet.
   */
  domainInfoByServer: Record<
    string,
    Record<
      number,
      {
        daysRemaining: number | null;
        expiresOn: string | null;
      } | null
    >
  >;

  // ---- Mutators (called by the connection manager) ----
  setStatus: (serverId: string, status: ConnectionStatus, error?: string | null) => void;
  setMonitors: (serverId: string, monitors: Monitor[]) => void;
  updateMonitor: (serverId: string, monitorId: number, monitor: Monitor) => void;
  deleteMonitor: (serverId: string, monitorId: number) => void;
  updateMonitorStatus: (
    serverId: string,
    monitorId: number,
    status: MonitorStatus,
    timestamp?: number
  ) => void;
  updateMonitorHeartbeat: (
    serverId: string,
    monitorId: number,
    status: MonitorStatus,
    responseTime: number,
    timestamp: number
  ) => void;
  addIncident: (serverId: string, incident: Incident) => void;
  /**
   * Cache heartbeat-history rows for a monitor (Kuma 2.3+).
   * @param overwrite when true (the original Kuma behavior when
   *   `overwrite=true` is passed in the event), REPLACE the existing
   *   cache. When false (the default), the incoming rows are
   *   prepended to the existing cache (oldest-first). This matches
   *   the Kuma SPA's own handling in `src/mixins/socket.js:236-242`.
   */
  setHeartbeatHistory: (
    serverId: string,
    monitorId: number,
    rows: NormalizedHeartbeatRow[],
    overwrite?: boolean
  ) => void;
  /** Cache an uptime ratio for a monitor + window (Kuma 2.3+). */
  setUptimeRatio: (
    serverId: string,
    monitorId: number,
    hours: '24' | '168' | '720' | '1y',
    ratio: number
  ) => void;
  setInfo: (serverId: string, info: KumaServerInfo) => void;
  setAvgPing: (serverId: string, monitorId: number, ping: number | null) => void;
  setCertInfo: (serverId: string, monitorId: number, info: KumaCertInfo) => void;
  setDomainInfo: (
    serverId: string,
    monitorId: number,
    daysRemaining: number | null,
    expiresOn: string | null
  ) => void;
  clearServer: (serverId: string) => void;
}

const INCIDENT_LIMIT = 50;

export const useMonitors = create<ServerMonitorsState>()(
  subscribeWithSelector((set) => ({
    monitorsByServer: {},
    statusByServer: {},
    errorByServer: {},
    incidentsByServer: {},
    heartbeatHistoryByServer: {},
    uptimeByServer: {},
    infoByServer: {},
    avgPingByServer: {},
    certInfoByServer: {},
    domainInfoByServer: {},

    setStatus: (serverId, status, error = null) =>
      set((state) => ({
        statusByServer: { ...state.statusByServer, [serverId]: status },
        errorByServer: { ...state.errorByServer, [serverId]: error },
      })),

    setMonitors: (serverId, monitors) =>
      set((state) => ({
        monitorsByServer: { ...state.monitorsByServer, [serverId]: monitors },
      })),

    updateMonitor: (serverId, monitorId, monitor) =>
      set((state) => {
        const list = state.monitorsByServer[serverId];
        if (!list) return state;
        return {
          monitorsByServer: {
            ...state.monitorsByServer,
            [serverId]: list.map((m) => (m.id === monitorId ? monitor : m)),
          },
        };
      }),

    deleteMonitor: (serverId, monitorId) =>
      set((state) => {
        const list = state.monitorsByServer[serverId];
        if (!list) return state;
        return {
          monitorsByServer: {
            ...state.monitorsByServer,
            [serverId]: list.filter((m) => m.id !== monitorId),
          },
        };
      }),

    updateMonitorStatus: (serverId, monitorId, status, timestamp) =>
      set((state) => {
        const list = state.monitorsByServer[serverId];
        if (!list) return state;
        return {
          monitorsByServer: {
            ...state.monitorsByServer,
            [serverId]: list.map((m) =>
              m.id === monitorId
                ? {
                    ...m,
                    status,
                    lastCheckAt: timestamp ? new Date(timestamp) : m.lastCheckAt,
                  }
                : m
            ),
          },
        };
      }),

    updateMonitorHeartbeat: (serverId, monitorId, status, responseTime, timestamp) =>
      set((state) => {
        const list = state.monitorsByServer[serverId];
        if (!list) return state;
        return {
          monitorsByServer: {
            ...state.monitorsByServer,
            [serverId]: list.map((m) =>
              m.id === monitorId
                ? {
                    ...m,
                    status,
                    responseTime,
                    lastCheckAt: new Date(timestamp),
                  }
                : m
            ),
          },
        };
      }),

    addIncident: (serverId, incident) =>
      set((state) => {
        const list = state.incidentsByServer[serverId] ?? [];
        return {
          incidentsByServer: {
            ...state.incidentsByServer,
            [serverId]: [incident, ...list].slice(0, INCIDENT_LIMIT),
          },
        };
      }),

    setHeartbeatHistory: (serverId, monitorId, rows, overwrite = false) =>
      set((state) => {
        const perServer = { ...(state.heartbeatHistoryByServer[serverId] ?? {}) };
        if (overwrite) {
          // Kuma's heartbeatList(overwrite=true) — replace.
          perServer[monitorId] = rows;
        } else {
          // Kuma's default (overwrite=false) — prepend, then de-dup by
          // timestamp so live `heartbeat` events that landed between
          // bursts don't double up.
          const existing = perServer[monitorId] ?? [];
          const seen = new Set<number>();
          const merged: NormalizedHeartbeatRow[] = [];
          // Iterate newest-first (rows come from Kuma newest-first
          // when concat'd to the front), but our normalizer already
          // sorts oldest-first, so iterate normally.
          for (const r of [...rows, ...existing]) {
            if (seen.has(r.timestamp)) continue;
            seen.add(r.timestamp);
            merged.push(r);
          }
          // Cap to the 100 most-recent rows (matches Kuma's own cap).
          const capped = merged
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-100);
          perServer[monitorId] = capped;
        }
        return {
          heartbeatHistoryByServer: {
            ...state.heartbeatHistoryByServer,
            [serverId]: perServer,
          },
        };
      }),

    setUptimeRatio: (serverId, monitorId, hours, ratio) =>
      set((state) => {
        const perServer = { ...(state.uptimeByServer[serverId] ?? {}) };
        const perMonitor = { ...(perServer[monitorId] ?? {}) };
        perMonitor[hours] = ratio;
        perServer[monitorId] = perMonitor;
        return {
          uptimeByServer: {
            ...state.uptimeByServer,
            [serverId]: perServer,
          },
        };
      }),

    setInfo: (serverId, info) =>
      set((state) => ({
        infoByServer: { ...state.infoByServer, [serverId]: info },
      })),

    setAvgPing: (serverId, monitorId, ping) =>
      set((state) => {
        const perServer = { ...(state.avgPingByServer[serverId] ?? {}) };
        perServer[monitorId] = ping;
        return {
          avgPingByServer: {
            ...state.avgPingByServer,
            [serverId]: perServer,
          },
        };
      }),

    setCertInfo: (serverId, monitorId, info) =>
      set((state) => {
        const perServer = { ...(state.certInfoByServer[serverId] ?? {}) };
        perServer[monitorId] = info;
        return {
          certInfoByServer: {
            ...state.certInfoByServer,
            [serverId]: perServer,
          },
        };
      }),

    setDomainInfo: (serverId, monitorId, daysRemaining, expiresOn) =>
      set((state) => {
        const perServer = { ...(state.domainInfoByServer[serverId] ?? {}) };
        perServer[monitorId] = { daysRemaining, expiresOn };
        return {
          domainInfoByServer: {
            ...state.domainInfoByServer,
            [serverId]: perServer,
          },
        };
      }),

    clearServer: (serverId) =>
      set((state) => {
        const { [serverId]: _m, ...monitorsByServer } = state.monitorsByServer;
        const { [serverId]: _s, ...statusByServer } = state.statusByServer;
        const { [serverId]: _e, ...errorByServer } = state.errorByServer;
        const { [serverId]: _i, ...incidentsByServer } = state.incidentsByServer;
        const { [serverId]: _h, ...heartbeatHistoryByServer } = state.heartbeatHistoryByServer;
        const { [serverId]: _u, ...uptimeByServer } = state.uptimeByServer;
        const { [serverId]: _info, ...infoByServer } = state.infoByServer;
        const { [serverId]: _ap, ...avgPingByServer } = state.avgPingByServer;
        const { [serverId]: _ci, ...certInfoByServer } = state.certInfoByServer;
        const { [serverId]: _di, ...domainInfoByServer } = state.domainInfoByServer;
        return {
          monitorsByServer,
          statusByServer,
          errorByServer,
          incidentsByServer,
          heartbeatHistoryByServer,
          uptimeByServer,
          infoByServer,
          avgPingByServer,
          certInfoByServer,
          domainInfoByServer,
        };
      }),
  }))
);

// ---- Selectors ----

/** Get monitors for a specific server, sorted by name. */
export function selectMonitorsForServer(state: ServerMonitorsState, serverId: string): Monitor[] {
  const list = state.monitorsByServer[serverId];
  if (!list) return [];
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Find a monitor by its (numeric) id across all servers.
 *
 * The detail screen receives a monitorId from the URL, but doesn't know
 * which server it came from (e.g. after a server switch, the user might
 * still have the old detail screen open). We look across every server
 * the user has loaded and return the first match along with its serverId,
 * so the caller can scope further lookups.
 */
export function selectMonitorByIdAnyServer(
  state: ServerMonitorsState,
  monitorId: number
): { monitor: Monitor; serverId: string } | null {
  for (const [serverId, list] of Object.entries(state.monitorsByServer)) {
    const found = list.find((m) => m.id === monitorId);
    if (found) return { monitor: found, serverId };
  }
  return null;
}

/** Get incidents for a specific server. */
export function selectIncidentsForServer(
  state: ServerMonitorsState,
  serverId: string
): Incident[] {
  return state.incidentsByServer[serverId] ?? [];
}

/** Get incidents for a specific monitor on a specific server. */
export function selectIncidentsForMonitor(
  state: ServerMonitorsState,
  serverId: string,
  monitorId: number
): Incident[] {
  const all = state.incidentsByServer[serverId] ?? [];
  return all.filter((i) => i.monitorId === monitorId);
}

/** Get cached heartbeat-history rows for a monitor. */
export function selectHeartbeatHistory(
  state: ServerMonitorsState,
  serverId: string,
  monitorId: number
) {
  return state.heartbeatHistoryByServer[serverId]?.[monitorId] ?? [];
}

/** Get the cached uptime ratios for a monitor. */
export function selectUptimeRatios(
  state: ServerMonitorsState,
  serverId: string,
  monitorId: number
): Partial<Record<'24' | '168' | '720' | '1y', number>> {
  return state.uptimeByServer[serverId]?.[monitorId] ?? {};
}

/** Get the `info` event payload for a server (version, timezone, etc.). */
export function selectServerInfo(
  state: ServerMonitorsState,
  serverId: string
): KumaServerInfo | null {
  return state.infoByServer[serverId] ?? null;
}

/** Get the 24h average ping for a monitor, or null if not yet known. */
export function selectAvgPing(
  state: ServerMonitorsState,
  serverId: string,
  monitorId: number
): number | null {
  return state.avgPingByServer[serverId]?.[monitorId] ?? null;
}

/** Get the cert info for a monitor (HTTPS monitors only), or null. */
export function selectCertInfo(
  state: ServerMonitorsState,
  serverId: string,
  monitorId: number
): KumaCertInfo | null {
  return state.certInfoByServer[serverId]?.[monitorId] ?? null;
}

/** Get the domain-expiry info for a monitor (domain monitors only). */
export function selectDomainInfo(
  state: ServerMonitorsState,
  serverId: string,
  monitorId: number
): { daysRemaining: number | null; expiresOn: string | null } | null {
  return state.domainInfoByServer[serverId]?.[monitorId] ?? null;
}

/** Count monitors by status for a server. */
export function selectStatusCounts(
  state: ServerMonitorsState,
  serverId: string
): Record<MonitorStatus, number> {
  const list = state.monitorsByServer[serverId] ?? [];
  const counts: Record<MonitorStatus, number> = {
    up: 0, down: 0, pending: 0, maintenance: 0, paused: 0,
  };
  for (const m of list) counts[m.status]++;
  return counts;
}
