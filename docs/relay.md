# Push Relay

> ⚠️ **Phase 0 — this is a placeholder.** The relay is implemented in Phase 6.

The Uptime Pocket push relay is a small Go service that bridges your self-hosted Uptime Kuma to APNs (iOS) and FCM (Android).

## Why a relay?

iOS and Android push notifications require server-side credentials. The relay:

- Connects to your Kuma instance via socket.io
- Receives monitor state changes
- Sends push notifications to your registered devices
- Sends silent pushes to update home screen widgets

## Quick start (planned)

```yaml
# Add to your docker-compose.yml
services:
  kuma:
    # ... your existing uptime-kuma config ...

  kuma-pocket-relay:
    image: ghcr.io/quavon-dev/uptime-pocket-relay:latest
    container_name: uptime-pocket-relay
    restart: unless-stopped
    environment:
      - KUMA_POCKET_PORT=3015
      - APNS_KEY_PATH=/secrets/apns.p8
      - APNS_KEY_ID=your_key_id
      - APNS_TEAM_ID=your_team_id
      - APNS_BUNDLE_ID=de.quavon.uptimepocket
      - FCM_PROJECT_ID=your_project_id
      - FCM_SERVICE_ACCOUNT_PATH=/secrets/fcm.json
    volumes:
      - ./secrets:/secrets:ro
      - relay-data:/data
    ports:
      - "3015:3015"

volumes:
  relay-data:
```

## Configuration

You'll need:

1. **APNs auth key** (`.p8` file) from [Apple Developer](https://developer.apple.com/account/resources/authkeys)
2. **FCM service account** (`.json` file) from [Firebase Console](https://console.firebase.google.com/)

Both are free. Apple charges €99/year for the developer account, Google charges $25 one-time for Play.

## Security

- HTTPS only (put it behind Caddy/Traefik/nginx as usual)
- Per-device tokens with rotate/revoke
- No telemetry, no analytics
- MIT-licensed source — audit it yourself

## When to deploy the relay

After you've tried the app in **Direct** mode and decided you want better notifications. The relay is opt-in and lives next to your Kuma instance. It's not required to use the app.

---

**Status: planned for Phase 6 (~10 weeks in).** Follow the project for updates.
