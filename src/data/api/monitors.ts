/**
 * Monitor write API (add / edit / delete) for Uptime Kuma 2.3+.
 *
 * All writes go over socket.io. The request/response pattern uses a
 * correlation ID so concurrent operations don't get their callbacks
 * crossed.
 *
 * ## Kuma 2.3+ write API contract
 *
 *   - `add(draft, cb)`         → `{ ok, monitorID, msg }`
 *   - `editMonitor(bean, cb)`  → `{ ok, msg, monitorID }`
 *   - `deleteMonitor(id, cb)`  → `{ ok, msg: "successDeleted" }`
 *   - `getMonitor(id, cb)`     → `{ ok, monitor: Monitor | null }`
 *
 * ## Kuma 2.3.2 known bugs / quirks
 *
 *   - `add` payload: do NOT send `tags: []` or any `follow_redirect*`
 *     field. Kuma's INSERT helper has bugs that cause SQL errors
 *     (empty `tags` becomes a non-quoted empty string; `follow_redirect`
 *     / `follow_redirects` are not actual columns in 2.3.2).
 *   - `editMonitor` MUST receive the FULL monitor bean (all 113
 *     fields). Partial payloads (just `{ name, url, interval }`)
 *     are silently accepted but don't actually persist any changes.
 *   - `add` and `deleteMonitor` ack via the callback. `editMonitor`
 *     only acks when Kuma has a JWT for the socket (which we do, post
 *     socket-login).
 *
 * These are captured from live probes against `uptime.quavon.de`
 * (Kuma 2.3.2) — see `.hermes/skills/uptime-kuma-integration/`.
 */

import type { Socket } from 'socket.io-client';
import type { MonitorType } from '@/domain/models';

/** A Kuma 2.3 monitor "bean" — the full object Kuma stores. */
export interface KumaMonitorBean {
  id: number;
  type: MonitorType | string;
  name: string;
  url?: string;
  hostname?: string;
  port?: number;
  method?: string;
  interval: number;
  retryInterval: number;
  maxretries: number;
  upsideDown: boolean;
  active: boolean;
  parent: number | null;
  // ... and ~100 more type-specific fields. We use a partial type
  // for the return; for add() the caller provides the required core
  // and Kuma fills in the rest with defaults.
  [key: string]: unknown;
}

/** Subset of fields the user fills in when creating a monitor. */
export interface MonitorDraft {
  name: string;
  type: MonitorType | string;
  url?: string;
  hostname?: string;
  port?: number;
  method?: 'GET' | 'POST' | 'HEAD' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';
  interval?: number; // seconds, default 60
  retryInterval?: number; // seconds, default 60
  maxretries?: number; // default 0
  upsideDown?: boolean; // default false
  active?: boolean; // default true
  /** Parent group id (null = top-level). */
  parent?: number | null;
  /** Tags — Kuma monitor-list shape is object-keyed { id: true }. */
  tags?: Record<string, boolean> | never[] | null;
  /** Notification IDs in Kuma's object-keyed shape. */
  notificationIDList?: Record<string, boolean>;
  /** HTTP only. */
  accepted_statuscodes?: string[];
  httpBodyEncoding?: 'json' | 'xml';
  ignoreTls?: boolean;
  maxredirects?: number;
  body?: string | null;
  headers?: string | null;
  basic_auth_user?: string | null;
  basic_auth_pass?: string | null;
  description?: string;
  /** Type-specific extras. Pass through anything else verbatim. */
  [key: string]: unknown;
}

export interface AddMonitorResult {
  ok: boolean;
  monitorID?: number;
  msg?: string;
}

export interface EditMonitorResult {
  ok: boolean;
  monitorID?: number;
  msg?: string;
}

export interface DeleteMonitorResult {
  ok: boolean;
  msg?: string;
}

export interface GetMonitorResult {
  ok: boolean;
  /** The raw Kuma monitor bean, or null if the id doesn't exist. */
  monitor?: KumaMonitorBean | null;
  msg?: string;
}

