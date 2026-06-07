# Architecture

Uptime Pocket is built on [Expo SDK 56](https://docs.expo.dev/versions/v56.0.0/) with the New Architecture enabled. The codebase is split into clear layers.

## Layers

```
┌─────────────────────────────────────────┐
│  app/  — Expo Router screens (UI tree)  │
├─────────────────────────────────────────┤
│  src/features/  — React hooks          │
├─────────────────────────────────────────┤
│  src/components/  — Reusable UI         │
├─────────────────────────────────────────┤
│  src/domain/  — Pure business logic     │
├─────────────────────────────────────────┤
│  src/data/  — API + socket + stores     │
├─────────────────────────────────────────┤
│  src/platform/  — Native bridges        │
└─────────────────────────────────────────┘
```

### Domain (`src/domain/`)

Pure TypeScript. No React, no fetch, no async I/O. Just types and pure functions.

- `models/` — `Monitor`, `Server`, `Incident`, etc.
- `status.ts` — `statusColor(status)`, `isHealthy(status)`
- `format.ts` — `formatUptime(99.95)`, `formatDuration(ms)`

### Data (`src/data/`)

Talks to the network and persists state.

- `api/` — REST client (`KumaClient`) and auth strategies
- `socket/` — socket.io client (`KumaSocket`) with auto-reconnect
- `db/` — Drizzle ORM + expo-sqlite (Phase 2)
- `repos/` — repository pattern (Phase 2)
- `store/` — Zustand stores (servers, settings, monitor cache)

### Features (`src/features/`)

React hooks that compose domain + data + state.

- `servers/use-add-server.ts` — manages the add-server flow
- `monitors/use-monitors.ts` — subscribes to the socket stream
- `notifications/use-push-handler.ts` — handles incoming pushes

### Components (`src/components/`)

Reusable UI. Grouped by purpose.

- `glass/` — `<GlassSurface>`, `<GlassNavBar>` (Liquid Glass wrappers)
- `status/` — `<StatusPill>`, `<HeartbeatPulse>` (Reanimated)
- `monitor/` — `<MonitorCard>`, `<MonitorRow>` (Phase 1)
- `chart/` — `<ResponseTimeChart>`, `<UptimeBar>` (Phase 1)
- `server/` — `<ServerCard>`, `<ServerSwitcher>` (Phase 1)
- `primitives/` — base `<Text>`, `<View>` (NativeWind mapping)

### App (`app/`)

Expo Router file-based routes.

- `app/_layout.tsx` — root providers
- `app/(tabs)/` — native tab group
- `app/servers/add.tsx` — add server modal screen

### Platform (`src/platform/`)

Native bridges for OS-level features.

- `widget/ios/` — Swift code for iOS WidgetKit
- `widget/android/` — Kotlin code for Android App Widget
- `bridge.ts` — typed exports to the JS layer

## Data flow

```
User taps button
    ↓
Component (app/)
    ↓
Hook (features/)
    ↓
Action → Store / API / Socket
    ↓
State update (Zustand)
    ↓
Hook re-renders
    ↓
Component re-renders
```

## Cross-cutting concerns

- **Theme** — `src/theme/` provides tokens; consumed via `colors.brand[500]` etc.
- **i18n** — `src/i18n/` provides `t()` / `tn()`; English only in v1.0
- **Haptics** — `expo-haptics` directly; we'll wrap in a hook in Phase 1
- **Logging** — `src/lib/log.ts` (TODO)
- **Errors** — `KumaError` in `src/data/api/client.ts`; result types in `src/lib/result.ts` (TODO)
