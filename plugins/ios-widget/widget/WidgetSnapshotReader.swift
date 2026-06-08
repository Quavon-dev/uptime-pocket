//
//  WidgetSnapshotReader.swift
//  UptimePocketWidget
//
//  Reads the JSON snapshot the app writes to the App Group
//  container. Returns nil if the file is missing or undecodable.
//
//  Why App Group? The main app and the widget extension are two
//  separate processes; they need a shared filesystem location.
//  App Group is the iOS-blessed way to do this — both targets
//  declare the same `group.<bundle-id>` entitlement, and both
//  can read/write the same container directory.
//

import Foundation

/// The App Group identifier. Must match exactly between the
/// main app's `.entitlements` and the widget extension's
/// `.entitlements`. The bundle-ID prefix is conventional so a
/// given team's apps don't clash with another team's.
let appGroupIdentifier = "group.de.quavon.uptimepocket"

/// The file name. Must match `SNAPSHOT_FILENAME` in
/// `src/platform/widget/storage.ts`.
let snapshotFileName = "widget_snapshot.json"

enum WidgetSnapshotReader {
    /// Returns the URL of the App Group container's shared file,
    /// or nil if the App Group is not provisioned (the widget
    /// will fall back to "no data" in that case).
    static func snapshotURL() -> URL? {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupIdentifier
        ) else {
            return nil
        }
        return container.appendingPathComponent(snapshotFileName)
    }

    /// Read + decode the snapshot. Returns nil on any failure
    /// (no file, no permission, bad JSON, version mismatch).
    /// The caller is expected to handle nil by showing a
    /// placeholder view.
    static func read() -> WidgetSnapshot? {
        guard let url = snapshotURL() else { return nil }
        guard let data = try? Data(contentsOf: url) else { return nil }
        return WidgetSnapshot.decode(from: data)
    }

    /// Returns a (snapshot?, lastUpdated?) pair. `lastUpdated`
    /// is the file's mtime, used to show "updated 3m ago"
    /// when the snapshot itself doesn't render that info.
    static func readWithMetadata() -> (snapshot: WidgetSnapshot?, modifiedAt: Date?) {
        guard let url = snapshotURL() else { return (nil, nil) }
        let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
        let modified = attrs?[.modificationDate] as? Date
        guard let data = try? Data(contentsOf: url) else { return (nil, modified) }
        return (WidgetSnapshot.decode(from: data), modified)
    }
}
