# AGENTS.md

This file provides guidance to AI coding agents working on Uptime Pocket.

## Project

- **Name:** Uptime Pocket
- **Repo:** github.com/Quavon-dev/uptime-pocket
- **Type:** Expo SDK 56 mobile app + optional Go relay
- **Min Kuma version:** 2.0.0 (target 2.4.0)
- **License:** MIT

## Stack

- Expo SDK 56 (New Architecture enabled)
- Expo Router 56 (file-based routing)
- NativeWind v5 (Tailwind for RN)
- Reanimated 4 (UI-thread animations)
- expo-glass-effect (iOS 26 Liquid Glass)
- expo-notifications (push + local)
- socket.io-client (Kuma live updates)
- Zustand (state)
- Zod (validation)

## Conventions

- **TypeScript strict mode** — no `any` unless absolutely necessary
- **Path alias:** `@/*` maps to `src/*`
- **File naming:** `PascalCase.tsx` for components, `camelCase.ts` for utilities
- **One component per file** (except small display sub-components)
- **Use design tokens** from `src/theme/` — never raw color/spacing values
- **Use i18n helpers** `t()` / `tn()` from `@/i18n` for user-facing strings
- **Domain layer is pure** — no React, no I/O, no fetch
- **Data layer handles I/O** — talks to network, storage, sockets
- **Features layer composes** — React hooks that combine domain + data

## Layer responsibilities

- `app/` — Expo Router screens (file-based)
- `src/components/` — reusable UI
- `src/theme/` — design tokens
- `src/domain/` — pure business logic
- `src/data/` — API + socket + stores
- `src/features/` — React hooks
- `src/platform/` — native bridges
- `relay/` — Go push relay (Phase 6)

## Quality gates (manual, no CI yet)

- `npm run lint` clean
- `npm run typecheck` clean
- `npm test` passing
- Manual smoke test on iOS sim + Android emulator
- Manual test on real device before merging

## Phase status

- **Phase 0 (in progress):** Foundation, scaffold, design tokens, app shell
- **Phase 1:** Design system, all primitive components
- **Phase 2:** Auth + servers
- **Phase 3:** Monitor list + detail
- **Phase 4:** Local notifications (Direct mode)
- **Phase 5:** Home screen widgets
- **Phase 6:** Push relay
- **Phase 7:** Polish + TestFlight/Play Internal

## Resources

- [Expo SDK 56 docs](https://docs.expo.dev/versions/v56.0.0/)
- [NativeWind v5 docs](https://www.nativewind.dev/)
- [Reanimated 4 docs](https://docs.swmansion.com/react-native-reanimated/)
- [Uptime Kuma repo](https://github.com/louislam/uptime-kuma)
- Project docs in `docs/`
