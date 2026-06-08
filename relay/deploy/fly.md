# Deploying to Fly.io

Fly.io is the easiest place to run the relay. The smallest VM
(shared-cpu-1x, 256MB RAM) is plenty; the relay uses ~10MB of
RSS under steady state.

## Prerequisites

- A Fly.io account (https://fly.io)
- `flyctl` installed (`brew install flyctl` or `curl -L
  https://fly.io/install.sh | sh`)
- An APNs .p8 key (for iOS) and/or a FCM service account JSON
  (for Android). See `../README.md` for where to get these.

## One-time setup

1. **Create the app:**

   ```sh
   cd relay/
   fly launch --no-deploy --name uptime-pocket-relay
   ```

   This creates `fly.toml` and a new app. We'll edit `fly.toml`
   below.

2. **Create a persistent volume** for the BoltDB file. The
   relay needs ~1KB per registered device, so 1GB is more than
   enough.

   ```sh
   fly volumes create relay_data --size 1 --region <your-region>
   ```

   The default region is whatever you set in `fly launch`.
   Use `fly regions list` to find yours.

3. **Set secrets.** Fly's `secrets` are encrypted at rest and
   injected as env vars at runtime. NEVER commit them to git.

   ```sh
   # Required
   fly secrets set RELAY_API_KEY=$(openssl rand -hex 32)

   # Optional, for iOS
   fly secrets set APNS_KEY_ID=ABCDE12345
   fly secrets set APNS_TEAM_ID=TEAM123456
   fly secrets set APNS_BUNDLE_ID=de.quavon.uptimepocket
   fly secrets set APNS_ENVIRONMENT=production  # or 'sandbox' for TestFlight

   # Optional, for Android
   fly secrets set FCM_PROJECT_ID=your-firebase-project
   ```

4. **Upload the APNs .p8 and FCM service account** as Fly
   secrets. These are files, so the command is slightly
   different:

   ```sh
   # APNs
   fly secrets import < AuthKey_XXXXXX.p8
   # This sets APNS_KEY_PATH=/secrets/APNS_KEY_ID.p8 inside
   # the container; see the fly.toml below for the mount.
   ```

   Wait — Fly's `secrets import` reads from stdin, not a file
   path. The cleanest pattern is to use a secret volume:

   ```sh
   # Create a secret volume and copy the .p8 into it
   fly volumes create apns_secrets --size 1
   # Use `fly ssh` or the volumes UI to upload the file
   ```

   OR (simpler): base64-encode the .p8 and set it as an env
   var, then write it to a file in the container entrypoint.

   The simplest approach for v1.0 is to **bake the .p8 into
   a Docker image as a secret layer** and accept the
   tradeoff of having to rotate the image when you rotate
   the key:

   ```dockerfile
   # In your custom Dockerfile (forked from this repo's)
   COPY AuthKey_XXXXXX.p8 /secrets/apns/AuthKey_XXXXXX.p8
   ```

   We'll cover the base64-in-env approach in a future doc
   update; for now, a private Docker image with the .p8
   is the path of least resistance.

5. **Edit `fly.toml`** (created by `fly launch`). Replace the
   generated contents with the example in `fly.toml.example`
   in this directory.

## Deploy

```sh
fly deploy
```

The first deploy will take ~3 minutes (Docker build on Fly's
machines). Subsequent deploys use layer caching and are much
faster.

## Verify

```sh
# Liveness check
fly status

# Logs
fly logs

# Hit the health endpoint
fly curl https://uptime-pocket-relay.fly.dev/v1/health
```

If `/v1/health` returns 200 with `"ok": true`, you're up.

## Scaling

The relay is single-process by design — BoltDB is local, and
horizontal scaling would need a shared store. For v1.0 we
recommend running a single instance. Fly's smallest VM is
plenty for thousands of devices.

If you ever need to scale, the path is:
1. Switch from BoltDB to a shared store (Postgres).
2. Add a `RELAY_INSTANCE_ID` env var so each instance only
   polls the Kuma servers it was assigned (consistent
   hashing on server ID).
3. Use a distributed lock around the "send push" critical
   section.

We don't anticipate needing this before 10k+ active devices.

## Custom domain

If you want a vanity URL like `relay.yourdomain.com`:

```sh
fly certs create relay.yourdomain.com
```

Then add a CNAME in your DNS:
- Host: `relay`
- Value: `uptime-pocket-relay.fly.net`

The relay speaks plain HTTP on port 8080; Fly terminates TLS
in front of it. No additional config needed.

## Costs

On Fly.io as of June 2026, a shared-cpu-1x / 256MB VM in a
non-prime region runs about $1.94/month. A 1GB volume is
$0.15/month. Total: roughly $2/mo. The free allowance covers
the public IPv4 and HTTPS.

## Backups

BoltDB is a single file. To back up:

```sh
# Stream a snapshot
fly ssh console -C "cat /data/relay.db" > backup.db

# Or use the platform's snapshot feature (Pro plan only)
```

Restore is just `cp backup.db /data/relay.db && fly restart`.
