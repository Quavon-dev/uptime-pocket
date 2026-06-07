# Changelog

All notable changes to Uptime Pocket are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-06-07 — Phase 2: Auth + Servers

### Added

- **SQLite persistence** for server metadata (`servers` table) with an idempotent migration runner.
- **`expo-secure-store` credential vault** with zod validation, namespaced by server id.
- **`KumaConnectionManager`** class + **`useKumaConnection()`** hook — owns the socket + REST lifecycle for the active server and bridges events into Zustand stores.
- **Live `monitors` store** with per-server maps for status, errors, monitors, and incidents.
- **`/welcome` onboarding screen** + `OnboardingGate` in `app/_layout.tsx` (routes between `/welcome` and `/` based on `servers.length`).
- **`/servers/[id]` server detail screen** with live connection banner, outdated-Kuma warning, metadata, notification mode, and delete confirm dialog.
- **Version detection** via `GET /api/status` on connect — outdated Kuma (< 2.0.0) is surfaced in the UI.
- **Jest infrastructure** (`jest.config.js`, `jest.setup.ts`) with in-memory mocks for `expo-secure-store` and `expo-sqlite`. 13 unit tests across credentials and the connection manager.
- **Add Server flow rewired** with zod validation, persistence, version probe, and a `useReducer` state model.

### Changed

- `Server.auth` (full strategy) → `Server.authKind` (`'bearer' | 'password'`). **Secrets no longer exist in the in-memory store.**
- Servers tab rebuilt: persisted list, live `connectionStatus` prop, long-press to set active.
- Monitors tab wired to live data with filter chips (All / Up / Down) and connection status banner.

### Quality gates

- `npm test` — 13/13 passing
- `npm run typecheck` — 0 errors
- `npm run lint` — clean
- `npm run lint:doctor` — No issues found (69 files scanned)
- `npx expo prebuild --platform ios` — succeeds

### Known caveats

- Web bundling is blocked by an `expo-sqlite` wasm bundler issue. iOS/Android unaffected.
- `npm audit` flags 12 pre-existing transitive vulnerabilities, none reachable from our code.

## [0.2.0] — 2026-06-07 — Phase 1: Design System

### Added

- **UI primitives** in `src/components/ui/`: `Button`, `Chip`, `SegmentedControl`, `Tag`, `EmptyState`, `ErrorState`, `icons.tsx` (Lucide wrapper).
- **Monitor components** in `src/components/monitor/`: `MonitorCard`, `MonitorRow`.
- **Server components** in `src/components/server/`: `ServerCard`, `ServerSwitcher`.
- **Chart components** in `src/components/chart/`: `ResponseTimeChart` (Reanimated 4 fade-in), `UptimeBar`.
- **`/design-system` Storybook** — every component rendered in light + dark.
- **`/monitors/[monitorId]`** detail screen with chart, uptime bar, and actions.
- **`/servers/switch`** server switcher modal.
- `react-doctor` integration; fixed all 110 lint issues from the initial pass.

### Removed

- Dev sample data seed. Chart fixtures now live in a dedicated file. App boots into a clean state.

## [0.1.0] — 2026-06-07 — Phase 0: Foundation

- Initial commit. Expo SDK 56 scaffold, Expo Router, NativeWind v5, Reanimated 4, Zustand, Zod, the AGENTS.md / CLAUDE.md / docs layout.

[0.3.0]: https://github.com/Quavon-dev/uptime-pocket/releases/tag/v0.3.0
[0.2.0]: https://github.com/Quavon-dev/uptime-pocket/releases/tag/v0.2.0
[0.1.0]: https://github.com/Quavon-dev/uptime-pocket/releases/tag/v0.1.0
