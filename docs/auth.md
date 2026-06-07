# Authentication

Uptime Pocket supports two ways to authenticate with your Uptime Kuma server.

## Bearer token (recommended)

Kuma 2.0+ supports API tokens. This is the **preferred** method because:

- Tokens don't expire (or have a long lifetime)
- They can be revoked individually in Kuma's settings
- They can be scoped to read-only or full access (Kuma 2.4+)
- They survive password changes

### How to create a token in Kuma

1. Log in to your Kuma web UI as admin
2. Go to **Settings → API Keys** (Kuma 2.4+) or **Settings → Users → [your user]** (earlier versions)
3. Click **Create API Key**
4. Give it a name (e.g. "Uptime Pocket on iPhone")
5. Copy the token — you won't see it again
6. Paste it into Uptime Pocket

## Username & password (fallback)

For older Kuma versions (1.x) or if you prefer, Uptime Pocket can log in with your username and password.

**Note:** We never store your Kuma password. We use it once to log in, get a JWT session token, and then use that token for subsequent requests. The session token is stored in iOS Keychain / Android Keystore, and is automatically refreshed.

## How credentials are stored

- **iOS** — in the iOS Keychain via `expo-secure-store`
- **Android** — in the Android Keystore via `expo-secure-store`
- Never in plain text, never in logs, never sent to anyone but your Kuma server

## What about self-signed certificates?

Uptime Pocket respects your device's trust store. If you use a self-signed cert:

- **iOS:** Install the CA cert on your device (Settings → General → VPN & Device Management → Trust the profile)
- **Android:** Install the CA cert (Settings → Security → Encryption & credentials → Install a certificate)

If your Kuma is on your home network with a self-signed cert, you'll need to trust it on every device that uses Uptime Pocket.

## Multiple servers

Each Kuma server you add has its own auth credentials. They're stored independently. You can mix bearer-token servers and username-password servers.
