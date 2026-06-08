//
//  WidgetSnapshot.swift
//  UptimePocketWidget
//
//  The data shape the widget reads from disk. Mirrors
//  src/platform/widget/snapshot.ts (the app-side source of truth).
//
//  Why Codable? The app writes JSON, the widget reads it. We avoid
//  a hand-rolled parser; if the JSON doesn't decode, the widget
//  shows a "no data" placeholder rather than crashing.
//

import Foundation

/// Status of a single monitor. Mirrors `MonitorStatus` in
/// `src/domain/models`. The order matters for "worst status"
/// ranking — the widget shows the most-actionable item first.
enum WidgetMonitorStatus: String, Codable {
    case up
    case down
    case pending
    case maintenance
    case paused
}

/// A single monitor row. Field names match the TypeScript
/// source (camelCase) exactly so the JSON decode is symmetric.
struct WidgetMonitor: Codable, Identifiable {
    /// Stable ID. The app prefixes server ID so two servers
    /// can't collide on monitor ID.
    let id: String
    let name: String
    let status: WidgetMonitorStatus
    /// Unix ms. The widget renders "5m ago" for stale snapshots.
    let lastCheckAt: Int64?
    let responseTime: Int64?
    let serverLabel: String
}

/// A server: connection state + a flat list of monitors.
/// The widget iterates `monitors` directly (no nested traversal).
struct WidgetServer: Codable, Identifiable {
    let id: String
    let name: String
    let connected: Bool
    let worstStatus: WidgetMonitorStatus
    let monitors: [WidgetMonitor]
}

/// Top-level snapshot. Versioned so a future incompatible
/// change can be detected and the widget can fall back to
/// "no data" instead of crashing.
struct WidgetSnapshot: Codable {
    let generatedAt: Int64
    let version: Int
    let servers: [WidgetServer]

    /// Decode with a fallback to nil on any error. The widget
    /// shows "no data" when this returns nil.
    static func decode(from data: Data) -> WidgetSnapshot? {
        let decoder = JSONDecoder()
        do {
            let snap = try decoder.decode(WidgetSnapshot.self, from: data)
            // Future-proof: reject unknown versions.
            if snap.version != 1 { return nil }
            return snap
        } catch {
            return nil
        }
    }

    /// True if this snapshot is "fresh" (within the last 10 min).
    /// Used to show a "stale" badge on the widget if the app
    /// has been background-killed for a long time.
    func isFresh(nowMs: Int64 = Int64(Date().timeIntervalSince1970 * 1000)) -> Bool {
        let ageMs = nowMs - generatedAt
        return ageMs >= 0 && ageMs < 10 * 60 * 1000
    }

    /// All monitors across all servers, sorted: down first,
    /// then by lastCheckAt desc. The widget shows the top N
    /// from this list.
    func prioritizedMonitors() -> [WidgetMonitor] {
        var all: [WidgetMonitor] = []
        for server in servers {
            all.append(contentsOf: server.monitors)
        }
        // Ranking mirrors TS: down > pending > maintenance > paused > up.
        let rank: [WidgetMonitorStatus: Int] = [
            .down: 5,
            .pending: 4,
            .maintenance: 3,
            .paused: 2,
            .up: 1,
        ]
        return all.sorted { a, b in
            let ra = rank[a.status] ?? 0
            let rb = rank[b.status] ?? 0
            if ra != rb { return ra > rb }
            return (a.lastCheckAt ?? 0) > (b.lastCheckAt ?? 0)
        }
    }
}
