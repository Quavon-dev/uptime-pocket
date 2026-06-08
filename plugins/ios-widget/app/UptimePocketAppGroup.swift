//
//  UptimePocketAppGroup.swift
//  UptimePocket
//
//  Tiny native module that exposes the App Group container to
//  JavaScript. Used by the widget snapshot writer to drop a
//  JSON file in a location the widget extension can read.
//
//  Why a native module? `expo-file-system` doesn't know about
//  App Group containers on iOS. We could write into
//  `documentDirectory` (which is a per-app sandbox path) but
//  the widget extension is a separate target and can't read
//  from the main app's sandbox. The App Group is the only
//  blessed way to share files between two targets of the
//  same app.
//
//  This file is added to the MAIN APP target (not the widget
//  extension) by the `uptime-pocket-ios-widget` config plugin.
//

import Foundation
import React

@objc(UptimePocketAppGroup)
class UptimePocketAppGroup: NSObject {

  /// The App Group identifier. Must match the entitlement on
  /// BOTH this target and the widget extension target.
  private let appGroupIdentifier = "group.de.quavon.uptimepocket"

  /// Returns the URL of the App Group container, or nil if
  /// the App Group isn't provisioned (e.g. developer hasn't
  /// set it up in the Apple Developer Portal).
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  /// JS-callable: is the App Group container reachable?
  /// Used to short-circuit writes on simulator / dev builds
  /// where App Groups sometimes aren't available.
  @objc(isAvailable:rejecter:)
  func isAvailable(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let url = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroupIdentifier
    )
    resolve(url != nil)
  }

  /// JS-callable: write `json` to `<container>/<filename>`.
  /// Writes atomically (write to temp, then rename) so a
  /// partial flush can never leave the widget reading
  /// truncated JSON. Returns true on success, false on
  /// permission/IO error.
  @objc(writeSnapshot:json:resolver:rejecter:)
  func writeSnapshot(
    _ filename: NSString,
    json: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let container = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroupIdentifier
    ) else {
      resolve(false)
      return
    }
    let target = container.appendingPathComponent(filename as String)
    let temp = target.appendingPathExtension("tmp")
    do {
      try (json as String).write(to: temp, atomically: true, encoding: .utf8)
      // If target doesn't exist, move is fine. If it does
      // exist, we need to replace it; FileManager.replaceItem
      // is the atomic POSIX-rename equivalent on iOS.
      if FileManager.default.fileExists(atPath: target.path) {
        _ = try FileManager.default.replaceItemAt(target, withItemAt: temp)
      } else {
        try FileManager.default.moveItem(at: temp, to: target)
      }
      resolve(true)
    } catch {
      // Best-effort: log in dev, return false to JS.
      // The JS side falls back to expo-file-system (or no-op).
      #if DEBUG
      print("[UptimePocketAppGroup] write failed: \(error)")
      #endif
      resolve(false)
    }
  }
}
