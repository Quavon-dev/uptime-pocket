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
- **Long-press a monitor to pin it to the top.** The user
  long-presses any monitor on the Monitors tab (the featured
  card OR a row in the list) to pin it as the featured
  monitor — the one shown in the large card at the top of the
  page. Long-pressing the currently-featured monitor unpins it
  (the featured slot disappears; the monitor returns to the
  list in its alphabetical position). The pin is per-server
  (each Kuma server has its own featured monitor, persisted
  across app restarts).
  - Default state has no featured card. The user has to opt
    in by long-pressing. We don't auto-pin the first monitor
    in the list — the user explicitly chooses what's at the top.
  - Haptic feedback fires on long-press (medium impact, the
    same one iOS uses for context-menu reveals) so the user
    has a physical signal that the gesture registered.
  - `MonitorCard` and `MonitorRow` got an `onLongPress` prop
    + `longPressHint` (a11y). Both use the same pattern; the
    handler is `undefined` when the parent doesn't pass one,
    which disables long-press detection entirely.
  - The pin lives in a new `pinned_monitor_by_server` TEXT
    column on the `settings` table (migration v8). The column
    is a JSON map of `serverId → monitorId`. NULL on disk
    ↔ `null` in the typed object. A separate normalized
    table would be cleaner but the JSON column keeps the
    hydration path a single SELECT (the settings store
    already loads one row in disk-read).
  - Defensive parsing: the on-disk JSON is validated on read
    (each value must be a finite number, the outer shape
    must be an object) and an empty `{}` is normalized to
    `null` so the in-memory representation matches "no row
    was set". A corrupt row falls back to `null` rather
    than throwing.
  - `useSettings.setPinnedMonitor(serverId, monitorId | null)`
    handles the in-memory + persistence write; the persist
    call is awaited via the existing `persist` helper, so
    disk failures don't break the in-memory state.
  - New i18n keys `monitors.pin.hint` /
    `monitors.pin.action` / `monitors.pin.actionUnpin` /
    `monitors.pin.pinnedToast` / `monitors.pin.unpinnedToast`
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
- **Accent color picker actually applies.** Picking an accent in
  Settings → Accent used to write the hex to SQLite and into the
  settings store, but the theme hook (`useAppTheme`) hardcoded
  `brand` to `colors.brand[400]`/`[500]` (the static emerald
  stops) and never read the user's pick. The hook now
  subscribes to `accentColor` + `accentSwatchId` from the store
  and exposes a `resolveBrand(accentColor, accentSwatchId)`
  pure helper that picks the user's color (preferring the raw
  hex over the swatch id, falling back to the default swatch
  when neither is set or when the id no longer exists). Every
  consumer of `useAppTheme().brand` (buttons, links, focused
  state, the chart avg line, the kuma-ping palette) now reacts
  to a change in the accent pick with no extra wiring.
  - Only the primary `brand` and its translucent fill react
    to the picker. The full 11-stop brand palette (50..950)
    in `colors.brand` stays static — those are part of the
    design system, not user-configurable. A future polish
    pass could generate the full palette per swatch, but the
    current scope is "the things that should obviously follow
    the accent, follow it".
  - New pure helper `resolveBrand` is unit-tested separately
    so the resolution rules are locked in (raw color wins
    over swatch id, empty/whitespace strings are treated as
    null, stale swatch ids fall back to the default, etc.).
- **"Accent affects status" toggle (default off).** The "up"
  status color can now optionally follow the picked accent
  — flipping the toggle to ON means picking "Rose" turns
  the green "up" dot rose. The other four status colors
  (down / pending / maintenance / paused) stay on their
  static semantic palette regardless of the toggle:
  "down" must always read as red, "pending" must always
  read as amber, etc. The toggle lives in Settings →
  Accent, just below the swatch row.
  - The toggle is **off by default**. A fresh install keeps
    the previous behavior (status colors are independent of
    the accent), and existing installs that upgrade keep
    their previous behavior too. The user has to opt in.
  - The bar segments and the percentage text in `UptimeBar`
    follow the toggle (so the visual stays consistent — if
    the "up" dot is rose, the bar's "up" segments are also
    rose). The chart's `kumaPingColors(brand).avg` line also
    follows the accent when the toggle is on (it's a brand
    color, not a status color).
  - The status palette is exposed on `useAppTheme()` as a
    new `status: { up, down, pending, maintenance, paused }`
    field. Callers that need a specific status color (the
    `StatusPill` dot, the `ServerCard` connection indicator,
    the `ServerPicker` connection dot, the `MonitorCard`
    24h-uptime tile) read from it directly. The pure
    `statusColor()` function in `src/domain/status.ts` is
    unchanged (it's a non-React helper used by code paths
    that don't have a theme context), and the `useAppTheme`
    consumers do an `if status === 'up'` swap so only the
    one slot reacts.
  - New `accent_affects_status` INTEGER column on the
    settings table (migration v9). Default 0. CHECK
    constraint with IN (0, 1) for shape consistency with
    the other boolean columns.
  - New i18n keys `settings.accentSwatch.affectsStatus` /
    `settings.accentSwatch.affectsStatusDescription` in all
    5 locales (en / de / es / fr / ja).

### Fixed
- **Server picker chip layout.** Earlier revisions rendered the
  chip's three children (icon, server name, chevron) as a single
  flex row inside the chip's outer `Pressable`. In some layouts
  the `Pressable`'s default style caused the row direction to
  collapse, stacking the children vertically. The chip now
  separates the outer press surface (padding + border-radius +
  background) from an inner explicit `View` with
  `flexDirection: 'row'`, so the children are always horizontal
  regardless of how the `Pressable` is laid out. The name text
  also gets `flexShrink: 1` so a long server name truncates with
  an ellipsis rather than pushing the chevron off-screen.
- **Server picker modal: inner card is a `View`, not a `Pressable`.**
  The previous `Pressable onPress={() => {}}` no-op could
  intercept tap events in subtle ways and added unnecessary
  perf overhead. A plain `View` is the correct primitive for a
  non-interactive container; the backdrop `Pressable` still
  handles dismiss.
- **GlassNavBar side slots are no longer flex-1.** The left and
  right slots had `flex: 1`, which on narrow screens constrained
  the server picker chip to 1/5 of the available width — wide
  enough to fit the icon but not the name, so the chip's
  children were squished and stacked. The slots now use
  `flexShrink: 0` so the `+` button (left) and the server
  picker (right) take their natural width. The centered title
  slot gets `flex: 1` + `flexShrink: 1` + horizontal padding, so
  it fills the remaining space and truncates cleanly with an
  ellipsis if the two side controls are wider than the row.
- **Monitors tab: tighter top, no large title.** The `Monitors`
  title no longer uses the 32pt display variant; the nav bar
  is now a single 44pt row (left = `+` add monitor, center =
  "Monitors" title at body-emphasized 15pt, right = server
  picker chip). The screen header is one tight band instead of
  two stacked rows.
- **Monitors tab nav bar: `+` lives next to the big "Monitors"
  headline, on the same row.** The `+` add-monitor button is
  rendered in the new `inline` slot on `GlassNavBar`, so the
  big left-aligned "Monitors" title and the `+` sit in the
  same row and read as a single visual band at the top of the
  screen. The top 44pt nav row is empty (no small title) since
  the big title already conveys the section name.
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

### Removed
- (none in this release — the `inline` slot on `GlassNavBar` is
  back in use; the `+` add-monitor button is rendered there so
  it sits on the same row as the big "Monitors" headline.)

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
