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
  clearServer: (serverId: string) => void;
}

const INCIDENT_LIMIT = 50;

export const useMonitors = create<ServerMonitorsState>()(
  subscribeWithSelector((set) => ({
    monitorsByServer: {},
    statusByServer: {},
    errorByServer: {},
    incidentsByServer: {},

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

    clearServer: (serverId) =>
      set((state) => {
        const { [serverId]: _m, ...monitorsByServer } = state.monitorsByServer;
        const { [serverId]: _s, ...statusByServer } = state.statusByServer;
        const { [serverId]: _e, ...errorByServer } = state.errorByServer;
        const { [serverId]: _i, ...incidentsByServer } = state.incidentsByServer;
        return { monitorsByServer, statusByServer, errorByServer, incidentsByServer };
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
