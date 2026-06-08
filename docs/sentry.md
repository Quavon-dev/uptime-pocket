# Sentry (crash reporting)

Uptime Pocket integrates with [Sentry](https://sentry.io) for
anonymous crash reporting. Both the **mobile app** and the
**push relay** support Sentry. This document covers:

1. The two-gate opt-in model
2. What data we send (and what we don't)
3. How to enable it
4. Self-hosted Sentry

## The two-gate model

Crash reporting is **off by default** and is gated on TWO
conditions. Both must be true for any data to leave the device
or the relay:

| Gate | Where | Default | How to enable |
|---|---|---|---|
| **Build-time DSN** | `EXPO_PUBLIC_SENTRY_DSN` (app) / `SENTRY_DSN` (relay) | empty | set to your Sentry DSN |
| **Runtime opt-in** | Settings → Crash reports (app) / operator's choice (relay) | OFF (app) / OFF (relay) | toggle on |

If either gate is closed, the Sentry SDK is **not loaded at
all** — no network calls are made to sentry.io, no crash events
are buffered for later, no overhead.

### Why two gates?

The build-time DSN is needed because Sentry's SDK needs to know
*where* to send events at construction time. The runtime opt-in
exists because the user must explicitly consent to the SDK
loading — this is the GDPR / privacy stance we want to take.

On the relay, the DSN is a configuration value (you, the
operator, are opting in by running it). The relay has no UI
toggle.

## What we send

For **error events** we send:

- Exception class and truncated message
- Stack trace frames (filename + line number only — no
  user-data paths)
- App version, environment, release tag, platform, OS version
- Device locale
- Synthetic tags: relay component (relay only), app state

We **never** send, and we have a PII scrubber that explicitly
redacts:

- ❌ Server URLs (the `https://kuma.example.com` part of any
  string in the event is replaced with `[Redacted]`; scheme
  and path are kept for grouping)
- ❌ Query parameter VALUES (key names preserved, values
  replaced with `Redacted`)
- ❌ Authorization headers (`Bearer *** `, `Basic *** `, `Token
  *** `, `ApiKey ***` — all replaced with the value redacted)
- ❌ User-context fields: email, IP address, username (all
  cleared before send; only an anonymous hashed id is kept)
- ❌ Anything under these JSON keys: `host`, `hostname`,
  `server`, `token`, `password`, `secret`, `apiKey`, `auth`,
  `authorization`, `cookie`, `monitorName`, `serverName`,
  `email`, `userId`, `username`
- ❌ `server_name` field on the event (always a hostname)
- ❌ Request bodies (the relay explicitly does not capture
  these)
- ❌ Free-form breadcrumb messages containing URLs (URLs
  redacted via the same scheme as events)
- ❌ File paths with a scheme (`file://`, `content://`,
  `app://`) — these can leak user filesystem paths

The PII scrubber runs in `beforeSend` (and `beforeBreadcrumb` on
the app side). It is **total**: it never throws, it always
returns a sanitized event or, in the worst case, drops
unrecognized data while preserving the parts we recognize.

## What we sample

By default, the **app** captures 100% of errors in dev
(`__DEV__`) and 10% in release. **Transactions** (traces) are
sampled at 10% in dev and 0% in release. The relay captures at
the rate you set with `SENTRY_SAMPLE_RATE` (default 0.1).

The sampling is intentional — for a self-hosted app with
~hundreds of users, 10% of crashes is plenty of signal without
overwhelming the Sentry project.

## Setup — mobile app

### 1. Create a Sentry project

Go to [sentry.io](https://sentry.io) (or your self-hosted
Sentry URL) and create a new project:

- **Platform:** React Native
- **Project name:** e.g. `uptime-pocket-prod`

Copy the DSN (looks like
`https://abc123def456@o123456.ingest.sentry.io/7890123`).

### 2. Set the DSN at build time

In your `.env` (or in the EAS build profile):

```sh
EXPO_PUBLIC_SENTRY_DSN=https://abc123def456@o123456.ingest.sentry.io/7890123
EXPO_PUBLIC_SENTRY_ENVIRONMENT=production
# Optional: pin to a specific release so issues are grouped by app version
EXPO_PUBLIC_SENTRY_RELEASE=de.quavon.uptimepocket@0.3.0
```

For EAS, the convention is to put these in `eas.json` per
build profile:

```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_SENTRY_DSN": "https://...",
        "EXPO_PUBLIC_SENTRY_ENVIRONMENT": "production"
      }
    },
    "preview": {
      "env": {
        "EXPO_PUBLIC_SENTRY_DSN": "https://...",
        "EXPO_PUBLIC_SENTRY_ENVIRONMENT": "preview"
      }
    }
  }
}
```

### 3. Opt in, in the app

After the user installs the configured build and opens the app
once, the Settings → Crash reports toggle becomes functional.
The user must explicitly toggle it on. The default is OFF.

> **Note:** If a build is installed with no DSN configured, the
> toggle still appears in settings (so the user can record
> their preference), but the section will display a "Not
> configured" notice and flipping the toggle will not cause any
> network traffic. The user will see this notice the first time
> they visit the section.

## Setup — relay

The relay uses Sentry via the [sentry-go](https://github.com/getsentry/sentry-go)
SDK. Pinning to v0.34.0 because the relay's Go toolchain is
1.22 and sentry-go's recent versions require 1.25+.

### 1. Create a Sentry project

Same as the app, but choose **Platform: Go** (or **Generic**)
when creating the project. The DSN is per-project, so you can
have separate projects for the app and the relay.

### 2. Set the env vars on the relay

For Docker, add to your `docker run` command or compose file:

```sh
SENTRY_DSN=https://abc123def456@o123456.ingest.sentry.io/7890123
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=relay@v0.3.0
SENTRY_SAMPLE_RATE=0.1
```

`SENTRY_SAMPLE_RATE` is between 0.0 and 1.0. The default is
0.1 (capture 10% of events). For a self-hosted relay with low
traffic, 0.1 is plenty; for a hosted production relay with
hundreds of monitors, 0.01–0.05 is fine.

### 3. What you see

When Sentry is enabled, the relay reports:

- **Panics** in any HTTP handler (caught by the panic
  middleware around the chi router)
- **Caught errors** at startup: storage open, APNs/FCM sender
  construction, reconcile loop
- **A warning message** if the relay starts with no push
  transports configured (it's a one-time warning, not an error)
- **Tags** on every event: `component` (e.g. `storage`, `apns`,
  `fcm`, `reconcile`, `http`)

The relay's `beforeSend` runs the same scrubber as the app, so
no Kuma URLs, bearer tokens, or monitor names reach Sentry.

## Self-hosted Sentry

Both the app and the relay work against a self-hosted Sentry
instance. The DSN format is the same; just point the SDK at
your self-hosted URL.

For a self-hosted Sentry server behind a reverse proxy:

- `SENTRY_DSN=https://key@sentry.your-domain.com/1` (note: no
  `ingest.` subdomain)
- The relay's `beforeSend` doesn't depend on the Sentry URL —
  redaction is the same

## Why Sentry at all?

We could roll our own crash reporting. The reasons we don't:

- **Breadcrumbs** — Sentry's "what happened before the crash"
  context is high-quality and standardized. Hard to replicate.
- **Source-map support** — RN minified stack traces are
  unreadable without source maps. Sentry has first-class RN
  source-map upload (`sentry-expo` or the `sentry-cli` upload
  step in EAS post-build).
- **Alerting** — email/Slack/webhook alerts are out of the box.
- **Self-hostable** — if you don't trust sentry.io, you can
  run your own. We have no opinion either way.

## See also

- `src/platform/sentry/` — the app-side module + scrubber
- `relay/internal/sentry/` — the relay-side module + scrubber
- `tests/i18n/` — parity test ensures every locale ships the
  Settings UI strings
- `relay/.env.example` and `.env.example` — env-var templates
