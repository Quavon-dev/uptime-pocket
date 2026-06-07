/**
 * useKumaActions — React hook wrapping the manager's write methods
 * (add / edit / delete monitors) with React-friendly loading + error
 * state.
 *
 * Each action returns a `KumaAction` state object the screen can
 * render directly:
 *
 *   const { addMonitor, state } = useKumaActions();
 *   const result = await addMonitor({ name: 'foo', type: 'http', url: '...' });
 *   if (result.ok) router.back();
 *   // state.isAdding, state.error, state.lastResult are reactive
 *
 * The hook is server-scoped: every action targets the currently
 * active server, so callers don't need to thread serverId through
 * the UI tree.
 */

import { useCallback, useState } from 'react';
import { useKumaConnection } from '@/data/connection/manager';
import { useServers } from '@/data/store/servers';
import type {
  MonitorDraft,
  KumaMonitorBean,
  AddMonitorResult,
  EditMonitorResult,
  DeleteMonitorResult,
} from '@/data/api/monitors';

export interface KumaActionState {
  isAdding: boolean;
  isEditing: boolean;
  isDeleting: boolean;
  isFetching: boolean;
  error: string | null;
  /** Last result of any action — useful for showing toast messages. */
  lastResult:
    | { kind: 'add' | 'edit' | 'delete' | 'get'; ok: boolean; msg?: string }
    | null;
}

export interface UseKumaActionsResult extends KumaActionState {
  addMonitor: (draft: MonitorDraft) => Promise<AddMonitorResult>;
  editMonitor: (bean: KumaMonitorBean) => Promise<EditMonitorResult>;
  deleteMonitor: (monitorId: number) => Promise<DeleteMonitorResult>;
  /**
   * Fetch a single monitor by id. The returned `monitor` field is the
   * raw Kuma bean (a superset of the domain `Monitor` type) — callers
   * that need to send it back via `editMonitor` should use it as-is.
   * Callers that only need display fields can cast to `Monitor`.
   */
  getMonitor: (monitorId: number) => Promise<{
    ok: boolean;
    monitor?: KumaMonitorBean | null;
    msg?: string;
  }>;
  /** Clear the error (e.g. when the user dismisses the banner). */
  clearError: () => void;
}

const initialState: KumaActionState = {
  isAdding: false,
  isEditing: false,
  isDeleting: false,
  isFetching: false,
  error: null,
  lastResult: null,
};

export function useKumaActions(): UseKumaActionsResult {
  const manager = useKumaConnection();
  const activeServerId = useServers((s) => s.activeServerId);
  const [state, setState] = useState<KumaActionState>(initialState);

  const setPartial = useCallback(
    (partial: Partial<KumaActionState>) =>
      setState((prev) => ({ ...prev, ...partial })),
    []
  );

  const requireServer = useCallback((): string => {
    if (!activeServerId) {
      throw new Error('No active server selected');
    }
    return activeServerId;
    // manager is intentionally not a dep — the manager is stable per mount
    // and the active server id captures the routing target.
  }, [activeServerId]);

  const addMonitor = useCallback(
    async (draft: MonitorDraft): Promise<AddMonitorResult> => {
      const serverId = requireServer();
      setPartial({ isAdding: true, error: null });
      const result = await manager.addMonitor(serverId, draft);
      setPartial({
        isAdding: false,
        lastResult: { kind: 'add', ok: result.ok, msg: result.msg },
        error: result.ok ? null : (result.msg ?? 'Failed to add monitor'),
      });
      return result;
    },
    [manager, requireServer, setPartial]
  );

  const editMonitor = useCallback(
    async (bean: KumaMonitorBean): Promise<EditMonitorResult> => {
      const serverId = requireServer();
      setPartial({ isEditing: true, error: null });
      const result = await manager.editMonitor(serverId, bean);
      setPartial({
        isEditing: false,
        lastResult: { kind: 'edit', ok: result.ok, msg: result.msg },
        error: result.ok ? null : (result.msg ?? 'Failed to save monitor'),
      });
      return result;
    },
    [manager, requireServer, setPartial]
  );

  const deleteMonitor = useCallback(
    async (monitorId: number): Promise<DeleteMonitorResult> => {
      const serverId = requireServer();
      setPartial({ isDeleting: true, error: null });
      const result = await manager.deleteMonitor(serverId, monitorId);
      setPartial({
        isDeleting: false,
        lastResult: { kind: 'delete', ok: result.ok, msg: result.msg },
        error: result.ok ? null : (result.msg ?? 'Failed to delete monitor'),
      });
      return result;
    },
    [manager, requireServer, setPartial]
  );

  const getMonitor = useCallback(
    async (monitorId: number) => {
      const serverId = requireServer();
      setPartial({ isFetching: true, error: null });
      const result = await manager.getMonitor(serverId, monitorId);
      setPartial({
        isFetching: false,
        lastResult: { kind: 'get', ok: result.ok, msg: result.msg },
        error: result.ok ? null : (result.msg ?? 'Failed to load monitor'),
      });
      return result;
    },
    [manager, requireServer, setPartial]
  );

  const clearError = useCallback(() => {
    setPartial({ error: null });
  }, [setPartial]);

  return {
    ...state,
    addMonitor,
    editMonitor,
    deleteMonitor,
    getMonitor,
    clearError,
  };
}
