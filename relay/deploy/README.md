# Deploying the Uptime Pocket push relay

The relay is a small Go service. It runs anywhere that runs Docker:
a $2/mo VPS, a Raspberry Pi, your laptop, the same machine as
your Kuma instance. There's no vendor lock-in because the image
is published to GitHub Container Registry (free for public repos)
and you pull + run it yourself with plain `docker`.

What you'll need:

1. **A bearer token** for the relay's HTTP API. Any random 32+
   character string. (`openssl rand -hex 32`)
2. **iOS push credentials** (optional, for iOS users): an APNs
   .p8 key from developer.apple.com. The relay uses token-based
   auth, not the older certificate approach.
3. **Android push credentials** (optional, for Android users):
   a Firebase service account JSON from your Firebase project's
   settings.
4. **A persistent volume** for the BoltDB file. The relay stores
   device records, last-known monitor states, and a rolling
   event log here. ~1KB per device, so a 1GB volume is more
   than enough.

Pick your platform — all of these are `docker run` under the hood:

- **[GHCR + Docker (recommended)](#quick-start-docker)** — pull the
  prebuilt image, run it with one command. No build step, no
  account needed on the consumer side.
- **[Home server / docker-compose](./home-server.md)** — for
  self-hosters; lets you put the relay on the same machine as
  your Kuma instance, or run it on a Raspberry Pi.
- **[Render](./render.md)** — simplest managed deploy
- **[DigitalOcean App Platform](./digitalocean.md)** — good if
  you already use DO

## Quick start: Docker

The relay image is published to GitHub Container Registry on every
release. You don't need a GitHub account, a Docker Hub account, or
to install Go. Just pull and run.

```sh
# 1. Pull the latest image (multi-arch: linux/amd64 + linux/arm64)
docker pull ghcr.io/quavon-dev/uptime-pocket:relay-latest

# 2. Generate an API key for the relay's HTTP API
export RELAY_API_KEY=$(openssl rand -hex 32)

# 3. Create a directory for the BoltDB file
mkdir -p ~/.relay-data

# 4. Run it
docker run -d \
  --name uptime-pocket-relay \
  --restart unless-stopped \
  -p 8080:8080 \
  -e "RELAY_API_KEY=${RELAY_API_KEY}" \
  -e "RELAY_PUBLIC_URL=https://relay.example.com" \
  -v ~/.relay-data:/data \
  ghcr.io/quavon-dev/uptime-pocket:relay-latest

# 5. Verify it's up
curl http://localhost:8080/v1/health
```

That's it. The relay is now running, watching no Kuma instances
yet (you'll add them in the Uptime Pocket app). To update to a
newer version later:

```sh
docker pull ghcr.io/quavon-dev/uptime-pocket:relay-latest
docker stop uptime-pocket-relay
docker rm uptime-pocket-relay
# ... then re-run the same `docker run` command above
```

The `-v ~/.relay-data:/data` mount is the important part — that
keeps your device registrations and last-known monitor states
across restarts. Without it, every restart wipes the database and
the app has to re-register.

### Pinning a specific version

The `:relay-latest` tag is convenient for development. For
production, pin to a specific release so a relay update doesn't
break your notifications without warning:

```sh
docker pull ghcr.io/quavon-dev/uptime-pocket:relay-v1.0.0
```

The full version (`:relay-v1.0.0`) is immutable — once published,
it never changes. There's also a `relay-1.0` (no patch version)
tag that floats to the latest 1.0.x.

### Adding APNs (iOS) credentials

If you want to push to iPhones, generate an APNs auth key in
[Apple Developer → Certificates, Identifiers & Profiles →
Keys](https://developer.apple.com/account/resources/authkeys/list).

```sh
docker stop uptime-pocket-relay
docker rm uptime-pocket-relay

# Save the .p8 file somewhere on the host
mkdir -p ~/.relay-data/apns
cp ~/Downloads/AuthKey_ABC123XYZ.p8 ~/.relay-data/apns/

docker run -d \
  --name uptime-pocket-relay \
  --restart unless-stopped \
  -p 8080:8080 \
  -e "RELAY_API_KEY=${RELAY_API_KEY}" \
  -e "RELAY_PUBLIC_URL=https://relay.example.com" \
  -e "RELAY_APNS_ENABLED=true" \
  -e "RELAY_APNS_KEY_ID=ABC123XYZ" \
  -e "RELAY_APNS_TEAM_ID=DEF456UVW" \
  -e "RELAY_APNS_BUNDLE_ID=com.quavon.uptimepocket" \
  -e "RELAY_APNS_ENVIRONMENT=production" \
  -e "RELAY_APNS_KEY_PATH=/run/secrets/apns.p8" \
  -v ~/.relay-data:/data \
  -v ~/.relay-data/apns:/run/secrets:ro \
  ghcr.io/quavon-dev/uptime-pocket:relay-latest
```

### Adding FCM (Android) credentials

In [Firebase Console → Project Settings → Service Accounts →
Generate New Private Key](https://console.firebase.google.com/project/_/settings/serviceaccounts/adminsdk),
download the JSON file:

```sh
mkdir -p ~/.relay-data/fcm
cp ~/Downloads/uptime-pocket-firebase-adminsdk.json ~/.relay-data/fcm/service-account.json

# Update the docker run:
#   -e "RELAY_FCM_ENABLED=true" \
#   -e "RELAY_FCM_CREDENTIALS_PATH=/run/secrets/fcm.json" \
#   -v ~/.relay-data/fcm:/run/secrets:ro \
```

### Behind a reverse proxy (nginx, Caddy, Cloudflare Tunnel)

The relay speaks plain HTTP. You need HTTPS in front of it
because the iOS and Android apps POST the push token over the
wire. The easiest options:

- **Caddy** — automatic HTTPS via Let's Encrypt, one config block.
- **Cloudflare Tunnel** — no port forwarding, free tier covers it.
- **nginx** with `certbot --nginx` — more setup, more control.

Example Caddyfile:

```
relay.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

## Architecture in one diagram

```
┌──────────────┐                                  ┌──────────────┐
│  Uptime      │  metrics scrape every 10s        │  The relay   │
│  Kuma        │ <──────────────────────────────> │  (this code) │
└──────────────┘                                  │              │
                                                 │  HTTP API    │
┌──────────────┐  POST /v1/devices                │  /v1/...     │
│  Uptime      │ ───────────────────────────────> │              │
│  Pocket app  │                                  │  APNs/FCM    │
└──────────────┘                                  └──────┬───────┘
                                                        │
                                            APNs       │       FCM
                                                        ▼
                                              ┌──────────────┐
                                              │  Push to     │
                                              │  your phone  │
                                              └──────────────┘
```

## Health check

Once deployed, the relay exposes:

- `GET /v1/health` — JSON with device count, state count, config
  summary. **No auth required** — safe to wire into your platform's
  healthcheck.
- `GET /v1/version` — version + commit hash. No auth.

Example health response:

```json
{
  "ok": true,
  "uptime": "3h21m",
  "stats": {
    "deviceCount": 2,
    "stateCount": 17,
    "eventCount": 4,
    "oldestEventAt": 1749426000000
  },
  "config": {
    "apnsEnabled": true,
    "apnsEnvironment": "production",
    "fcmEnabled": true,
    "coalesceWindowMs": 30000,
    "coalesceMinN": 3
  }
}
```

## Logs

The relay logs to stdout in JSON (slog). `docker logs uptime-pocket-relay`
or your platform's log drain picks them up. Each log line is one
event:

```json
{"time":"2026-06-08T10:00:00Z","level":"INFO","msg":"alert sent","server":"k1","monitor":"API","sent":1,"total":1}
{"time":"2026-06-08T10:00:01Z","level":"WARN","msg":"kuma k1: scrape failed: Get https://kuma...: context deadline exceeded"}
```

## Local development

```sh
# Run the test suite
go test ./...

# Run the relay against a local Kuma
export RELAY_API_KEY=$(openssl rand -hex 32)
export RELAY_DB_PATH=./relay.db
go run ./cmd/relay

# In another terminal, register a fake device
curl -X POST http://localhost:8080/v1/devices \
  -H "Authorization: Bearer ${RELAY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "dev-1",
    "platform": "android",
    "pushToken": "fake-token",
    "servers": [{"id":"","label":"Local","url":"http://localhost:3001"}],
    "quietHours": {"enabled": false, "startMinute": 0, "endMinute": 0},
    "locale": "en"
  }'
```

The relay is designed to start, accept registrations, and stay
quiet — when nothing happens, it logs nothing. Push something in
Kuma (pause + resume a monitor) and you'll see the diff engine
fire.

## Security

- The relay exposes a single bearer-token-authenticated API. Pick
  a strong token; rotate it via the `RELAY_API_KEY` env var and
  re-register devices.
- BoltDB is stored unencrypted on disk. If you want encryption
  at rest, mount the volume on a LUKS-encrypted filesystem or
  use a platform that encrypts volumes by default (Render,
  DO all do this).
- Push tokens never leave the relay. They're not exposed via any
  API endpoint, and we don't log them.
- The relay **does not** proxy Kuma traffic. It only scrapes
  /metrics, which is read-only. The relay never needs write
  access to your Kuma.
