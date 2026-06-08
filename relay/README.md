# Uptime Pocket push relay

A small Go service that watches one or more Uptime Kuma
instances and forwards status changes as push notifications
to the Uptime Pocket mobile app.

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

## Why this exists

The mobile app already has "Direct" mode, where it holds a
socket open to Kuma and posts local notifications when
something changes. This works while the app is in the
foreground or recently backgrounded. iOS and Android
**will** suspend the app after a few minutes, though, and the
socket drops.

The relay is the always-on alternative. It runs on a server
(typically a $2/mo VM or your home server) and pushes to your
phone via APNs (iOS) and FCM (Android) — the same way every
other app delivers notifications. The result: you can lock
your phone for six hours and still get pinged the moment a
monitor goes down.

## What you get

- **One binary.** `relay` is ~10MB, no runtime deps, runs
  on Linux/macOS/Windows/anything that runs Go 1.22+.
- **One config file.** All settings are env vars. See
  `.env.example`.
- **One persistent file.** BoltDB. ~1KB per registered
  device. 1GB volume is more than enough.
- **Three HTTP endpoints.** `POST /v1/devices`,
  `DELETE /v1/devices`, `GET /v1/health`. That's it.
- **Two push transports.** APNs (iOS) and FCM (Android).
  Either, both, or neither — the relay starts even if no
  transport is configured, so you can develop locally
  without Apple/Firebase credentials.

## What you don't get (v1.0)

- **No multi-tenant support.** The relay is single-tenant.
  If you want to share it with friends, deploy one relay per
  user.
- **No push for "test" events.** Only DOWN and UP
  transitions fire a push. Kuma's own per-monitor "test"
  button doesn't generate a transition the relay can see.
- **No push for "maintenance" / "paused".** We don't notify
  when the user puts a monitor in maintenance; they did it
  on purpose.
- **No web UI.** Configuration is via env vars and
  registration is via the app. We'll add a small admin UI
  in v1.1 if there's demand.

## Quick start

```sh
# 1. Clone + build
git clone https://github.com/Quavon-dev/uptime-pocket
cd uptime-pocket/relay
go build -o relay ./cmd/relay

# 2. Configure
cp .env.example .env
# Edit .env — at minimum set RELAY_API_KEY

# 3. Run
./relay

# 4. In another terminal, verify
curl http://localhost:8080/v1/health
```

For a real deployment, see [`deploy/README.md`](./deploy/README.md).
The recommended path is `docker run` against the GitHub
Container Registry image (free, works anywhere Docker
runs), or a home server with docker-compose.

## Testing

```sh
go test ./...
```

The test suite covers:

- `internal/kuma` — Prometheus metrics parser (new + legacy
  format), HTTP poller, error paths
- `internal/status` — transition detection (outage vs
  recovery vs no-change vs maintenance), quiet hours math
  (same-day, overnight, 24h silent)
- `internal/storage` — BoltDB CRUD, event window, stats
- `internal/coalesce` — "3+ in 30s" rule, trigger detection
- `internal/server` — HTTP handlers, auth, validation
- `internal/transport` — multiplexer fanout, error
  propagation, invalid-token cleanup

Total: 80+ tests. They run in ~1s. No external dependencies
needed (no Docker, no live Kuma, no real APNs/FCM).

## Architecture notes

### Why Prometheus scraping, not socket.io?

Kuma's socket protocol has changed twice in 24 months. The
`/metrics` endpoint has been stable since 1.13. For a relay
that runs 24/7 and needs to be reliable, the metrics path is
the safer bet. Trade-off: we lose the per-heartbeat message
("HTTP 200", "timeout", "TLS error"). v1.0 doesn't include
it in the push; v1.1 will.

### Why BoltDB, not Postgres?

A relay with a few hundred devices has maybe 100KB of state.
BoltDB is a single file with no setup. We can swap to
Postgres later (the storage interface is one file) without
touching any of the other code.

### Why Go?

Single static binary, no runtime, excellent concurrency
primitives for the fan-out, and the standard library has
everything we need (HTTP/2 for APNs, OAuth2 for FCM, JWT
signing, BoltDB). No need for a heavier runtime.

## Project layout

```
relay/
  cmd/relay/main.go              # entry point, wires everything
  internal/
    config/                      # env var loading + validation
    kuma/                        # Kuma watcher + metrics parser
    status/                      # transition detection
    storage/                     # BoltDB CRUD
    coalesce/                    # "many down at once" rule
    server/                      # HTTP API
    transport/                   # APNs + FCM senders, multiplexer
  deploy/                        # Render / DO / home-server
  Dockerfile
  go.mod
  .env.example
  README.md (this file)
```

## License

MIT, same as the rest of Uptime Pocket.
