# Design System

> ⚠️ **Phase 0 — initial tokens.** Final design system after the logo is locked in.

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

## Components

Use these instead of building from scratch.

### `<StatusPill status="up" />`

Colored dot + label. Use everywhere a status is shown.

### `<HeartbeatPulse color="..." active />`

A pulsing dot that animates. Use to indicate "live" data.

### `<GlassSurface variant="regular" />`

A cross-platform glass surface. Liquid Glass on iOS 26+, BlurView on older iOS, elevated surface on Android.

### `<GlassNavBar title="Monitors" />`

Top app bar with Liquid Glass. Supports back/menu buttons and a large title variant.

## Conventions

- **Use tokens, not raw values.** If you find yourself writing `padding: 13`, add a token instead.
- **Status color is semantic.** Never use `colors.status.down` for a brand element.
- **Animations should be subtle.** If the user notices the animation, you've gone too far.
- **Hit areas are 44pt minimum.** Tap targets should be finger-sized.
- **Respect the platform.** iOS gestures on iOS, Material gestures on Android.

## What's next

- Chart components (`<ResponseTimeChart>`, `<UptimeBar>`)
- `<MonitorCard>`, `<MonitorRow>`
- `<ServerCard>`, `<ServerSwitcher>`
- A Storybook page in the app showing every component

These land in **Phase 1** of the build.
