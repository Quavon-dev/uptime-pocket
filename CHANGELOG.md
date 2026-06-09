# Changelog

All notable changes to Uptime Pocket are documented here.
Versions follow [SemVer](https://semver.org/) loosely:
`MAJOR.MINOR.PATCH` where MAJOR is a breaking change to the
Kuma protocol, MINOR is a new feature, PATCH is a bugfix.

## [Unreleased]

### Added
- **UPTIME bar on the monitors list.** Every monitor in the list
  (both the featured `MonitorCard` and the compact `MonitorRow`)
  now renders a Kuma-style segmented history strip below the URL,
  so the user can scan a list of services and see the recent
  health of each one at a glance — no need to tap into detail.
  The bar subscribes to the monitor's cached heartbeat history
  (per-row subscription, so a single check event only re-renders
  that one row). The bar is only rendered when `serverId` is
  provided, so the design-system showcase still works.
  - `UptimeBar` got a `variant: 'full' | 'compact'` prop. `full`
    is the existing Kuma-style block ("UPTIME" label + bar +
    "Uptime / XX.XX%" footer), now used in the card and the
    detail screen. `compact` is the bar only, used in the row.
  - The bucketing math is now a pure helper
    (`bucketUptimePoints`) so it can be unit-tested without
    rendering. The percentage color follows the same threshold
    as the rest of the app: green ≥99%, amber ≥95%, red below.
  - Segments are `importantForAccessibility="no-hide-descendants"`
    — a screen reader reading "75 of 100 segments" would be
    noise; the percentage in the footer + the parent card/row's
    status pill convey the state instead.
  - New i18n keys `monitors.bar.label` / `monitors.bar.caption`
    in all 5 locales (en / de / es / fr / ja).
- **Server picker (cooler dropdown) in the nav bar.** The server
  switcher used to be a small chip floating in the top-right
  corner of the monitors tab, well above the title. It now sits
  inline next to the large "Monitors" title (via the new
  `inline` slot on `GlassNavBar`). Tapping it opens a centered
  modal listing every configured Kuma server — each row shows a
  status dot (green = connected, gray = disconnected), the
  server name + URL, and a check mark for the active one.
  Picking a server calls `manager.connect(newId)` which tears
  down the previous socket and connects to the new one.
  - New `ServerPicker` component (`src/components/server/ServerPicker.tsx`).
  - New i18n keys `servers.picker.title` / `servers.picker.label`
    / `servers.picker.hint` in all 5 locales.
- **SegmentedControl replaces the filter Chip scroller.** The
  monitors tab used to render `All / Up / Down` as three Chips
  inside a horizontal ScrollView (mixed with per-tag chips). They
  are now a `SegmentedControl` (the same sliding indicator the
  detail screen uses for its time-range selector), giving the
  filter row the same visual language as the rest of the app.
  Per-tag chips stay in their own horizontal scroller, rendered
  only when at least one monitor has a tag.

### Fixed
- **SegmentedControl indicator no longer overflows the track.**
  Earlier revisions used a hardcoded `height` on the absolutely
  positioned indicator, which on iOS could render taller than
  the surrounding track (the label's ascender/descender pushed
  the segment taller than the declared `paddingVertical +
  lineHeight`). The track is now a fixed-height container and
  the indicator is positioned with `top` / `bottom` set to the
  track's padding value, so it always matches the content area
  regardless of font metrics. Same shape on Android and iOS.
- **Incident normalizer: status=3 (maintenance) is now correctly
  classified.** `normalizeIncident` used to label anything other
  than status=0 as `'recovery'`, so a `down → maintenance`
  transition (status=3) would have shown up as "Recovered" in
  the Incidents tab. It's now `'maintenance_start'`, matching
  the Kuma web SPA's treatment. Status=2 (pending) still falls
  through to `'recovery'` as a best-effort default (Kuma doesn't
  fire `incident` for pending in practice).

### Changed
- **Auth: bearer-token option removed.** The form previously offered
  "API token" as a sign-in method, but Kuma 2.x's socket.io
  `loginByToken` only accepts JWTs (not the API Keys its own
  "Settings → API Keys" dashboard creates), so pasting an API key
  there caused the connection to hang on `authInvalidToken`. The
  sign-in form is now username + password only; the app logs in
  once with the password, gets a JWT from Kuma, and caches it
  in the platform secure store for subsequent reconnects. The
  `BearerSession` class and the `authKind: 'bearer'` schema value
  are gone (DB v7 migration relaxes the old CHECK constraint).
  Docs: `docs/auth.md`.

### Added
- v0.6.0 work-in-progress: D6 privacy policy, D7 store
  metadata, D2 Sentry, C1/C2 widgets. See ROADMAP.md.

## [0.5.0] — 2026-06-08

### Added
- **Push notification relay** (`relay/`). A small Go service
  that watches one or more Uptime Kuma instances via
  Prometheus metrics scraping, diffs the state, and forwards
  transitions to APNs (iOS) and FCM (Android). Self-hostable
  on any host that runs Docker — GitHub Container Registry
  image, plus guides for Render, DigitalOcean, and a home
  server.
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
  - Deploy guides for Render, DigitalOcean, and docker-compose,
    plus a CI workflow that publishes a multi-arch image to
    GitHub Container Registry on every `relay-v*` tag.

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
