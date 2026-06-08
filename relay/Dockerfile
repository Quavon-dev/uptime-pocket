# --- build stage ---
FROM golang:1.22-alpine AS build

WORKDIR /src

# Pre-copy go.mod / go.sum for better layer caching when only
# source changes.
COPY go.mod go.sum* ./
RUN go mod download

# Copy source
COPY . .

# Build a static, stripped binary. We use -trimpath to make
# stack traces reproducible across machines, and -ldflags to
# strip the symbol table.
#
# Version + Commit are set at build time via --build-arg.
ARG VERSION=dev
ARG COMMIT=unknown
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags "-s -w -X github.com/quavon-dev/uptime-pocket-relay/internal/server.Version=${VERSION} -X github.com/quavon-dev/uptime-pocket-relay/internal/server.Commit=${COMMIT}" \
    -o /out/relay \
    ./cmd/relay

# --- runtime stage ---
FROM gcr.io/distroless/static-debian12:nonroot

# Copy the static binary
COPY --from=build /out/relay /relay

# Default data dir (the relay creates relay.db here on first run).
# Mount a volume to persist the DB across container restarts.
WORKDIR /data
VOLUME ["/data"]

# distroless runs as uid 65532 (nonroot) by default. BoltDB needs
# write access to /data, so we set up a writable dir.
USER nonroot:nonroot

# HTTP listener (matches RELAY_HTTP_ADDR default of :8080)
EXPOSE 8080

ENTRYPOINT ["/relay"]
