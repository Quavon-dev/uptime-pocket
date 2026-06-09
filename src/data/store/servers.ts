/**
 * Server list store.
 *
 * Persistent + Zustand-backed. Server metadata lives in SQLite
 * (`src/data/db/`), secrets in expo-secure-store, and the React tree
 * subscribes to a Zustand store that mirrors the SQLite rows.
 *
 * Secrets (usernames + passwords) are NEVER in the in-memory store —
 * the `auth` field on each server only carries `{ kind: 'password' }`.
 * To actually connect to Kuma, callers must `loadCredentials(serverId)`
 * to fetch the real auth from SecureStore.
 *
 * The flow:
 *   1. App starts → `useServersHydrated()` hook calls `hydrate()`.
 *   2. `hydrate()` reads from SQLite and seeds the Zustand store.
 *   3. `addServer(server, credentials?)` writes to SQLite + SecureStore
 *      and updates the in-memory list.
 *   4. Other mutations (update / remove / set connected) write through.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Server, NotificationMode, AuthStrategy } from '@/domain/models';
import { serversRepo } from '@/data/db';
import {
  saveCredentials,
  loadCredentials,
  deleteCredentials,
} from '@/data/secure/credentials';

interface ServersState {
  servers: Server[];
  activeServerId: string | null;
  /** True once we've finished reading the initial state from disk. */
  hydrated: boolean;

  // ---- Hydration / lifecycle ----
  /** Read all servers from SQLite into the store. Call once on app start. */
  hydrate: () => Promise<void>;

  // ---- CRUD ----
  /**
   * Add a new server.
   * - Writes metadata to SQLite
   * - Writes auth to SecureStore (if provided; if omitted, no credentials
   *   are stored — useful for read-only public status pages later)
   * - Adds to the in-memory list and makes it active if none was active
   */
  addServer: (server: Server, credentials?: AuthStrategy) => Promise<void>;
  /** Update server metadata. Pass credentials to rotate the auth. */
  updateServer: (
    id: string,
    patch: Partial<Omit<Server, 'id' | 'auth'>>,
    credentials?: AuthStrategy
  ) => Promise<void>;
  /** Remove a server (metadata + credentials). */
  removeServer: (id: string) => Promise<void>;

  // ---- Selection ----
  setActive: (id: string | null) => void;

  // ---- Connection state ----
  setConnected: (id: string, connected: boolean) => Promise<void>;
  setNotificationMode: (id: string, mode: NotificationMode) => Promise<void>;
  setKumaVersion: (id: string, version: string | null) => Promise<void>;

  // ---- Auth (separate from server object) ----
  /** Fetch the real auth strategy for a server from SecureStore. */
  getCredentials: (id: string) => Promise<AuthStrategy | null>;
}

export const useServers = create<ServersState>()(
  subscribeWithSelector((set, get) => ({
    servers: [],
    activeServerId: null,
    hydrated: false,

    hydrate: async () => {
      const all = await serversRepo.listAll();
      set((state) => ({
        servers: all,
        // Default the active server to the first one if none was set.
        activeServerId: state.activeServerId ?? all[0]?.id ?? null,
        hydrated: true,
      }));
    },

    addServer: async (server, credentials) => {
      if (credentials) {
        await saveCredentials(server.id, credentials);
      }
      await serversRepo.upsert(server);
      set((state) => ({
        servers: [...state.servers, server],
        activeServerId: state.activeServerId ?? server.id,
      }));
    },

    updateServer: async (id, patch, credentials) => {
      if (credentials) {
        await saveCredentials(id, credentials);
      }
      // Resolve to the merged server.
      const existing = get().servers.find((s) => s.id === id);
      if (!existing) {
        throw new Error(`updateServer: server ${id} not found in store`);
      }
      const merged: Server = { ...existing, ...patch };
      await serversRepo.upsert(merged);
      set((state) => ({
        servers: state.servers.map((s) => (s.id === id ? merged : s)),
      }));
    },

    removeServer: async (id) => {
      await deleteCredentials(id);
      await serversRepo.remove(id);
      set((state) => ({
        servers: state.servers.filter((s) => s.id !== id),
        activeServerId: state.activeServerId === id ? null : state.activeServerId,
      }));
    },

    setActive: (id) => set({ activeServerId: id }),

    setConnected: async (id, connected) => {
      await serversRepo.setConnected(id, connected);
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id
            ? {
                ...s,
                connected,
                lastConnectedAt: connected ? new Date() : s.lastConnectedAt,
              }
            : s
        ),
      }));
    },

    setNotificationMode: async (id, mode) => {
      await serversRepo.setNotificationMode(id, mode);
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id ? { ...s, notificationMode: mode } : s
        ),
      }));
    },

    setKumaVersion: async (id, version) => {
      await serversRepo.setKumaVersion(id, version);
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id ? { ...s, kumaVersion: version ?? undefined } : s
        ),
      }));
    },

    getCredentials: (id) => loadCredentials(id),
  }))
);

/** Helper: get the currently-active server, or null if none. */
export function getActiveServer(
  servers: Server[],
  activeId: string | null
): Server | null {
  if (!activeId) return servers[0] ?? null;
  return servers.find((s) => s.id === activeId) ?? null;
}
