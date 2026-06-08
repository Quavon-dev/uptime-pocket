// Package server is the relay's HTTP surface.
//
// Endpoints:
//
//   POST   /v1/devices    Register or update a device + its subscriptions
//   DELETE /v1/devices    Unregister a device (we stop sending pushes)
//   GET    /v1/health     Liveness + stats (no auth)
//   GET    /v1/version    Build version (no auth)
//
// All authenticated endpoints require:
//
//   Authorization: Bearer <RELAY_API_KEY>
//
// The bearer is the same value the relay was started with
// (RELAY_API_KEY env var). We keep it single-key for v1.0; per-
// device tokens can be a v1.1 feature.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/google/uuid"

	"github.com/quavon-dev/uptime-pocket-relay/internal/config"
	"github.com/quavon-dev/uptime-pocket-relay/internal/storage"
)

// Server is the HTTP front door. It owns the storage handle and
// the auth key; the Kuma watcher (not in this package) reads
// from storage independently.
type Server struct {
	cfg     *config.Config
	store   *storage.Store
	logger  *slog.Logger
	handler http.Handler // optional override for tests / middleware
}

// New constructs a Server. The caller is responsible for calling
// Start.
func New(cfg *config.Config, store *storage.Store, logger *slog.Logger) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	return &Server{cfg: cfg, store: store, logger: logger}
}

// SetHandler overrides the HTTP handler. If unset, Start uses
// Router(). SetHandler is the right way to add outer middleware
// (e.g. an access-log or panic-recovery wrapper) without
// modifying the router config.
func (s *Server) SetHandler(h http.Handler) {
	s.handler = h
}

// Router builds the chi mux. Exposed so tests can mount the
// router on a httptest.Server without going through Start.
func (s *Server) Router() http.Handler {
	r := chi.NewRouter()

	// Middleware: request ID, recover from panics, compress,
	// and a slim structured-access log.
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Compress(5, "gzip"))
	r.Use(s.requestLogger())

	// CORS: the only client is the Uptime Pocket app, which
	// hits the relay from native code. We allow no origins by
	// default; if you front the relay with a web admin later,
	// add your origin here.
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{},
		AllowedMethods: []string{"GET", "POST", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Authorization", "Content-Type"},
		MaxAge:         300,
	}))

	// Public
	r.Get("/v1/health", s.handleHealth)
	r.Get("/v1/version", s.handleVersion)

	// Authenticated
	r.Group(func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Post("/v1/devices", s.handleRegisterDevice)
		r.Delete("/v1/devices", s.handleUnregisterDevice)
	})

	return r
}

// Start begins listening on cfg.HTTPAddr and blocks until ctx
// is canceled. Returns the first error from ListenAndServe.
func (s *Server) Start(ctx context.Context) error {
	handler := s.handler
	if handler == nil {
		handler = s.Router()
	}
	srv := &http.Server{
		Addr:              s.cfg.HTTPAddr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		s.logger.Info("relay listening", "addr", s.cfg.HTTPAddr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		// Graceful shutdown: give in-flight requests 5s.
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

// --- middleware ---

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authz := r.Header.Get("Authorization")
		const prefix = "Bearer "
		if !strings.HasPrefix(authz, prefix) {
			http.Error(w, "missing bearer token", http.StatusUnauthorized)
			return
		}
		token := strings.TrimPrefix(authz, prefix)
		// Constant-time compare to prevent timing side-channels.
		if !subtleEqual(token, s.cfg.APIKey) {
			http.Error(w, "invalid bearer token", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) requestLogger() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			s.logger.Info("http",
				"method", r.Method,
				"path", r.URL.Path,
				"status", ww.Status(),
				"bytes", ww.BytesWritten(),
				"duration_ms", time.Since(start).Milliseconds(),
				"req_id", middleware.GetReqID(r.Context()),
			)
		})
	}
}

func subtleEqual(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	var x byte
	for i := 0; i < len(a); i++ {
		x |= a[i] ^ b[i]
	}
	return x == 0
}

// --- handlers ---