/**
 * Wraps an existing socket.io socket with monitor write operations.
 * Holds no state of its own — the socket is owned by the manager.
 */
export class KumaMonitorWriter {
  constructor(private readonly socket: Socket) {}

  /**
   * Create a new monitor.
   *
   * Strips known-problematic fields (empty `tags`, `follow_redirect*`)
   * before sending — see file-level comment for details.
   */
  add(draft: MonitorDraft): Promise<AddMonitorResult> {
    const sanitized = sanitizeDraft(draft);
    return new Promise<AddMonitorResult>((resolve) => {
      this.socket.emit('add', sanitized, (res: AddMonitorResult) => {
        resolve(res || { ok: false, msg: 'No response from Kuma' });
      });
      // Safety timeout — Kuma normally responds in <1s. If it
      // doesn't, surface a clear error rather than hang the UI.
      setTimeout(() => {
        resolve({ ok: false, msg: 'Kuma add timed out after 10s' });
      }, 10_000);
    });
  }

  /**
   * Edit a monitor.
   *
   * Kuma 2.3.2 requires the FULL bean (all 113 fields) — partial
   * edits are silently dropped. Callers should:
   *   1. Fetch the current monitor with `get()`
   *   2. Mutate the fields they want to change
   *   3. Pass the whole bean here
   */
  edit(bean: KumaMonitorBean): Promise<EditMonitorResult> {
    return new Promise<EditMonitorResult>((resolve) => {
      this.socket.emit('editMonitor', bean, (res: EditMonitorResult) => {
        resolve(res || { ok: false, msg: 'No response from Kuma' });
      });
      setTimeout(() => {
        resolve({ ok: false, msg: 'Kuma edit timed out after 10s' });
      }, 10_000);
    });
  }

  /** Delete a monitor. Kuma returns `{ ok, msg: "successDeleted" }`. */
  delete(monitorId: number): Promise<DeleteMonitorResult> {
    return new Promise<DeleteMonitorResult>((resolve) => {
      this.socket.emit('deleteMonitor', monitorId, (res: DeleteMonitorResult) => {
        resolve(res || { ok: false, msg: 'No response from Kuma' });
      });
      setTimeout(() => {
        resolve({ ok: false, msg: 'Kuma delete timed out after 10s' });
      }, 10_000);
    });
  }

  /**
   * Fetch a single monitor by id. Kuma returns `{ ok, monitor }`;
   * `monitor` is `null` if the id doesn't exist (e.g. just deleted).
   */
  get(monitorId: number): Promise<GetMonitorResult> {
    return new Promise<GetMonitorResult>((resolve) => {
      this.socket.emit('getMonitor', monitorId, (res: GetMonitorResult) => {
        if (!res) {
          resolve({ ok: false, msg: 'No response from Kuma' });
          return;
        }
        resolve(res);
      });
      setTimeout(() => {
        resolve({ ok: false, msg: 'Kuma getMonitor timed out after 10s' });
      }, 10_000);
    });
  }
}

/**
 * Sanitize a draft before sending to Kuma 2.3.2.
 *
 * Strips fields that trigger known SQL bugs in the server's INSERT
 * helper (see file-level comment).
 */
function sanitizeDraft(draft: MonitorDraft): MonitorDraft {
  const out: Record<string, unknown> = { ...draft };
  // Kuma 2.3.2 renders `tags: []` as an unquoted empty string,
  // which breaks the INSERT. Omit it entirely — Kuma's default
  // for an empty tag set is "no tags".
  if (Array.isArray(out.tags) && (out.tags as unknown[]).length === 0) {
    delete out.tags;
  }
  // Kuma 2.3.2 has no `follow_redirect` / `follow_redirects` columns.
  // The Kuma web UI controls redirect-following via `maxredirects`
  // alone, so drop the follow-redirect flag here too.
  delete out.follow_redirect;
  delete out.follow_redirects;
  return out as MonitorDraft;
}
