//
//  UptimeWidgetView.swift
//  UptimePocketWidget
//
//  The widget's SwiftUI body. One supported kind (a 4×2 list
//  of up to 5 monitors). Status dot is colored; down monitors
//  float to the top. Tap target deep-links to the monitor
//  detail screen via the `uptimepocket://` URL scheme.
//
//  Design notes:
//   - iOS 17+ widgets use the new WidgetKit + AppIntents
//     declarative API. We use the legacy `IntentTimelineProvider`
//     shape because the app's main bundle target is iOS 16+ and
//     we'd rather not bump the deployment target for v1 of the
//     widget.
//   - We don't ship "no configuration" for the user — the widget
//     shows whatever the app's currently-displayed servers
//     contain. Configuration UI can be added in a later release
//     using `AppIntentConfiguration` (iOS 17+).
//

import SwiftUI
import WidgetKit

// MARK: - Status colors
//
// Mirrors `src/theme/colors.ts` "status" scale. We can't import
// the TS palette (different language, different runtime), so we
// re-declare the matching values here. If the palette changes
// in TS, this file must be updated to match.

enum WidgetPalette {
    static let up = Color(red: 0x10/255.0, green: 0xB9/255.0, blue: 0x81/255.0)        // #10B981
    static let down = Color(red: 0xEF/255.0, green: 0x44/255.0, blue: 0x44/255.0)     // #EF4444
    static let pending = Color(red: 0xF5/255.0, green: 0x9E/255.0, blue: 0x0B/255.0)   // #F59E0B
    static let maintenance = Color(red: 0x63/255.0, green: 0x66/255.0, blue: 0xF1/255.0) // #6366F1
    static let paused = Color(red: 0x9C/255.0, green: 0xA3/255.0, blue: 0xAF/255.0)     // #9CA3AF

    /// App background. Tinted dark to match the iOS 17
    /// "translucent widget" look. We don't actually use
    /// `.containerBackground` (iOS 17+) because we support
    /// iOS 16; on iOS 17 the system applies its own background
    /// behind our view.
    static let cardBg = Color(red: 0x1C/255.0, green: 0x1C/255.0, blue: 0x1E/255.0)
    static let cardBgLight = Color(red: 0xF2/255.0, green: 0xF2/255.0, blue: 0xF7/255.0)

    static func color(for status: WidgetMonitorStatus) -> Color {
        switch status {
        case .up: return up
        case .down: return down
        case .pending: return pending
        case .maintenance: return maintenance
        case .paused: return paused
        }
    }
}

// MARK: - Entry

struct UptimeEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
    let modifiedAt: Date?

    /// Human-readable "5m ago" string. Returns nil if we have
    /// no data to format.
    func staleText() -> String? {
        guard let modified = modifiedAt else { return nil }
        let interval = date.timeIntervalSince(modified)
        if interval < 60 { return nil }   // fresh: don't show
        let mins = Int(interval / 60)
        if mins < 60 { return "\(mins)m ago" }
        let hours = mins / 60
        if hours < 24 { return "\(hours)h ago" }
        return "\(hours / 24)d ago"
    }
}

// MARK: - Provider

struct UptimeProvider: TimelineProvider {
    typealias Entry = UptimeEntry

    func placeholder(in context: Context) -> UptimeEntry {
        UptimeEntry(
            date: Date(),
            snapshot: nil,
            modifiedAt: nil
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (UptimeEntry) -> Void) {
        let (snap, modified) = WidgetSnapshotReader.readWithMetadata()
        let entry = UptimeEntry(date: Date(), snapshot: snap, modifiedAt: modified)
        completion(entry)
    }

    /// Refresh strategy: every 5 minutes is plenty for a status
    /// widget. The app can also call `WidgetCenter.shared.reloadAllTimelines()`
    /// when a new snapshot is written, which gives us a
    /// near-instant update on status changes.
    func getTimeline(in context: Context, completion: @escaping (Timeline<UptimeEntry>) -> Void) {
        let (snap, modified) = WidgetSnapshotReader.readWithMetadata()
        let now = Date()
        let entry = UptimeEntry(date: now, snapshot: snap, modifiedAt: modified)
        // Refresh in 5 minutes. WidgetKit will dedupe with
        // app-triggered reloads.
        let nextRefresh = now.addingTimeInterval(5 * 60)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}

// MARK: - View

struct UptimeWidgetEntryView: View {
    let entry: UptimeEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        Group {
            if let snap = entry.snapshot, !snap.servers.isEmpty {
                contentView(snap: snap)
            } else {
                emptyView
            }
        }
        .widgetURL(URL(string: "uptimepocket://"))
    }

    /// The list view. Up to 5 rows visible in 4×2. We cap to 5
    /// to avoid a scrollable widget (the iOS widget API doesn't
    /// support scrolling — the system shows a "more" badge for
    /// overflow).
    private func contentView(snap: WidgetSnapshot) -> some View {
        let monitors = Array(snap.prioritizedMonitors().prefix(5))
        return VStack(alignment: .leading, spacing: 4) {
            // Header: app name + a tiny stale indicator if applicable.
            HStack(spacing: 4) {
                Image(systemName: "checkmark.shield.fill")
                    .font(.caption2)
                    .foregroundColor(WidgetPalette.up)
                Text("Uptime Pocket")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
                Spacer()
                if let stale = entry.staleText() {
                    Text(stale)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.bottom, 2)

            ForEach(monitors) { m in
                MonitorRow(monitor: m)
            }

            // If we have more than 5 monitors, show a "more" hint.
            let total = snap.prioritizedMonitors().count
            if total > 5 {
                Text("+\(total - 5) more")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .padding(.top, 2)
            }
        }
    }

    private var emptyView: some View {
        VStack(spacing: 6) {
            Image(systemName: "antenna.radiowaves.left.and.right.slash")
                .font(.title2)
                .foregroundColor(.secondary)
            Text("No servers yet")
                .font(.caption)
                .fontWeight(.medium)
                .foregroundColor(.primary)
            Text("Add a server in the app")
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct MonitorRow: View {
    let monitor: WidgetMonitor

    var body: some View {
        HStack(spacing: 8) {
            // Status dot
            Circle()
                .fill(WidgetPalette.color(for: monitor.status))
                .frame(width: 8, height: 8)

            // Monitor name. Truncation is the system's job;
            // we just give it a flexible width.
            Text(monitor.name)
                .font(.caption)
                .lineLimit(1)
                .truncationMode(.tail)
                .foregroundColor(.primary)

            Spacer(minLength: 4)

            // Response time badge (only if known)
            if let rt = monitor.responseTime {
                Text("\(rt)ms")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .monospacedDigit()
            }
        }
    }
}

// MARK: - Widget

@main
struct UptimePocketWidget: Widget {
    let kind: String = "UptimePocketWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: UptimeProvider()) { entry in
            UptimeWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Uptime Pocket")
        .description("Recent monitor status at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
