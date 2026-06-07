/**
 * Server list store.
 *
 * Persists the user's Kuma servers in SQLite (Drizzle).
 * Exposes a Zustand store for the React tree.
 *
 * NOTE: This is a thin wrapper. The actual persistence layer
 * (Drizzle + expo-sqlite) is in src/data/db/.
 * For Phase 0, we use in-memory storage with the structure
 * already in place for persistence.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Server, NotificationMode } from '@/domain/models';

interface ServersState {
  servers: Server[];
  activeServerId: string | null;

  setServers: (servers: Server[]) => void;
  addServer: (server: Server) => void;
  updateServer: (id: string, patch: Partial<Server>) => void;
  removeServer: (id: string) => void;
  setActive: (id: string | null) => void;
  setConnected: (id: string, connected: boolean) => void;
  setNotificationMode: (id: string, mode: NotificationMode) => void;
}

export const useServers = create<ServersState>()(
  subscribeWithSelector((set) => ({
    servers: [],
    activeServerId: null,

    setServers: (servers) =>
      set((state) => ({
        servers,
        activeServerId: state.activeServerId ?? servers[0]?.id ?? null,
      })),

    addServer: (server) =>
      set((state) => ({
        servers: [...state.servers, server],
        activeServerId: state.activeServerId ?? server.id,
      })),

    updateServer: (id, patch) =>
      set((state) => ({
        servers: state.servers.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      })),

    removeServer: (id) =>
      set((state) => ({
        servers: state.servers.filter((s) => s.id !== id),
        activeServerId: state.activeServerId === id ? null : state.activeServerId,
      })),

    setActive: (id) => set({ activeServerId: id }),

    setConnected: (id, connected) =>
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id
            ? { ...s, connected, lastConnectedAt: connected ? new Date() : s.lastConnectedAt }
            : s
        ),
      })),

    setNotificationMode: (id, mode) =>
      set((state) => ({
        servers: state.servers.map((s) => (s.id === id ? { ...s, notificationMode: mode } : s)),
      })),
  }))
);

export function getActiveServer(servers: Server[], activeId: string | null): Server | null {
  if (!activeId) return servers[0] ?? null;
  return servers.find((s) => s.id === activeId) ?? null;
}
