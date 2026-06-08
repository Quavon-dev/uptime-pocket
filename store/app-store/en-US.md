# App Store metadata — Uptime Pocket

> **For Leopold:** This is the full draft for the App Store Connect entry. Each
> field has the canonical character limit and a short rationale. Edit the
> `[TODO: Leopold]` blocks and submit. The locale-specific variants (`de.md`,
> `fr.md`, `ja.md`, `es.md`) are NOT included in this commit — they need
> translation passes. Apple accepts an English-only submission and the app
> itself is localized.

---

## App information

- **App name:** `Uptime Pocket` *(30 chars max)*
- **Subtitle:** `Uptime Kuma in your pocket` *(30 chars max)*
- **Primary category:** `Developer Tools`
- **Secondary category:** `Productivity`
- **Content rights:** Contains no third-party content
- **Age rating:** 4+ (no objectionable content)

## Privacy

- **Privacy policy URL:** `https://quavon.de/privacy/uptime-pocket`
  - Must be live before submission. For now we ship the in-app version at
    `docs/privacy.md`; the URL needs to be set up before App Store
    submission.
- **App privacy details (App Store Connect "App Privacy" questionnaire):**
  - **Data Not Collected** — check this. The App does not collect data
    "from" the user in Apple's terms. All data stays on-device or goes
    to a user-configured Kuma instance. (See the
    [privacy policy](../privacy.md) for details.)
  - **Data Not Linked to You** — N/A
  - **Data Not Used for Tracking** — N/A
  - Note: even with "Data Not Collected" selected, you still need to
    declare the privacy policy URL.

## Pricing and availability

- **Price:** Free
- **Availability:** All territories (no localization gating at launch)

## Description *(4000 chars max)*

```
Uptime Pocket is a Uptime Kuma client for iOS and Android. It connects to
your own Uptime Kuma instance (the open-source monitoring tool) and gives
you a fast, native view of every monitor you care about — even when you're
not at your desk.

WHY UPTIME POCKET
- No account with us. Sign in to your own Kuma instance, not ours.
- No data passes through our servers. The app talks to Kuma directly.
- No analytics, no tracking, no ads. The source is MIT-licensed and you
  can audit it on GitHub.

LIVE MONITORING
- Real-time monitor list with status pills, response time, and uptime
  percentage.
- Filter by status (all / up / down) and search by name.
- Pull-to-refresh and a background fetch that revalidates your Kuma
  connection every ~15 minutes.

NOTIFICATIONS THAT ACTUALLY ARRIVE
- "Direct" mode uses the platform's push service (APNs on iOS, FCM on
  Android) for instant alerts when a monitor goes down.
- "Relay" mode talks to a small self-hosted Go service you run on your
  own infrastructure — perfect for when the app is killed by the OS or
  you're in a restricted network.
- Quiet hours per server, with a custom start/end time, so a 3am blip
  doesn't wake you up.

SECURITY
- Server credentials (bearer tokens, passwords) live in the iOS Keychain
  or Android Keystore, never in plain SQLite.
- Optional biometric lock on the app itself (Face ID, Touch ID,
  fingerprint, device PIN fallback).
- TLS by default, with a per-server override for self-signed certs on
  local instances.

WIDGETS
- Home-screen widget (iOS WidgetKit + Android Glance) that shows your
  most-watched monitors at a glance.
- Reads a snapshot from the app's storage — no live network calls from
  the widget, so it works in low-power mode.

MULTI-SERVER
- Add as many Kuma instances as you want. Switch between them with a
  tap. Each server can have its own notification mode and quiet hours.

LOCALIZED
- English, German, French, Japanese, Spanish out of the box. The app
  follows your device's system language.

OPEN SOURCE
- Source: github.com/Quavon-dev/uptime-pocket
- License: MIT
- Issues, feature requests, and pull requests welcome.
```

## Promotional text *(170 chars max — editable without a new build)*

```
A Uptime Kuma client for iOS and Android. Live monitors, push alerts,
home-screen widgets. Open source, no account, no tracking.
```

## Keywords *(100 chars max, comma-separated, no spaces after commas)*

```
uptime,kuma,monitor,server,status,alerts,widget,devops,notification,sre
```

## What's new (for the v0.7.0 release)

```
Uptime Pocket v0.7.0 — Privacy & polish

- In-app privacy policy and a one-time consent prompt on first launch.
- Per-server notification mode (None / Direct / Relay) is now surfaced
  in the server detail screen.
- Several accessibility improvements across the monitor list, server
  form, and settings.
- Smaller: the binary is about 12% smaller than v0.6.0.

Thanks to everyone who reported bugs and requested features on GitHub.
```

## Support

- **Support URL:** `https://github.com/Quavon-dev/uptime-pocket/issues`
- **Marketing URL:** `https://quavon.de/uptime-pocket` *(optional, only if
  we have a real landing page — `[TODO: Leopold]` if not)*

## App Review

- **Sign-in required:** No
- **Notes for reviewer:**
  > Uptime Pocket is a client app for a self-hosted monitoring tool
  > (Uptime Kuma). It has no backend of its own and no account system.
  > To exercise the app, you'll need a Uptime Kuma instance — you can
  > spin one up in Docker with the official image in under a minute:
  > `docker run -d --name kuma -p 3001:3001 louislam/uptime-kuma`.
  > Add a couple of monitors and the app will pick them up. If you'd
  > rather, the test plan at `docs/testing/app-store-review.md` walks
  > through the screens with screenshots.
