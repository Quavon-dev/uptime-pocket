# Uptime Pocket

> A first-class mobile companion for self-hosted Uptime Kuma.
> Free, open source, native-feeling.

Uptime Pocket is the iOS and Android app for [Uptime Kuma](https://github.com/louislam/uptime-kuma) — a beautiful, self-hosted monitoring tool. It brings your monitors, incidents, and notifications to your pocket with native Liquid Glass UI on iOS 26+ and Material 3 Expressive on Android.

> **Latest: [v0.3.0 — Phase 2: Auth + Servers](https://github.com/Quavon-dev/uptime-pocket/releases/tag/v0.3.0)** — persistence, secure credentials, live Kuma connections, onboarding flow.

## Features

- 📱 **Native UI** — iOS 26 Liquid Glass, Material 3 Expressive on Android, buttery 120fps animations
- 🔌 **Multi-server** — connect to all your Kuma instances from one app
- 🔐 **Secure auth** — bearer tokens (Kuma 2.0+) or username/password, stored in iOS Keychain / Android Keystore
- 🔔 **Smart notifications** — choose between direct socket connection or self-hosted push relay
- 🏠 **Home screen widgets** — glanceable monitoring on iOS and Android, including Lock Screen
- 📊 **Rich detail view** — 24h/7d/30d response time charts, uptime bars, incident history
- ⚡ **Live updates** — real-time status changes via socket.io
- 🌗 **Light / Dark** — system, manual, or auto
- 🔒 **Biometric lock** — Face ID, Touch ID, fingerprint
- 🌍 **Open source** — MIT licensed, no telemetry, no ads, no analytics

## Quick start

```bash
# Install dependencies
npm install

# Run on iOS (macOS only)
npm run ios

# Run on Android
npm run android

# Run on web (limited - widgets don't work in browser)
npm run web
```

The first time you launch the app, you'll see the **Add a server** empty state in the Monitors tab. Tap the **+** in the Servers tab, paste your Kuma URL + API token, and you're connected. The dev sample seed has been removed; Uptime Pocket now boots into a clean state.

## What's in the app

- **Monitors tab** — list of all monitors with status pills, uptime, response time. Tap to see detail with response time chart, uptime bar, and recent incidents.
- **Incidents tab** — placeholder for v1.0; will show history of monitor down/recovery events.
- **Servers tab** — manage Kuma server connections. Tap the **+** to add a new server.
- **Settings tab** — theme switcher, app info, and a link to the **Design System** screen (showcase of every component in light + dark).
- **Add Server** — form with bearer token (recommended) or username/password auth.
- **Server switcher** — accessible from the Monitors tab header.

## Requirements

- Node.js 20+
- For iOS development: macOS with Xcode 17+
- For Android development: Android Studio with API 26+ SDK
- Expo Go app on your phone (for development)

## Tech stack

- [Expo SDK 56](https://docs.expo.dev/versions/v56.0.0/) (Universal App, New Architecture)
- [Expo Router 56](https://docs.expo.dev/router/introduction/) (file-based routing)
- [NativeWind v5](https://www.nativewind.dev/) (Tailwind CSS for React Native)
- [Reanimated 4](https://docs.swmansion.com/react-native-reanimated/) (UI-thread animations)
- [expo-glass-effect](https://docs.expo.dev/versions/v56.0.0/sdk/glasseffect/) (iOS 26 Liquid Glass)
- [expo-notifications](https://docs.expo.dev/versions/v56.0.0/sdk/notifications/) (push + local)
- [expo-sqlite](https://docs.expo.dev/versions/v56.0.0/sdk/sqlite/) (server metadata persistence)
- [expo-secure-store](https://docs.expo.dev/versions/v56.0.0/sdk/securestore/) (iOS Keychain / Android Keystore credential vault)
- [socket.io-client](https://socket.io/) (live updates)
- [Zustand](https://zustand-demo.pmnd.rs/) (state)
- [Zod](https://zod.dev/) (validation)
- [Jest](https://jestjs.io/) + [jest-expo](https://docs.expo.dev/guides/testing/) (unit tests)

## Repository structure

```
uptime-pocket/
├── app/                  # Expo Router screens
│   ├── (tabs)/           # Tab bar (Monitors, Incidents, Servers, Settings)
│   ├── servers/          # Add server / server detail
│   └── welcome.tsx       # First-launch onboarding
├── src/
│   ├── components/       # Reusable UI
│   │   ├── ui/           # Primitives (Button, Chip, Tag, EmptyState, …)
│   │   ├── monitor/      # MonitorCard, MonitorRow
│   │   ├── server/       # ServerCard, ServerSwitcher
│   │   └── chart/        # ResponseTimeChart, UptimeBar
│   ├── theme/            # Design tokens (colors, spacing, type)
│   ├── domain/           # Pure business logic + models
│   ├── data/             # I/O layer
│   │   ├── api/          # REST client + Kuma auth
│   │   ├── socket/       # socket.io client
│   │   ├── db/           # SQLite schema, migrations, repository
│   │   ├── secure/       # Credential vault (SecureStore wrapper)
│   │   ├── connection/   # KumaConnectionManager
│   │   └── store/        # Zustand stores (servers, monitors, settings)
│   ├── features/         # Feature hooks (e.g. useServersHydrated)
│   ├── platform/         # Native bridges (widgets)
│   ├── lib/              # Utilities
│   └── i18n/             # Translations
├── tests/                # Jest unit tests
├── relay/                # Optional self-hosted push relay (Go)
├── docs/                 # Documentation
├── assets/               # Images, fonts
├── jest.config.js        # Jest configuration (jest-expo preset)
└── jest.setup.ts         # Global mocks (expo-secure-store, expo-sqlite)
```

## Phase 2 architecture

Phase 2 introduces a clear split between **server metadata** (SQLite) and **credentials** (SecureStore), and a single source of truth for Kuma connections.

### Storage split

| Data | Lives in | Why |
|---|---|---|
| Server metadata (id, name, url, auth kind, version, connection state) | **SQLite** (`servers` table) | Needs to be queryable, orderable, joinable. |
| Auth secrets (bearer tokens, passwords) | **expo-secure-store** (iOS Keychain / Android Keystore) | Encrypted at rest by the OS. The `Server` type has no field for a secret — secrets only exist transiently in `KumaConnectionManager`. |

The in-memory `servers` Zustand store mirrors the SQLite rows (via `useServersHydrated()`). To actually connect to a Kuma instance, the connection manager calls `loadCredentials(serverId)` and the secret never enters React state.

### Connection lifecycle

`KumaConnectionManager` owns the socket + REST lifecycle for the **active** server:

1. `connect(serverId)` → loads creds from SecureStore → opens socket → sets monitors store status to `connecting`.
2. On socket `connect` event → status becomes `connected`, version is recorded, `serversRepo.setConnected(true)` persists to SQLite.
3. On socket `disconnect` / error → status reflects the failure; `recheck()` re-attempts; `pause()` / `resume()` control backoff.
4. `disconnect(serverId)` tears down the socket, clears the connection state in both stores and SQLite.

`useKumaConnection()` hook keeps the manager in sync with `activeServerId` — it auto-connects to the new active server and disconnects from the old one on switch. It also cleans up on unmount.

### Security model

- `Server.auth` (full strategy) was removed in v0.3.0. Server records carry only `authKind: 'bearer' | 'password'`.
- The credential load path is zod-validated. Empty / malformed values return `null`, and the manager surfaces a "No credentials stored" error.
- Credentials are namespaced by server id (`uptime-pocket.cred.<serverId>`) and never written to logs or state.

## Documentation

- [Architecture](docs/architecture.md)
- [Authentication](docs/auth.md) — bearer token vs username/password
- [Notifications](docs/notifications.md) — None / Direct / Relay modes
- [Push relay](docs/relay.md) — optional self-hosted push server
- [Design system](docs/design-system.md)

## Testing

```bash
# Unit tests (Jest + jest-expo)
npm test

# TypeScript
npm run typecheck

# Lint
npm run lint

# React Doctor — broader code health scan
npm run lint:doctor
```

Jest is configured via `jest.config.js` (jest-expo preset) and `jest.setup.ts` (global mocks for `expo-secure-store` and `expo-sqlite`). Unit tests live under `tests/` mirroring the `src/` structure.

We also have [Maestro](https://maestro.mobile.dev/) flows under `.maestro/` for end-to-end smoke tests.

## Known caveats

- **Web bundling is blocked** by an `expo-sqlite` wasm bundler issue. iOS and Android builds are unaffected. We don't ship web in this release.
- **`npm audit` flags 12 pre-existing vulnerabilities** (mostly `drizzle-orm`, `uuid`, and Expo transitive deps). None are reachable from our code. Tracked for a follow-up.

## Contributing

We welcome PRs! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Before opening a PR:
- Run `npm run lint` and `npm run typecheck`
- Run `npm test` (we use Jest + Maestro for E2E)
- Add tests for new functionality
- Update docs if you change user-facing behavior

## Security

Found a security issue? Please see [SECURITY.md](SECURITY.md) — don't open a public issue.

## License

MIT © 2026 [Quavon-dev](https://github.com/Quavon-dev)

This project is not affiliated with the official Uptime Kuma project, but shares its spirit of self-hosted, privacy-respecting software.

## Acknowledgments

- [Uptime Kuma](https://github.com/louislam/uptime-kuma) by [@louislam](https://github.com/louislam) — the amazing monitoring tool this app is built for
- [Expo](https://expo.dev) — for the SDK that makes this app possible
- All our [contributors](https://github.com/Quavon-dev/uptime-pocket/graphs/contributors) — thank you!
