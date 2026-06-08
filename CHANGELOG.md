# Changelog

All notable changes to Uptime Pocket are documented here.
Versions follow [SemVer](https://semver.org/) loosely:
`MAJOR.MINOR.PATCH` where MAJOR is a breaking change to the
Kuma protocol, MINOR is a new feature, PATCH is a bugfix.

## [Unreleased]

### Added
- v0.6.0 work-in-progress: D6 privacy policy, D7 store
  metadata, D2 Sentry, C1/C2 widgets. See ROADMAP.md.

## [0.5.0] — 2026-06-08

### Added
- **Push notification relay** (`relay/`). A small Go service
  that watches one or more Uptime Kuma instances via
  Prometheus metrics scraping, diffs the state, and forwards
  transitions to APNs (iOS) and FCM (Android). Self-hostable
  on Fly.io, Render, DigitalOcean, or a home server.
  - HTTP API: `POST /v1/devices`, `DELETE /v1/devices`,
    `GET /v1/health`, `GET /v1/version`.
  - Bearer-token auth (single key for v1.0; per-device
    tokens in v1.1).
  - Coalesce rule: 3+ transitions on the same Kuma instance
    within 30s collapse into a single "critical" alert.
  - Quiet hours honored server-side, so the user gets muted
    even when their phone is locked.
  - BoltDB-backed state. 1KB per device.
  - App-side client: `src/data/relay/client.ts` (HTTP) +
    `src/features/notifications/useRelayRegistration.ts`
    (lifecycle hook).
  - Deploy guides for Fly.io, Render, DigitalOcean, and
    docker-compose.

### Changed
- App-side notification flow now has a 3rd mode (`'relay'`)
  alongside `'direct'` and `'none'`. The setting was already
  in the domain model; the UI surfaces it via the
  `useRelayRegistration` hook.

## [0.4.0] — 2026-06-07

### Added
- **Background fetch + connection revalidation.**
  `expo-background-fetch` + `expo-task-manager` wake the
  app every ~15 min on Android (WorkManager) or whatever
  schedule iOS gives us, and the connection manager's
  new `revalidateActiveServer()` re-establishes the Kuma
  socket. For always-on delivery, the relay is the
  recommended path; background fetch is the no-credentials
  fallback.
- **i18n.** Five locales (en, de, fr, ja, es), a new
  `src/i18n/` module with parity-enforced translation
  files, and a language picker in the Settings tab. The
  device's system locale is used by default; explicit
  override persists to SQLite.
- **Accessibility audit.** Roles, labels, and decorative
  hiding on every interactive primitive. Static-analysis
  test suite (`tests/a11y/`) locks the structural
  commitments. `docs/accessibility.md` has the on-device
  manual checklist.
- **Maestro E2E flows.** Nine flows covering launch,
  add-server, theme, language, biometric, design system,
  notifications permission, servers list, and a one-shot
  smoke test. See `.maestro/README.md`.
- **Android adaptive icon validator.** A pre-prebuild
  check that the three adaptive-icon PNGs are the right
  shape, have a safe zone, and that the monochrome layer
  uses the alpha channel correctly. Currently flags the
  shipped `android-icon-monochrome.png` for re-export.

### Changed
- **Settings persistence.** Settings are now in SQLite
  (v2 migration), not in-memory. Every setter writes
  through to disk before updating the in-memory store.
  New fields: `locale`, `accentSwatchId`.
- **Connection manager singleton.** `getConnectionManager()`
  replaces the per-mount manager, so the background fetch
  task and the React tree share the same socket.

## [0.3.0] — 2026-06-05

### Added
- Auth + servers (bearer + password). Socket-only auth
  against Kuma 2.3+.
- Add / edit / delete servers.
- Add / edit / delete monitors via the Kuma 2.3+ socket.
- Tag-based filter chips on the home tab.

## [0.2.0] — 2026-05-30

### Added
- Full design system: tokens, typography, spacing, motion.
- Light + dark mode with system-follow default.
- All primitive components (Button, Card, Chip, Segmented
  Control, TimePicker, etc).
- A11y scaffolding (a11yRole, a11yLabel, etc on primitives).

## [0.1.0] — 2026-05-15

### Added
- Project scaffold: Expo SDK 56, Expo Router, NativeWind,
  Reanimated, expo-notifications, socket.io-client, Zustand,
  Zod.
- Tabs layout, monitors placeholder, theme tokens.

[Unreleased]: https://github.com/Quavon-dev/uptime-pocket/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Quavon-dev/uptime-pocket/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Quavon-dev/uptime-pocket/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Quavon-dev/uptime-pocket/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Quavon-dev/uptime-pocket/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Quavon-dev/uptime-pocket/releases/tag/v0.1.0
