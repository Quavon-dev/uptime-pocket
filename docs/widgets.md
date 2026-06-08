# Home screen widgets

Uptime Pocket ships with an Android home screen widget built on
[Jetpack Glance](https://developer.android.com/jetpack/compose/glance).
This doc covers what's implemented, what the architecture looks
like, and what the user (you) needs to do to ship it.

## Why a widget?

The point of "Uptime Pocket" is to keep an eye on your services
*without opening the app*. The home screen widget is the most
visible manifestation of that — you see your service health at a
glance, even when the app is closed and the screen is locked.

## What you see

A 4×2 (default) widget cell showing:

- A header dot — green if everything is up, red if anything is down
- The app name
- "N/M online" (how many of your Kuma servers are currently connected)
- Up to 6 monitors, sorted by severity (DOWN first, then by recency)
- Each row: a colored status dot, the monitor name (truncated to 22
  chars), the server label, and the last response time / check time

Tap a row to open the app at the monitor detail screen (deep-linked
via `MainActivity`).

The widget shrinks to 2×2 (just the header + 2 monitors) and grows
to 4×4 (header + all 6 + 2 more via scroll). Glance's `SizeMode.Exact`
handles the layout.

## Architecture

```
┌──────────────────────────────────────────────┐
│  Main app process (React Native)             │
│                                              │
│  useMonitors (Zustand) ──┐                   │
│  useServers    (Zustand) │                   │
│                          ▼                   │
│                   useWidgetSnapshot          │
│                          │                   │
│                          ▼                   │
│                  writeSnapshotFile           │
│                          │                   │
└──────────────────────────┼───────────────────┘
                           │  /data/data/de.quavon.uptimepocket/files/
                           ▼  widget_snapshot.json
┌──────────────────────────────────────────────┐
│  Widget process (Android system)             │
│                                              │
│  UptimeWidgetReceiver                        │
│       │                                      │
│       ▼                                      │
│  UptimeWidget (Glance)                       │
│       │                                      │
│       ▼                                      │
│  WidgetSnapshotReader.read(context)          │
│       │                                      │
│       ▼                                      │
│  Compose UI rendered onto the home screen   │
└──────────────────────────────────────────────┘
```

The two processes can't share memory (the widget is owned by the
OS's app widget host). They DO share the app's `filesDir` because
they have the same UID. So we pass data as a small JSON file.

## What the data looks like

`widget_snapshot.json` (UTF-8, ~2-5 KB even with many monitors):

```json
{
  "version": 1,
  "generatedAt": 1749426000000,
  "servers": [
    {
      "id": "abc-123",
      "name": "Production",
      "connected": true,
      "worstStatus": "down",
      "monitors": [
        {
          "id": "abc-123::42",
          "name": "API",
          "status": "down",
          "lastCheckAt": 1749425995000,
          "responseTime": null,
          "serverLabel": "Production"
        }
      ]
    }
  ]
}
```

Versioned (currently `1`) so the Kotlin reader can reject unknown
versions and the JS writer can bump without breaking older
installed widgets.

## Refresh strategy

The widget updates when **one of** these happens:

1. The React app writes a new snapshot (debounced 2s). The OS
   doesn't get a "widget redraw" signal from this — the widget
   just reads the new file on its next refresh.
2. The OS triggers `APPWIDGET_UPDATE` (default: every 30 minutes
   via `updatePeriodMillis`). On a fresh render, the widget reads
   the latest file.
3. The user taps the widget (rebuilds the screen and re-reads).

To force an immediate redraw after a critical socket event, the
React app can call `forceWidgetRefresh()` (it writes the file
without the 2-second debounce). The widget will still re-read
on its next tick — there's no public API to push an update
from a non-system app to a widget on Android 12+.

## Files in this repo

```
src/platform/widget/                   # React Native side
  snapshot.ts            # pure: Monitor[] → JSON shape
  useWidgetSnapshot.ts   # hook: subscribes to stores, debounced
  storage.ts             # writes the JSON file via expo-file-system
  index.ts               # public exports
  __tests__/snapshot.test.ts   # 13 unit tests

plugins/android-widget/                # Android side
  plugin.ts              # Expo config plugin
  android/app/src/main/
    java/de/quavon/uptimepocket/widget/
      WidgetSnapshot.kt        # data classes
      WidgetSnapshotReader.kt  # JSON parser
      UptimeWidget.kt          # Glance widget + receiver
    res/
      drawable/widget_status_*.xml   # 5 status dot drawables
      xml/uptime_widget_info.xml     # AppWidgetProviderInfo
      values/widget_strings.xml      # widget label + description
```

## What the user needs to do

The code is complete, but to ship the widget, you need to:

1. **Build the Kotlin module.** Expo's `expo prebuild` will
   generate the `android/` directory and our plugin will run.
   Then open `android/` in Android Studio and let Gradle sync
   (it'll pull Glance + Compose deps). The first sync takes a
   few minutes.

2. **Run on a device or emulator.** The widget shows up in
   the widget picker (long-press the home screen → Widgets →
   "Uptime Pocket"). The widget will show "Open Uptime Pocket
   to start" until the app has been opened at least once and
   has written a snapshot.

3. **(Optional) Customize the widget preview.** The plugin
   uses `@drawable/widget_status_up` as the preview image in
   the widget picker. To replace it with a real preview,
   drop a PNG into `plugins/android-widget/android/app/src/main/res/drawable-nodpi/`
   named `widget_preview.png` and update `uptime_widget_info.xml`.

4. **(Optional) Add a more advanced layout.** The current
   implementation is a single `LazyColumn`. If you want a
   true "compact" view for 2×2 cells, fork `UptimeWidget.kt`
   and switch on `LocalSize.current` to render differently
   for narrow widths.

## Known limitations

- **No iOS widget yet.** WidgetKit requires Swift code + a paid
  Apple Developer account to test on a real device. The folder
  `src/platform/widget/ios/` is a placeholder. The plan is to
  build this in a separate commit when the user is ready to
  invest in the Apple side.
- **No "compact" view.** We render the same layout at all sizes;
  Glance shrinks the row heights but the column count doesn't
  change. A 2×2 cell will look cramped. Adding a compact layout
  is a ~30-line follow-up.
- **No widget configuration activity.** When the user adds the
  widget, it goes straight to the default 4×2 view. To let users
  pick which server / which subset of monitors to show, you'd
  add a `appwidget-provider` action and a configuration activity.
  This is a v1.1 feature.
