# Deploying the Uptime Pocket push relay

The relay is a small Go service. It runs anywhere that runs Docker:
Fly.io, Render, DigitalOcean App Platform, a home server with
docker-compose, or a $4/mo VPS.

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

Pick your platform:

- [Fly.io](./fly.md) — easiest, ~$2/mo for the smallest VM
- [Render](./render.md) — simplest deploy UX
- [DigitalOcean App Platform](./digitalocean.md) — good if you
  already use DO
- [Home server / docker-compose](./home-server.md) — for
  self-hosters; lets you put the relay on the same machine as
  your Kuma instance

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

The relay logs to stdout in JSON (slog). On Fly / Render / DO,
platform-level log drain picks them up automatically. Each log
line is one event:

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
  -H "Authorization: Bearer $RELAY_API_KEY" \
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
  use a platform that encrypts volumes by default (Fly, Render,
  DO all do this).
- Push tokens never leave the relay. They're not exposed via any
  API endpoint, and we don't log them.
- The relay **does not** proxy Kuma traffic. It only scrapes
  /metrics, which is read-only. The relay never needs write
  access to your Kuma.
