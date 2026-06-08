# iOS widget (C1)

Uptime Pocket ships with a home-screen widget for iOS that
mirrors the Android one. This document covers:

1. What you get
2. Architecture
3. Setup steps (operator work the plugin can't do)
4. Troubleshooting

## What you get

A `UptimePocketWidget` extension that, when added to the home
screen, shows a compact list of your monitors with status dots,
sorted by severity (down first). Tapping the widget deep-links
to the app.

Three sizes are supported: `.systemSmall` (2×2), `.systemMedium`
(4×2, default), and `.systemLarge` (4×4).

The widget is **read-only** — it pulls from a JSON snapshot the
app writes, and never writes back. This is by design (see
[Architecture](#architecture)).

## Architecture

```
┌─────────────────────────┐
│  Main app (RN)          │
│                         │
│  useWidgetSnapshot()    │
│   └→ buildSnapshot()    │
│   └→ writeSnapshotFile()│
└────────┬────────────────┘
         │ JSON via App Group container
         │ (group.de.quavon.uptimepocket)
         ▼
┌─────────────────────────┐
│  Shared file            │
│  widget_snapshot.json   │
└────────┬────────────────┘
         │ read on every reload
         ▼
┌─────────────────────────┐
│  Widget Extension       │
│  (SwiftUI + WidgetKit)  │
│                         │
│  UptimeProvider         │
│   └→ WidgetSnapshotReader│
│   └→ UptimeWidgetView   │
└─────────────────────────┘
```

The two processes can only share data via the App Group
container. Both targets must declare the same App Group
entitlement, and the App Group must be provisioned in the
Apple Developer Portal.

The `uptime-pocket-ios-widget` config plugin (in
`plugins/ios-widget/`) wires all of this up at
`expo prebuild` time. It:

1. Adds the `UptimePocketWidget` target to the Xcode project
2. Adds the App Group entitlement to **both** targets
3. Embeds the extension into the main app
4. Copies the Swift sources + Info.plist + entitlements
5. Adds a native bridge module (`UptimePocketAppGroup`) to
   the main app, so the JS side can write to the App Group

## Setup — what you (the operator) must do

The plugin does the file-and-Xcode work. There are 3 things
it **can't** do, all because they require your Apple Developer
account:

### 1. Create the App Group on the Apple Developer Portal

Before signing will work, you need an App Group named
`group.de.quavon.uptimepocket`. Steps:

1. Go to
   <https://developer.apple.com/account/resources/services/list>
2. In the "App Groups" section, click the + button
3. Name: `group.de.quavon.uptimepocket` (must match exactly)
4. Description: "Shared container for the Uptime Pocket widget"
5. Save

Now register this App Group against your app's bundle
identifier (both the main app and the widget extension's
bundle ID). Steps:

1. Go to
   <https://developer.apple.com/account/resources/identifiers/list>
2. Find `de.quavon.uptimepocket` (the main app) → check the
   "App Groups" capability → check `group.de.quavon.uptimepocket`
3. Find `de.quavon.uptimepocket.UptimePocketWidget` (the
   widget extension) → same thing
4. Save both

### 2. Set up signing for the widget extension

After `expo prebuild --platform ios`:

1. Open `ios/<your-project>.xcworkspace` in Xcode
2. Select the `UptimePocketWidget` target in the sidebar
3. Signing & Capabilities tab
4. Set Team to your developer team
5. Confirm the App Groups capability lists
   `group.de.quavon.uptimepocket`
6. Repeat for the main app target (it should also have
   the App Group)

If you skip this, the build will fail with:
> "Provisioning profile ... doesn't include the
> com.apple.security.application-groups entitlement"

### 3. Add the native module files to the Xcode target

The plugin copies `UptimePocketAppGroup.swift` and
`UptimePocketAppGroup.m` into `ios/`, but it does NOT add
them to the Xcode target automatically (because adding to
the main target is intrusive and you might have customized
it). Steps:

1. In Xcode, select the main app target
2. Right-click the project root → "Add Files to <Project>..."
3. Select `UptimePocketAppGroup.swift` and
   `UptimePocketAppGroup.m`
4. Make sure "Copy items if needed" is **off** (the files
   are already in the project root)
5. Make sure the main app target is checked under
   "Add to targets"
6. Add

Xcode will prompt you to create a bridging header (since we
mixed Swift and ObjC in the main target). Click "Don't
Create" — we don't need one because the .m file uses
`RCT_EXTERN_MODULE` which handles the bridge without a
bridging header.

## Why the manual steps?

The plugin handles 80% of the work — Xcode project structure,
entitlements, file copying, target embedding. The remaining
20% is genuinely operator-specific:

- **App Group creation** requires the Apple Developer Portal
  and your team credentials.
- **Signing** requires your team and a paid developer account.
- **Adding the native module** requires Xcode to be open and
  the user to be present. The plugin tries to be
  non-intrusive — modifying the main app target's source
  membership is more disruptive than helpful if the user has
  already customized it.

We could automate (2) and (3) with more invasive Xcode
project edits, but the trade-off is making a plugin that
fails on already-customized projects. The current design
fails-soft: the plugin runs cleanly; the manual steps are
documented; the user is in control.

## Troubleshooting

### Widget shows "No servers yet"

The widget can't read the snapshot. Common causes:

- **App Group not provisioned.** Both targets need
  `group.de.quavon.uptimepocket` in their entitlements.
  Check Xcode → both targets → Signing & Capabilities →
  App Groups.
- **App and widget have different App Group IDs.** Both
  must match exactly.
- **App was killed before writing the snapshot.** The app
  writes the snapshot periodically while in the
  foreground or background. If you installed the app
  fresh and added the widget immediately, the snapshot
  might not exist yet. Open the app for a few seconds;
  the widget will refresh within 5 minutes (or
  immediately if you have the dev tools reload it).

### Widget shows old data

- The snapshot is rewritten every ~2s while the app is
  active. If the app is backgrounded for a long time, the
  widget shows the last-known state with a stale badge
  ("5m ago").
- If the widget is **always** stale, check that the app
  isn't being killed by iOS too aggressively. Settings →
  General → Background App Refresh → Uptime Pocket →
  On.

### "Provisioning profile ... doesn't include the
com.apple.security.application-groups entitlement"

The App Group isn't in your provisioning profile. You need
to:

1. Make sure the App Group is added to your App ID in the
   developer portal (see Setup #1).
2. Regenerate the provisioning profile in Xcode (Signing &
   Capabilities → uncheck "Automatically manage signing" →
   re-check it).

### Build fails on `xcodebuild` step

If the plugin added the widget target but the build fails,
the most common issue is the `Embed App Extensions` phase
firing before the widget's own build phase. This is a known
quirk of the `xcode` npm package. The fix:

1. Open the project in Xcode
2. Select the main app target → Build Phases
3. Drag the "Embed App Extensions" phase BELOW the
   "Link Binary With Libraries" phase

Or in the pbxproj directly: search for the
`PBXCopyFilesBuildPhase` named "Embed App Extensions" and
move it after the linker phase.

## See also

- `plugins/ios-widget/widget/` — the Swift sources
- `plugins/ios-widget/app/` — the native module bridge
- `src/platform/widget/` — the app-side snapshot writer
  (shared with the Android widget)
- `docs/widgets.md` — the broader widget architecture doc
- `docs/relay.md` — how the relay feeds the widget via push
  notifications (the widget shows the result; the
  notification wakes the app which then rewrites the
  snapshot)
