# Deploying on a home server (or any VPS) with docker-compose

This is the path for self-hosters who already have a server
running 24/7. The relay goes next to your Kuma instance, both
on the same machine.

## Prerequisites

- Docker + docker-compose installed
- A domain name (optional but recommended — lets you use
  Let's Encrypt instead of self-signed certs)
- Reverse proxy: Caddy, nginx, or Traefik

## docker-compose.yml

```yaml
version: "3.8"

services:
  relay:
    build: ./relay              # path to the relay/ directory in this repo
    container_name: uptime-pocket-relay
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"   # only exposed to the host; reverse proxy handles external
    volumes:
      - ./data/relay:/data       # BoltDB persistence
      - ./secrets/apns:/secrets/apns:ro
      - ./secrets/fcm:/secrets/fcm:ro
    environment:
      RELAY_HTTP_ADDR: ":8080"
      RELAY_DB_PATH: "/data/relay.db"
      RELAY_API_KEY: "${RELAY_API_KEY}"
      RELAY_COALESCE_WINDOW: "30s"
      RELAY_COALESCE_MIN: "3"
      RELAY_LOG_LEVEL: "info"

      # iOS
      APNS_KEY_ID: "${APNS_KEY_ID}"
      APNS_TEAM_ID: "${APNS_TEAM_ID}"
      APNS_BUNDLE_ID: "${APNS_BUNDLE_ID}"
      APNS_KEY_PATH: "/secrets/apns/AuthKey.p8"
      APNS_ENVIRONMENT: "production"

      # Android
      FCM_PROJECT_ID: "${FCM_PROJECT_ID}"
      FCM_SERVICE_ACCOUNT_PATH: "/secrets/fcm/service-account.json"
```

Put the secrets in a `.env` file alongside the compose file:

```
RELAY_API_KEY=*** rand -hex 32)
APNS_KEY_ID=ABCDE12345
APNS_TEAM_ID=TEAM123456
APNS_BUNDLE_ID=de.quavon.uptimepocket
FCM_PROJECT_ID=your-firebase-project
```

And put the actual key files in the volumes:

```
secrets/
  apns/
    AuthKey.p8          # the APNs .p8 from Apple
  fcm/
    service-account.json # the Firebase service account JSON
```

## Reverse proxy

### Caddy (recommended)

```caddy
relay.yourdomain.com {
    reverse_proxy 127.0.0.1:8080
}
```

Caddy auto-provisions Let's Encrypt certs. Done.

### nginx

```nginx
server {
    server_name relay.yourdomain.com;
    listen 443 ssl http2;
    ssl_certificate     /etc/letsencrypt/live/relay.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/relay.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Use `certbot --nginx -d relay.yourdomain.com` to provision
the cert.

## First deploy

```sh
# Build and start
docker compose up -d

# Check logs
docker compose logs -f relay

# Verify health (from the host)
curl http://127.0.0.1:8080/v1/health
```

You should see:

```json
{"ok":true,"uptime":"3s","stats":{...},"config":{...}}
```

## Updates

```sh
git pull
docker compose build
docker compose up -d
```

The BoltDB file is mounted from the host (`./data/relay`) so
your devices persist across upgrades.

## Backups

```sh
# Hot snapshot (BoltDB supports online backup via a write
# lock; we just copy the file)
cp ./data/relay/relay.db ./backups/relay-$(date +%Y%m%d).db
```

Schedule this in cron. 1KB per device, so even daily
backups of a 1000-device relay are 1MB.

## Monitoring

If you have Prometheus / Grafana, the relay exposes
`/v1/health` as a JSON endpoint. Write a tiny exporter (or
just poll the JSON with `blackbox_exporter` and a JSON
path query).

If you don't, the simplest approach is `cron + curl + pager`:

```sh
# /etc/cron.d/relay-healthcheck
*/5 * * * * curl -fsS http://127.0.0.1:8080/v1/health > /dev/null || /usr/local/bin/notify-oncall
```

## Hardening

- **Bind to localhost only** (`127.0.0.1:8080:8080` in the
  compose file). The reverse proxy is the only thing that
  should talk to the relay directly.
- **TLS in front.** The relay speaks plain HTTP. Always
  terminate TLS at the reverse proxy.
- **Fail2ban** on the reverse proxy logs: anyone hitting
  the relay with a wrong bearer token thousands of times is
  either misconfigured or hostile. Default fail2ban jails
  catch this.
- **Updates:** subscribe to releases on GitHub. We won't
  ship a release that needs manual migration more than once
  a year, but watching the repo is still the right call.
