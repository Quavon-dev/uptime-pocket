# Authentication

Uptime Pocket authenticates to your Uptime Kuma server with your Kuma
**username + password**. We use those once to log in over the socket,
get a JWT session token from Kuma, and then use the JWT for all
subsequent requests — including reconnects. You don't have to re-enter
the password until the JWT expires (or until you remove the server).

## Why not an API token?

Kuma 2.x has an "API Keys" feature (Settings → API Keys) that creates
tokens like `uk1_<random>`. Those tokens authenticate Kuma's HTTP API
and work fine for the REST side of things. They do **not** work for the
real-time socket — Kuma's socket.io `loginByToken` event only accepts
JWTs (it checks the signature with the server's `jwtSecret` and
verifies the `username` and `h` claims against the user table). An API
key sent to `loginByToken` comes back as `authInvalidToken` and the
connection hangs.

Uptime Pocket is real-time-first (live monitor list, push notifications
on status changes), so it talks the socket. Hence: username +
password, JWT cached after the first login.

## Creating an account in Kuma (if you don't have one)

1. Log in to your Kuma web UI as admin
2. Go to **Settings → Users**
3. Create a dedicated account for the app (e.g. "uptime-pocket") with
   a strong random password
4. Optional but recommended: scope it to "viewer" or whatever role has
   monitor-read access, not admin

Then in Uptime Pocket:

1. **Add server** → enter the Kuma URL, the username, and the password
2. Tap **Test connection** — the app logs in once, gets a JWT, and
   caches it in the platform secure store
3. The JWT is used for all future reconnects until it expires (default
   one day in Kuma, after which we re-login transparently)

## How credentials are stored

- **iOS** — in the iOS Keychain via `expo-secure-store`
- **Android** — in the Android Keystore via `expo-secure-store`
- Never in plain text, never in logs, never sent to anyone but your
  Kuma server. Your Kuma password is used to derive the JWT and is
  then kept in the secure store so we can re-login when the JWT
  expires — we never send it again on the wire.

## What about self-signed certificates?

Uptime Pocket respects your device's trust store. If you use a self-signed cert:

- **iOS:** Install the CA cert on your device (Settings → General → VPN & Device Management → Trust the profile)
- **Android:** Install the CA cert (Settings → Security → Encryption & credentials → Install a certificate)

If your Kuma is on your home network with a self-signed cert, you'll need to trust it on every device that uses Uptime Pocket.

## Multiple servers

Each Kuma server you add has its own username + password (and its own
cached JWT). They're stored independently. You can have different
accounts on different Kuma instances.
