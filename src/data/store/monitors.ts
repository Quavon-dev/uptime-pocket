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
import type { NormalizedHeartbeatRow } from '@/data/socket/normalize';

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

  // ---- Mutators (called by the connection manager) ----
  setStatus: (serverId: string, status: ConnectionStatus, error?: string | null) => void;
  setMonitors: (serverId: string, monitors: Monitor[]) => void;
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
  /** Cache heartbeat-history rows for a monitor (Kuma 2.3+). */
  setHeartbeatHistory: (
    serverId: string,
    monitorId: number,
    rows: NormalizedHeartbeatRow[]
  ) => void;
  /** Cache an uptime ratio for a monitor + window (Kuma 2.3+). */
  setUptimeRatio: (
    serverId: string,
    monitorId: number,
    hours: '24' | '168' | '720' | '1y',
    ratio: number
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

    setStatus: (serverId, status, error = null) =>
      set((state) => ({
        statusByServer: { ...state.statusByServer, [serverId]: status },
        errorByServer: { ...state.errorByServer, [serverId]: error },
      })),

    setMonitors: (serverId, monitors) =>
      set((state) => ({
        monitorsByServer: { ...state.monitorsByServer, [serverId]: monitors },
      })),

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

    setHeartbeatHistory: (serverId, monitorId, rows) =>
      set((state) => {
        const perServer = { ...(state.heartbeatHistoryByServer[serverId] ?? {}) };
        perServer[monitorId] = rows;
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

    clearServer: (serverId) =>
      set((state) => {
        const { [serverId]: _m, ...monitorsByServer } = state.monitorsByServer;
        const { [serverId]: _s, ...statusByServer } = state.statusByServer;
        const { [serverId]: _e, ...errorByServer } = state.errorByServer;
        const { [serverId]: _i, ...incidentsByServer } = state.incidentsByServer;
        const { [serverId]: _h, ...heartbeatHistoryByServer } = state.heartbeatHistoryByServer;
        const { [serverId]: _u, ...uptimeByServer } = state.uptimeByServer;
        return {
          monitorsByServer,
          statusByServer,
          errorByServer,
          incidentsByServer,
          heartbeatHistoryByServer,
          uptimeByServer,
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
