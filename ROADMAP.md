# Uptime Pocket — v1.0 Roadmap

> Generated 2026-06-07. Source of truth for what's left until app is "fully complete."

## Scope agreed with user
"Everything except Images and CI/Pipelines." That means:
- All features, screens, integrations
- Local + push + relay notifications
- Both platform widgets
- Real-device testing pass
- Release builds
- All locale work, accessibility, error reporting, store assets

Items the agent **cannot** finish alone in a sandbox:
| Item | Why it needs the user |
|---|---|
| 10. iOS WidgetKit | Needs paid Apple Developer account + signing + physical device to test widget extension. Code can be written; deployment can't. |
| 11. Android widget | Jetpack Glance widget. **Code: complete.** Snapshot pipeline (TS → JSON file → Kotlin reader → Compose UI), 5 status drawables, widget metadata, Expo config plugin that wires Glance/Compose deps + manifest receiver + copies Kotlin sources. Deployment to Play Internal needs a release keystore. |
| 12. Go push relay backend | Deploys to user's own infra (any Docker host). Image is auto-built and published to GitHub Container Registry on every `relay-v*` tag. **Code: complete. CI: complete. Deploy: `docker pull ghcr.io/quavon-dev/uptime-pocket:relay-latest` and `docker run` with env vars.** |
| 15. Sentry / error reporting | Needs the user's Sentry DSN (or self-hosted instance URL). |
| 19. Privacy policy | Must be the user's actual legal text (or a public-domain template they approve). |
| 20. App Store / Play Store metadata | Final store submissions must come from the user. |
| 21. Real-device testing | Needs physical iPhone + Android in front of the user. |
| 22. Release build artifacts | Needs EAS Build credentials + Apple signing cert + Google Play upload key. |

The agent's job: write production-quality code, tests, and docs for all 22 items, and tell the user exactly what to do for the parts only they can do.

## Phasing (proposed)
- **Phase A (week 1):** persistence + biometric + server edit + quiet-hours/accent UI
- **Phase B (week 2):** local notifications + background fetch + onboarding
- **Phase C (week 3):** widgets (iOS + Android) + relay
- **Phase D (week 4):** i18n, a11y, error reporting, e2e, store assets
- **Phase E (week 5):** real-device test + release build

## Definition of Done per item
Each item gets: code + unit tests + e2e Maestro flow + docs entry in `docs/` + commit on a `feat/*` branch.

## Tracking
See the live todo list in the active Hermes session.
