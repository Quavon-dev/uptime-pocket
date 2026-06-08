# Deploying to Render

Render is the simplest "git push to deploy" experience. The
free tier works for the relay but with caveats (it spins down
after 15 min of inactivity, which means your push token might
be stale when the relay wakes up). For 24/7 use, the $7/mo
Starter plan is fine.

## Steps

1. **Create a new Web Service** in the Render dashboard.
   - Connect your fork of the uptime-pocket repo
   - **Root directory:** `relay`
   - **Environment:** Docker
   - **Region:** whichever is closest to your Kuma instance
   - **Instance type:** Starter ($7/mo) or higher

2. **Set environment variables** in the dashboard (Settings
   → Environment):

   ```
   RELAY_API_KEY=*** rand -hex 32)
   RELAY_HTTP_ADDR=:8080
   RELAY_DB_PATH=/data/relay.db
   RELAY_COALESCE_WINDOW=30s
   RELAY_COALESCE_MIN=3
   RELAY_LOG_LEVEL=info

   # iOS (optional)
   APNS_KEY_ID=ABCDE12345
   APNS_TEAM_ID=TEAM123456
   APNS_BUNDLE_ID=de.quavon.uptimepocket
   APNS_ENVIRONMENT=production

   # Android (optional)
   FCM_PROJECT_ID=your-firebase-project
   ```

3. **Add a persistent disk** (Starter plan and up only):
   - Settings → Disks → Add Disk
   - Name: `relay_data`
   - Mount path: `/data`
   - Size: 1 GB

4. **For the APNs .p8 and FCM service account JSON:** these
   are files, not env vars. The easiest path on Render is
   to base64-encode them and decode at startup via a custom
   `render.yaml`. Or — same as the Fly.io doc — bake them
   into a private Docker image.

   The cleanest pattern (in `render.yaml`):

   ```yaml
   services:
     - type: web
       name: uptime-pocket-relay
       runtime: docker
       dockerfilePath: ./relay/Dockerfile
       envVars:
         - key: APNS_KEY_P8_B64
           sync: false
         - key: FCM_SERVICE_ACCOUNT_B64
           sync: false
   ```

   Then add a tiny entrypoint script that decodes them:

   ```sh
   #!/bin/sh
   set -e
   mkdir -p /secrets/apns /secrets/fcm
   echo $APNS_KEY_P8_B64 | base64 -d > /secrets/apns/AuthKey.p8
   echo $FCM_SERVICE_ACCOUNT_B64 | base64 -d > /secrets/fcm/sa.json
   export APNS_KEY_PATH=/secrets/apns/AuthKey.p8
   export FCM_SERVICE_ACCOUNT_PATH=/secrets/fcm/sa.json
   exec /relay
   ```

   We'll fold this into the upstream `Dockerfile` in v1.1;
   for now, fork the Dockerfile and add the script.

5. **Health check path:** `/v1/health` (Render infers the
   port from the `PORT` env var, but our relay reads
   `RELAY_HTTP_ADDR` — set them consistently).

6. **Deploy:** click Manual Deploy → Deploy latest commit.

## Verify

In the Render dashboard:

- **Logs** tab: should show `{"msg":"relay listening","addr":":8080"}`
- **Events** tab: the deploy should be "Live"
- **Shell** tab: `curl http://localhost:8080/v1/health` should
  return JSON

## Costs

- Starter plan: $7/mo
- Plus $0.25/GB-month for the persistent disk (1GB = $0.25)
- Total: roughly $7.25/mo

The free tier technically works but the spin-down behavior
will silently break push. If you must use the free tier,
enable "Always On" in the instance settings (experimental).
