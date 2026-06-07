# Design System

> v0.2.0 — full design system in place. Live at `/design-system` in the app.

## Philosophy

**"Kuma's data, Apple's chrome, homelabber-grade density."**

- iOS 26 Liquid Glass for chrome
- Material 3 Expressive for Android
- Status colors are semantic, not decorative
- Density over decoration
- Animations earn their time

## Tokens

All design tokens live in `src/theme/`. Use these instead of raw values.

### Colors

```typescript
import { colors } from '@/theme';

// Brand
colors.brand[500] // primary brand (emerald, parked for final logo)

// Status (semantic)
colors.status.up          // #10B981
colors.status.down        // #EF4444
colors.status.pending     // #F59E0B
colors.status.maintenance // #3B82F6
colors.status.paused      // #6B7280

// Surfaces
colors.surface.light.elevated // cards, modals
colors.surface.light.sunken   // inputs, secondary
colors.surface.light.border   // dividers

// (And equivalent for dark)
```

### Typography

```typescript
import { typography } from '@/theme';

typography.display  // 32pt bold (large titles)
typography.title    // 22pt semibold (section headers)
typography.heading  // 17pt semibold
typography.body     // 15pt regular
typography.callout  // 14pt regular
typography.caption  // 12pt regular
typography.micro    // 10pt uppercase
typography.mono     // monospaced (server URLs, etc.)
```

### Spacing

```typescript
import { semanticSpacing, semanticRadius } from '@/theme';

semanticSpacing.xs   // 4
semanticSpacing.sm   // 8
semanticSpacing.md   // 12
semanticSpacing.lg   // 16
semanticSpacing.xl   // 24

semanticRadius.card   // 16
semanticRadius.button // 16
semanticRadius.pill   // 9999 (full)
semanticRadius.sheet  // 20
```

### Motion

```typescript
import { duration, spring } from '@/theme';

duration.fast   // 200ms
duration.normal // 300ms
duration.slow   // 450ms

spring.snappy  // press feedback
spring.smooth  // transitions
spring.bouncy  // status changes
spring.gentle  // large surfaces
```

## Icon set

We use **Lucide** (`lucide-react-native@1.17.0`) — 1000+ icons in a consistent stroke-based style.

```typescript
import { Globe, Server, Plus, monitorTypeIcon } from '@/components/ui';

// All Lucide icons are re-exported from our ui module
// Plus a few helpers like monitorTypeIcon() that maps Kuma types to icons
```

Lucide gives us cross-platform consistency. We use the same icons on iOS and Android, sized at 16/20/24/32/48 from our token scale.

## Components

All components in `src/components/`. Use these instead of building from scratch.

### Status & feedback

- **`<StatusPill status="up" size="md" />`** — colored dot + label. The most-used component in the app.
- **`<HeartbeatPulse color="..." active />`** — animated pulsing dot. Use to indicate "live" data.
- **`<EmptyState icon={Server} title="..." body="..." action={...} />`** — illustrated placeholder.
- **`<ErrorState title="..." body="..." onRetry={...} />`** — error display with retry.

### Buttons & selection

- **`<Button label="..." variant="primary" size="md" />`** — primary / secondary / ghost / destructive variants. With iOS press scale + Material ripple + haptics.
- **`<Chip label="..." selected onPress={...} />`** — for filters.
- **`<SegmentedControl options={...} value onChange />`** — for range pickers and binary toggles. Animated sliding indicator.

### Surfaces

- **`<GlassSurface variant="regular" radius={16} />`** — Liquid Glass on iOS 26+, BlurView fallback for older iOS, Material 3 Expressive on Android.
- **`<GlassNavBar title="..." large />`** — top app bar with Liquid Glass. Back/menu support.

### Monitors

- **`<MonitorCard monitor={...} onPress={...} />`** — large card for featured monitors and detail header.
- **`<MonitorRow monitor={...} onPress={...} />`** — dense list row.

### Server

- **`<ServerCard server={...} isActive monitorCount={...} />`** — single server display.
- **`<ServerSwitcher onClose={...} />`** — bottom-sheet-style server switcher.

### Charts

- **`<ResponseTimeChart data={...} width height color />`** — SVG line chart with Reanimated path-draw animation. Color = status.
- **`<UptimeBar data={...} segments={50} />`** — segmented bar showing uptime over time. Each segment is a colored bucket.

### Tags

- **`<Tag tag={{ id, name, color }} showDot />`** — small colored label for monitor tags.

## Conventions

- **Use tokens, not raw values.** If you find yourself writing `padding: 13`, add a token instead.
- **Status color is semantic.** Never use `colors.status.down` for a brand element.
- **Animations should be subtle.** If the user notices the animation, you've gone too far.
- **Hit areas are 44pt minimum.** Tap targets should be finger-sized.
- **Respect the platform.** iOS gestures on iOS, Material gestures on Android.
- **Never invent your own components.** If a component doesn't exist, add it to `src/components/ui/` first.

## How to see the design system

Run the app and open **Settings → Design system**. You'll see every component in light + dark variants, with sample data.

## What's next (Phase 2+)

- `<IncidentCard>` for the Incidents tab
- `<NotificationSettings>` form components
- A more complete `<Monitor type="..." />` for monitor type-specific displays
- A `<LiquidGlassHero>` for special promo cards
