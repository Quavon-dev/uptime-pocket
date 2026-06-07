# Uptime Pocket Push Relay

> ⚠️ **Phase 0 — this directory is a placeholder.** Implementation lands in Phase 6.

A small Go service (~250 LOC, ~15MB final image) that bridges Uptime Kuma to APNs and FCM.

## Planned architecture

```
┌──────────────┐    socket.io    ┌─────────────┐   APNs/FCM   ┌──────────┐
│  Kuma server │ ───────────────▶│   Relay     │─────────────▶│  Devices │
└──────────────┘                │  (this dir) │              └──────────┘
                                └─────────────┘
                                      │
                                      └─ SQLite (devices, monitor subscriptions)
```

## Status

- [ ] `main.go` — entry point
- [ ] `apns.go` — APNs HTTP/2 sender
- [ ] `fcm.go` — FCM HTTP v1 sender
- [ ] `kuma.go` — Kuma socket.io subscriber
- [ ] `api.go` — device registration HTTP API
- [ ] `auth.go` — token issuance & validation
- [ ] `store.go` — SQLite-backed device store
- [ ] `Dockerfile` — multi-stage, ~15MB final
- [ ] `docker-compose.yml` — sample deployment

## Tech

- Go 1.22+
- `github.com/gorilla/websocket` or similar for Kuma socket.io
- `github.com/sideshow/apns2` for APNs
- `firebase.google.com/go/v4` for FCM
- `mattn/go-sqlite3` for storage
- `chi` or `gin` for the HTTP API

Follow the build: see [docs/relay.md](../docs/relay.md).
