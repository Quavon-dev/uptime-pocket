# Contributing to Uptime Pocket

Thanks for your interest in contributing! 🎉

Uptime Pocket is a community project. We welcome bug reports, feature requests, documentation improvements, and code contributions.

## Code of conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Reporting issues

- **Bugs**: open a [GitHub issue](https://github.com/Quavon-dev/uptime-pocket/issues/new?template=bug_report.md) with reproduction steps
- **Feature requests**: open a [feature request](https://github.com/Quavon-dev/uptime-pocket/issues/new?template=feature_request.md) — describe the use case, not just the solution
- **Security issues**: see [SECURITY.md](SECURITY.md), do **not** open a public issue

## Development setup

### Prerequisites
- Node.js 20 or newer
- macOS with Xcode 17+ (for iOS development)
- Android Studio with API 26+ SDK (for Android development)
- Expo CLI: `npm install -g expo`

### First-time setup
```bash
git clone https://github.com/Quavon-dev/uptime-pocket.git
cd uptime-pocket
npm install
```

### Run the app
```bash
# iOS (macOS only)
npm run ios

# Android
npm run android

# Web (limited - widgets don't work in browser)
npm run web
```

## Pull requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Run the local checks (see below)
5. Push your branch and open a PR against `main`
6. Fill in the PR template

### Local checks (run before pushing)
```bash
npm run lint          # ESLint
npm run typecheck     # TypeScript
npm test              # Unit tests
```

We also use [Maestro](https://maestro.mobile.dev/) for E2E tests. Install it with `curl -fsSL https://get.maestro.mobile.dev | bash` and run `npm run test:e2e`.

### Code style

- TypeScript strict mode — no `any` unless absolutely necessary
- Use the design tokens in `src/theme/` for colors, spacing, typography
- Reuse components from `src/components/` before creating new ones
- Prefer functional components, hooks, and pure functions
- Comment non-obvious code; the *why* is more important than the *what*
- Use the `t()` / `tn()` helpers from `@/i18n` for user-facing strings — English only in v1.0

### Project conventions

- File names: `PascalCase.tsx` for components, `camelCase.ts` for utilities
- Component file structure: types at top, then the component, then sub-components
- One component per file (except small display components)
- Test files live next to source as `*.test.ts` / `*.test.tsx`
- E2E flows live in `.maestro/`

## Architecture

Uptime Pocket is structured as:

- **`app/`** — Expo Router screens (file-based routing)
- **`src/components/`** — reusable UI components
- **`src/theme/`** — design tokens (colors, type, spacing, motion)
- **`src/domain/`** — pure business logic and types
- **`src/data/`** — API client, socket.io, stores (Zustand)
- **`src/features/`** — feature-specific hooks and logic
- **`src/platform/`** — native bridges (iOS Widget, Android App Widget)
- **`relay/`** — the optional self-hosted push relay (Go)

When adding a new feature, think about which layer it belongs in:
- **Domain** if it's pure logic (no React, no API)
- **Data** if it talks to the network or storage
- **Features** if it composes domain + data with React hooks
- **Components** if it's reusable UI
- **App** if it's a screen

## Commit messages

We don't enforce a strict format, but please:
- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Reference issue numbers when relevant (`#123`)
- Keep the first line under 72 characters

Examples:
- `Add biometric lock to settings`
- `Fix race condition in socket reconnect (#42)`
- `Refactor status pill to use design tokens`

## Release process

Uptime Pocket uses [Semantic Versioning](https://semver.org/).

- Major (`1.0.0`): breaking changes
- Minor (`0.2.0`): new features, backwards compatible
- Patch (`0.1.1`): bug fixes

The maintainer (Quavon-dev) cuts releases. We don't have an automated release pipeline yet.

## Questions?

Open a [discussion](https://github.com/Quavon-dev/uptime-pocket/discussions) or reach out via issues.

Thanks for contributing! 💚
