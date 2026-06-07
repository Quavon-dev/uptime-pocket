# Notifications

Uptime Pocket supports three notification modes, configurable per server.

## Modes

### Off

The app is a pure viewer. No notifications are sent, no background work happens.

**Use when:** you only want to check your monitors when you open the app.

### Direct

The app maintains a socket.io connection to your Kuma server. When a monitor changes state, the app receives the event and posts a local notification.

**Pros:**
- Zero setup
- Works out of the box
- No extra services to run

**Cons:**
- Only works when the app is in the foreground or recently backgrounded
- iOS may suspend the connection after a few minutes
- Android may kill the background process
- **iOS widgets are limited to iOS's budget** (~40 refreshes/day) when in this mode
- The app badge doesn't tick

**Use when:** you open the app regularly and don't need push notifications.

### Relay

The app uses APNs (iOS) / FCM (Android) push notifications via a self-hosted relay service that you run alongside your Kuma instance.

**Pros:**
- Notifications fire even when the app is closed or force-killed
- iOS widgets are always fresh (the relay sends silent pushes)
- The app badge ticks
- Most reliable mode

**Cons:**
- Requires you to run the [relay service](./relay.md) (a small Go binary)
- You need an APNs auth key (.p8) from Apple
- You need a Firebase project + service account for FCM

**Use when:** you want the best mobile monitoring experience, full stop.

## How to switch modes

1. Go to **Servers** tab
2. Tap the server you want to configure
3. Scroll to **Notifications**
4. Pick a mode
5. If you pick **Relay**, enter the relay URL and token

You can have different modes for different servers. E.g. one server on **Relay** (the important one), another on **Direct** (for testing).

## Per-monitor controls

In v1.0+, you'll be able to turn notifications off for specific noisy monitors. Stay tuned.

## Quiet hours

Set a do-not-disturb window in **Settings → Notifications → Quiet hours**. During this window, you'll still get critical notifications (multiple monitors down at once) but individual monitor events are silenced.

## Why not just use FCM/APNs directly from the app?

We could, but:

- Apple requires push notifications to come from a server with a valid APNs auth key
- Firebase requires a server-side service account
- Both of these are best held by a server you control, not baked into the app

The relay is that server, but it lives next to your Kuma instance and is open source. You can read every line.
