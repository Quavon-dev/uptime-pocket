# Deploying to DigitalOcean App Platform

App Platform is a managed PaaS like Heroku. The relay's
small footprint fits in the $5/mo Basic tier.

**Before you start:** if you don't have a specific reason
to use App Platform, see [`deploy/README.md`](./README.md)
for the recommended path. App Platform has two limitations
that make it awkward for the relay:

- **No mounted volumes.** BoltDB needs a real filesystem.
- **The "Web Service" model doesn't quite fit** — the relay
  serves an HTTP API but the real work is the background
  push loop.

If you can pick your host, the
[home-server docker-compose guide](./home-server.md) (run on
a $4/mo Droplet) is the simplest way to get the relay up
on DigitalOcean infrastructure.

## If you must use App Platform

1. **Create the app:**
   - Source: your fork of the uptime-pocket repo
   - **Source directory:** `relay`
   - **Autodeploy:** main branch
   - **Type:** Web Service (the relay serves HTTP even though
     the push loop is in the background)

2. **Build command:** leave blank (Dockerfile does it).
   **Dockerfile path:** `relay/Dockerfile`.

3. **Environment variables:** add the same set as the Render
   guide. The App Platform UI handles "secret" type env vars
   with an extra lock icon.

4. **Persistent storage:** the only path on App Platform is
   to accept that the relay is **stateless on DO** and pair
   it with a managed Postgres for the device store. That's
   a v1.1 feature; in v1.0 the relay uses BoltDB and so App
   Platform isn't a great fit.

## Better: use a Droplet

A $4/mo basic Droplet running the
[home-server docker-compose guide](./home-server.md) gives
you a proper filesystem for BoltDB, no vendor lock-in, and
full control over the network. Recommended.