// RegisterRequest is the body of POST /v1/devices.
type RegisterRequest struct {
	DeviceID   string                  `json:"deviceId"`
	Platform   storage.Platform        `json:"platform"`
	PushToken  string                  `json:"pushToken"`
	Servers    []storage.ServerRef     `json:"servers"`
	QuietHours storage.QuietHours      `json:"quietHours"`
	Locale     string                  `json:"locale"`
}

func (r RegisterRequest) validate() error {
	if r.DeviceID == "" {
		return errors.New("deviceId is required")
	}
	if r.Platform != storage.PlatformIOS && r.Platform != storage.PlatformAndroid {
		return fmt.Errorf("platform must be 'ios' or 'android', got %q", r.Platform)
	}
	if r.PushToken == "" {
		return errors.New("pushToken is required")
	}
	// Reject obviously bad device IDs. Real IDs are UUIDs,
	// IDFVs, or Android device IDs; we don't try to enumerate
	// valid forms, we just reject control characters.
	for _, c := range r.DeviceID {
		if c < 0x20 || c == 0x7F {
			return errors.New("deviceId contains control characters")
		}
	}
	return nil
}

func (s *Server) handleRegisterDevice(w http.ResponseWriter, r *http.Request) {
	// Cap the body size to keep memory bounded. 16KB is plenty
	// for our device record.
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	defer r.Body.Close()

	var req RegisterRequest
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("invalid json: %v", err), http.StatusBadRequest)
		return
	}
	if err := req.validate(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Reject devices for platforms we can't actually push to.
	switch req.Platform {
	case storage.PlatformIOS:
		if !s.cfg.APNs.Enabled {
			http.Error(w, "iOS push is not configured on this relay", http.StatusServiceUnavailable)
			return
		}
	case storage.PlatformAndroid:
		if !s.cfg.FCM.Enabled {
			http.Error(w, "Android push is not configured on this relay", http.StatusServiceUnavailable)
			return
		}
	}

	// Normalize: assign IDs to server refs that don't have one.
	for i := range req.Servers {
		if req.Servers[i].ID == "" {
			req.Servers[i].ID = "srv-" + uuid.NewString()
		}
	}

	rec := storage.DeviceRecord{
		DeviceID:   req.DeviceID,
		Platform:   req.Platform,
		PushToken:  req.PushToken,
		Servers:    req.Servers,
		QuietHours: req.QuietHours,
		Locale:     req.Locale,
	}
	if err := s.store.PutDevice(rec); err != nil {
		s.logger.Error("PutDevice failed", "err", err, "device_id", req.DeviceID)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	s.logger.Info("device registered", "device_id", req.DeviceID, "platform", req.Platform, "servers", len(req.Servers))
	w.WriteHeader(http.StatusNoContent)
}

// UnregisterRequest is the body of DELETE /v1/devices.
type UnregisterRequest struct {
	DeviceID string `json:"deviceId"`
}

func (s *Server) handleUnregisterDevice(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4*1024)
	defer r.Body.Close()

	var req UnregisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.DeviceID == "" {
		http.Error(w, "deviceId is required", http.StatusBadRequest)
		return
	}
	if err := s.store.DeleteDevice(req.DeviceID); err != nil {
		s.logger.Error("DeleteDevice failed", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	s.logger.Info("device unregistered", "device_id", req.DeviceID)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	stats, err := s.store.Stats()
	if err != nil {
		http.Error(w, "stats unavailable", http.StatusInternalServerError)
		return
	}
	resp := struct {
		OK     bool             `json:"ok"`
		Uptime string           `json:"uptime"`
		Stats  storage.Stats    `json:"stats"`
		Config config.Summary   `json:"config"`
	}{
		OK:     true,
		Uptime: time.Since(startedAt).Round(time.Second).String(),
		Stats:  stats,
		Config: s.cfg.Summary(),
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"version": Version,
		"commit":  Commit,
	})
}

// --- version + startup ---

// Version and Commit are set at build time via -ldflags.
var (
	Version = "dev"
	Commit  = "unknown"
)

var startedAt = time.Now()
