# Play Store metadata — Uptime Pocket

> **For Leopold:** This is the full draft for the Google Play Console
> listing. Same shape as `app-store/en-US.md`; the field names and limits
> differ slightly. Edit the `[TODO: Leopold]` blocks and submit.

---

## App details

- **App name:** `Uptime Pocket` *(50 chars max)*
- **Short description:** *(80 chars max)*
  `Uptime Kuma in your pocket. Live monitors, push alerts, widgets.`
- **Full description:** *(4000 chars max)*
  ```
  Uptime Pocket is a Uptime Kuma client for Android (and iOS). It connects
  to your own Uptime Kuma instance — the open-source monitoring tool — and
  gives you a fast, native view of every monitor you care about, even
  when you're not at your desk.

  Why Uptime Pocket
  • No account with us. Sign in to your own Kuma instance, not ours.
  • No data passes through our servers. The app talks to Kuma directly.
  • No analytics, no tracking, no ads. Source is MIT-licensed and you can
    audit it on GitHub.

  Live monitoring
  • Real-time monitor list with status pills, response time, and uptime
    percentage.
  • Filter by status (all / up / down) and search by name.
  • Background fetch revalidates your Kuma connection every ~15 minutes.

  Notifications that actually arrive
  • "Direct" mode uses Firebase Cloud Messaging (FCM) for instant alerts
    when a monitor goes down.
  • "Relay" mode talks to a small self-hosted Go service you run on your
    own infrastructure — perfect for when the app is killed by the OS or
    you're on a restricted network.
  • Quiet hours per server, with a custom start/end time.

  Security
  • Server credentials (bearer tokens, passwords) live in the Android
    Keystore, never in plain SQLite.
  • Optional biometric lock on the app (fingerprint, face, device PIN
    fallback).
  • TLS by default, with a per-server override for self-signed certs.

  Home-screen widget
  • Jetpack Glance widget that shows your most-watched monitors at a
    glance.
  • Reads a snapshot from the app's storage — no live network calls from
    the widget, so it works in low-power mode.

  Multi-server
  • Add as many Kuma instances as you want. Switch between them with a
    tap.

  Localized
  • English, German, French, Japanese, Spanish.

  Open source
  • github.com/Quavon-dev/uptime-pocket
  • License: MIT
  ```

## Graphics assets

- **App icon:** `assets/images/icon.png` (already in repo)
- **Feature graphic:** 1024×500 px *(required by Play, `[TODO: Leopold]`
  to create — see `assets/store/feature-graphic.svg` placeholder)*
- **Phone screenshots:** 16:9 or 9:16, min 320px, max 3840px on the long
  edge. Need 4–8. *(See `assets/store/screenshots/` — `[TODO: Leopold]`
  to capture from a real device or the Android emulator)*
- **Tablet screenshots:** optional but recommended for the "Designed for
  tablets" badge.

## Categorization

- **Category:** Tools (or Developer Tools)
- **Tags:** monitoring, devops, server, alerts, sre, status
- **Content rating:** PEGI 3 / ESRB E (no objectionable content)
- **Target audience:** 13+

## Contact details

- **Email:** `quavon.de@gmail.com` *(or whatever address we want to
  publish — `[TODO: Leopold]`)*
- **Phone:** *not required for a tool app*
- **Website:** `https://quavon.de/uptime-pocket` *(optional)*

## Privacy

- **Privacy policy URL:** `https://quavon.de/privacy/uptime-pocket`
  - Same constraint as App Store: must be live before submission. The
    in-app text is at `docs/privacy.md`.

## Data safety

Play Console's data safety form. Declare what we do, even though it's
almost nothing:

- **Data shared with third parties:** No
- **Data collected:** No
- **Data is encrypted in transit:** Yes (HTTPS to your Kuma instance)
- **Data is encrypted at rest:** Yes (Android Keystore for credentials,
  encrypted SQLite for the rest)
- **Users can request data deletion:** N/A (we don't collect data)
- **Independent security review:** No
- **Data safety declaration URL:** `https://quavon.de/privacy/uptime-pocket#data-safety`

## Pricing

- **Free.** No in-app purchases. No subscriptions.

## Release notes (v0.7.0)

```
Uptime Pocket v0.7.0 — Privacy & polish

- In-app privacy policy and a one-time consent prompt on first launch.
- Per-server notification mode (None / Direct / Relay) is now surfaced
  in the server detail screen.
- Several accessibility improvements across the monitor list, server
  form, and settings.
- Smaller: the APK is about 12% smaller than v0.6.0.

Thanks to everyone who reported bugs and requested features on GitHub.
```

## Testing

- **Internal testing track:** distribute to a small list of trusted
  testers first. *([TODO: Leopold] — create the testing track in Play
  Console and upload the first AAB)*
- **Closed testing track:** optional, if you want a wider group.
- **Production:** the public release.
