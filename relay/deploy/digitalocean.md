# Deploying to DigitalOcean App Platform

App Platform is a managed PaaS like Heroku. The relay's
small footprint fits in the $5/mo Basic tier.

## Steps

1. **Create the app:**
   - Source: your fork of the uptime-pocket repo
   - **Source directory:** `relay`
   - **Autodeploy:** main branch
   - **Type:** Worker Service (not Web Service — the relay
     doesn't serve public HTTP, it only accepts device
     registrations)

   Wait, that's wrong. The relay DOES serve HTTP. Use a Web
   Service. (The push logic runs in the background but the
   HTTP API is part of the same binary.)

2. **Build command:** leave blank (Dockerfile does it).
   **Dockerfile path:** `relay/Dockerfile`.

3. **Environment variables:** add the same set as the Fly.io
   / Render guides. The App Platform UI handles "secret"
   type env vars with an extra lock icon.

4. **Persistent storage:** App Platform doesn't have
   mounted volumes the way Fly does. Instead, use a
   **DigitalOcean Space** (S3-compatible object storage) or
   accept that the relay is **stateless on DO** and pair it
   with a managed Postgres for the device store.

   For v1.0 of the relay (BoltDB), DO App Platform isn't
   the ideal target. **Use Fly.io or Render instead** unless
   you specifically want to run on DO.

   If you must use DO: deploy as a Droplet (a plain VM)
   following the [home server guide](./home-server.md) and
   use DO's block storage. A $4/mo basic Droplet is enough.

## Why we don't recommend App Platform for the relay

- No mounted volumes (BoltDB needs a real filesystem)
- The relay's HTTP listener doesn't fit cleanly into App
  Platform's "Web Service" model (it's an API, not a
  user-facing site)
- The free allowance is tighter than Fly or Render

For a fuller evaluation of "where should I run the relay?",
see the top-level [`README.md`](./README.md) — Fly is the
default recommendation.
