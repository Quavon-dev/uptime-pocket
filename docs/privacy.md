# Uptime Pocket — Privacy Policy

**Effective date:** 2026-06-09
**Last updated:** 2026-06-09

Uptime Pocket ("the App") is developed by Quavon ("we", "us"). This privacy
policy explains what data the App handles, why, and what we do — and don't do —
with it. It applies to the iOS, iPadOS, Android, and any other build of the
App published under the "Uptime Pocket" name.

We try to keep this short. The short version: **the App is a client for a
server you control. We don't run a backend, we don't collect analytics, and
we don't sell anything.**

---

## 1. Short version

- The App talks **directly to Uptime Kuma instances you configure**. We do
  not see, proxy, log, or store any of that traffic.
- Server credentials (bearer tokens, usernames, passwords) are stored **only
  on your device**, in the platform's secure storage (iOS Keychain on Apple
  devices, Android Keystore on Android devices). They are never sent to us.
- If you opt in to push notifications, a registration token is stored by
  Apple Push Notification service (APNs) or Firebase Cloud Messaging (FCM)
  on Apple's / Google's infrastructure. We do not see or store this token.
- If you opt in to crash reports, error metadata is sent to our Sentry
  instance (self-hosted or sentry.io, depending on the build you installed).
  Crash reports are **off by default** and require an explicit toggle in
  Settings.
- We do not use third-party analytics, advertising SDKs, tracking pixels,
  or fingerprinting.
- The App does not require an account with us. There is no "sign up" and no
  user profile on our side.

---

## 2. Data stored on your device

All persistent data lives in the App's local storage and is removed if you
uninstall the App.

| Data | Where | Why |
| --- | --- | --- |
| Server list (name, URL, kind, notification mode) | Local SQLite | To render the Servers tab and reconnect automatically. |
| Server credentials (bearer tokens, passwords) | iOS Keychain / Android Keystore (expo-secure-store) | So the App can authenticate to your Kuma instance without you re-entering the password every time. |
| App settings (theme, accent color, quiet hours, language, biometric lock, push notification mode) | Local SQLite | To remember your preferences. |
| Recent monitor list (last 100 heartbeats per monitor) | Local SQLite | So the home tab still shows data when you are offline. |
| Push token (APNs or FCM) | Local SQLite + the platform's push service | So the platform can deliver notifications to your device. |

We do not sync any of this across devices. If you install the App on a
second device, you start fresh and have to add your servers again.

---

## 3. Data sent off your device

The App only sends data to three categories of destinations, and you control
each one:

### 3.1 Uptime Kuma servers you configure

When you add a server in the App, we send HTTPS (or HTTP, if you opt out of
TLS verification) requests to that server's URL using the credentials you
provided. The requests go **directly from your device to that server** — not
through us. We do not see, log, intercept, or back up these requests.

You can see exactly which server the App is talking to in the Servers tab.

### 3.2 Push notification providers (only if you enable them)

If you opt in to push notifications, the App registers a push token with
the platform's push service:

- **Apple devices (iOS, iPadOS):** Apple Push Notification service (APNs)
- **Android:** Firebase Cloud Messaging (FCM)

The token is generated and stored by Apple / Google. It is also written to
your local SQLite so the App can hand it to the Kuma instance or to the
relay server you configured (see "Self-hosted relay" below). The App does
**not** send the token to any other destination.

If you use the **Direct** notification mode, your Kuma instance receives the
token and pushes to you via APNs / FCM directly. If you use the **Relay**
mode, the token is sent to the relay server URL you configured (hosted by
you, on infrastructure you control) and the relay handles delivery.

### 3.3 Crash reports (only if you explicitly opt in)

If you enable "Crash reports" in Settings, the App initializes Sentry and
sends uncaught JavaScript errors and stack traces to our Sentry endpoint.

- The default Sentry endpoint is configured at build time. Builds from our
  CI use our self-hosted Sentry; community builds can override it.
- Crash reports are scrubbed at the client (the App strips passwords, bearer
  tokens, server URLs, and other obvious secrets before sending).
- You can turn this off at any time in Settings. When you turn it off, no
  further crash reports are sent.

We do not collect any other telemetry, performance metrics, or usage data.

---

## 4. Self-hosted relay (optional)

The App supports an optional self-hosted push relay: a small Go program you
run on your own server. If you choose to use one:

- You deploy it (or use a community image). We do not run one for you.
- It receives the push token from your device and forwards notifications
  from your Kuma instance to APNs / FCM.
- All data stays on infrastructure you operate. We do not see the relay's
  traffic.

See `relay/README.md` and the relay's own privacy posture in its README.

---

## 5. Children

The App is not directed at children under the age of consent in your
jurisdiction (13 in the US, 16 in the EU/UK by default). We do not knowingly
collect data from children. If you believe a child has used the App, please
have an adult remove the App from the device — uninstalling removes all
local data.

---

## 6. Your rights

Because we do not run a backend and do not store your data on our
infrastructure, there is nothing to export, correct, or delete on our side.
You can:

- **See everything the App stores:** in the Settings tab, the App shows
  which servers are configured and which notification modes are enabled.
- **Delete everything:** open each server in the Servers tab and tap
  "Delete", or uninstall the App. Both remove all local data and
  credentials.
- **Revoke push tokens:** toggle off notifications in Settings, or
  uninstall the App.
- **Opt out of crash reports:** toggle off "Crash reports" in Settings.

If you contact us about data we may have received (for example, an email
you sent us), we will delete that correspondence on request.

---

## 7. International transfers

Because we do not run a backend, no App data is transferred internationally
by us. Data you send to your Kuma instance, to APNs / FCM, or to a
self-hosted relay is governed by the privacy policy of the operator of
that destination.

If you use a build of the App configured to send crash reports to
sentry.io (the hosted service), those reports are stored in the region
configured for the Sentry project. See [sentry.io's privacy
policy](https://sentry.io/privacy/) for details.

---

## 8. Security

We take reasonable steps to protect the data on your device:

- Credentials are stored in the platform's secure storage (Keychain /
  Keystore), not in plain SQLite.
- The App uses HTTPS by default. You can opt out of TLS verification per
  server, but that is your choice (useful for self-signed certs on a local
  Kuma instance).
- The biometric lock (when enabled) requires Face ID / Touch ID /
  fingerprint / device PIN to open the App.
- We publish the App through the official Apple App Store and Google Play
  Store, so the binary you install is the binary we built (no
  man-in-the-middle on the install path).

If you discover a security issue, please report it privately to
`security@quavon.de` (or whatever address we list on our website at the
time). We aim to acknowledge within 5 business days.

---

## 9. Changes to this policy

We may update this policy as the App evolves. The "Last updated" date at
the top will change. Material changes (anything that broadens what data we
collect or who we share it with) will be surfaced in the App — typically
the next time you open it after the change is published, with a brief
notice and a link to the new text.

We will not silently expand data collection.

---

## 10. Contact

Quavon
`privacy@quavon.de` (or the address on our website)

If you are in the EU / UK, you can also reach our data protection contact at
the same address. We are not required to appoint a formal DPO under GDPR
Article 37 because the App's data processing is neither large-scale nor
involves special categories of data.

---

## License and source

The App is open source under the MIT license. The full source is at
<https://github.com/Quavon-dev/uptime-pocket>. You can read exactly what the
App does, audit the code, and build it yourself if you don't trust the
binaries we publish.
