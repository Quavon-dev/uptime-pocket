package server

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/quavon-dev/uptime-pocket-relay/internal/config"
	"github.com/quavon-dev/uptime-pocket-relay/internal/storage"
)

// newTestServer builds a Server backed by a temp BoltDB and a
// test config, and returns the server + an httptest.Server
// wrapping its router. The httptest.Server is closed by t.Cleanup.
func newTestServer(t *testing.T) (*Server, *httptest.Server, *config.Config) {
	t.Helper()
	dir := t.TempDir()
	store, err := storage.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("storage.Open: %v", err)
	}
	t.Cleanup(func() { store.Close() })

	cfg := &config.Config{
		HTTPAddr:       ":0",
		APIKey:         "test-api-key-at-least-16-chars",
		DBPath:         ":memory:",
		CoalesceWindow: 30_000_000_000, // 30s
		MinCoalesceN:   3,
		APNs: config.APNsConfig{
			Enabled:     true,
			KeyID:       "ABCDE12345",
			TeamID:      "TEAM123456",
			KeyPath:     "/nonexistent",
			BundleID:    "de.quavon.uptimepocket",
			Environment: "sandbox",
		},
		FCM: config.FCMConfig{
			Enabled:           true,
			ServiceAccountPath: "/nonexistent",
			ProjectID:         "test-project",
		},
	}

	s := New(cfg, store, slog.New(slog.NewTextHandler(io.Discard, nil)))
	ts := httptest.NewServer(s.Router())
	t.Cleanup(ts.Close)
	return s, ts, cfg
}

func authed(t *testing.T, r *http.Request) {
	t.Helper()
	r.Header.Set("Authorization", "Bearer test-api-key-at-least-16-chars")
}

func TestHealth_NoAuth(t *testing.T) {
	_, ts, _ := newTestServer(t)
	resp, err := http.Get(ts.URL + "/v1/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["ok"] != true {
		t.Errorf("ok = %v, want true", body["ok"])
	}
}

func TestVersion(t *testing.T) {
	_, ts, _ := newTestServer(t)
	resp, err := http.Get(ts.URL + "/v1/version")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body map[string]string
	_ = json.NewDecoder(resp.Body).Decode(&body)
	if body["version"] == "" {
		t.Error("version should be non-empty")
	}
}

func TestRegisterDevice_RequiresAuth(t *testing.T) {
	_, ts, _ := newTestServer(t)
	resp, err := http.Post(ts.URL+"/v1/devices", "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestRegisterDevice_WrongToken(t *testing.T) {
	_, ts, _ := newTestServer(t)
	req, _ := http.NewRequest("POST", ts.URL+"/v1/devices", strings.NewReader("{}"))
	req.Header.Set("Authorization", "Bearer not-the-real-key")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestRegisterDevice_InvalidBody(t *testing.T) {
	_, ts, _ := newTestServer(t)
	cases := []struct {
		name string
		body string
	}{
		{"empty", "{}"},
		{"missing deviceId", `{"platform":"ios","pushToken":"x"}`},
		{"missing platform", `{"deviceId":"a","pushToken":"x"}`},
		{"bad platform", `{"deviceId":"a","platform":"web","pushToken":"x"}`},
		{"missing pushToken", `{"deviceId":"a","platform":"ios"}`},
		{"bad json", "not json"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req, _ := http.NewRequest("POST", ts.URL+"/v1/devices", strings.NewReader(c.body))
			authed(t, req)
			req.Header.Set("Content-Type", "application/json")
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", resp.StatusCode)
			}
		})
	}
}

func TestRegisterDevice_RoundTrip(t *testing.T) {
	s, ts, _ := newTestServer(t)
	body := RegisterRequest{
		DeviceID:  "ios-device-1",
		Platform:  storage.PlatformIOS,
		PushToken: "apns-token-abc",
		Servers: []storage.ServerRef{
			{ID: "", Label: "Prod", URL: "https://kuma.example.com"}, // ID auto-assigned
		},
		QuietHours: storage.QuietHours{Enabled: true, StartMinute: 22 * 60, EndMinute: 7 * 60},
		Locale:     "en",
	}
	buf, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", ts.URL+"/v1/devices", bytes.NewReader(buf))
	authed(t, req)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		t.Errorf("status = %d, body = %s", resp.StatusCode, body)
	}

	// Read it back
	rec, err := s.store.GetDevice("ios-device-1")
	if err != nil {
		t.Fatalf("GetDevice: %v", err)
	}
	if rec.PushToken != "apns-token-abc" {
		t.Errorf("PushToken = %q", rec.PushToken)
	}
	if len(rec.Servers) != 1 {
		t.Fatalf("len(Servers) = %d", len(rec.Servers))
	}
	if rec.Servers[0].ID == "" {
		t.Error("server ID should be auto-assigned")
	}
	if !strings.HasPrefix(rec.Servers[0].ID, "srv-") {
		t.Errorf("server ID = %q, want srv- prefix", rec.Servers[0].ID)
	}
	if !rec.QuietHours.Enabled {
		t.Error("QuietHours.Enabled was lost")
	}
}

func TestUnregisterDevice(t *testing.T) {
	s, ts, _ := newTestServer(t)

	// First, register
	body, _ := json.Marshal(RegisterRequest{
		DeviceID:  "d1",
		Platform:  storage.PlatformAndroid,
		PushToken: "fcm-tok",
	})
	req, _ := http.NewRequest("POST", ts.URL+"/v1/devices", bytes.NewReader(body))
	authed(t, req)
	req.Header.Set("Content-Type", "application/json")
	resp, _ := http.DefaultClient.Do(req)
	resp.Body.Close()

	// Then unregister
	req, _ = http.NewRequest("DELETE", ts.URL+"/v1/devices", strings.NewReader(`{"deviceId":"d1"}`))
	authed(t, req)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("status = %d, want 204", resp.StatusCode)
	}

	_, err = s.store.GetDevice("d1")
	if err != storage.ErrNotFound {
		t.Errorf("after unregister: got %v, want ErrNotFound", err)
	}
}

func TestUnregisterDevice_RequiresDeviceID(t *testing.T) {
	_, ts, _ := newTestServer(t)
	req, _ := http.NewRequest("DELETE", ts.URL+"/v1/devices", strings.NewReader(`{}`))
	authed(t, req)
	req.Header.Set("Content-Type", "application/json")
	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestRegisterDevice_PlatformNotConfigured(t *testing.T) {
	// Test config has BOTH APNs and FCM enabled. Build a server
	// with FCM disabled to assert the 503.
	dir := t.TempDir()
	store, _ := storage.Open(filepath.Join(dir, "test.db"))
	defer store.Close()
	cfg := &config.Config{
		APIKey:         "test-api-key-at-least-16-chars",
		CoalesceWindow: 30_000_000_000,
		MinCoalesceN:   3,
		APNs:           config.APNsConfig{Enabled: true},
		// FCM: not enabled
	}
	s := New(cfg, store, slog.New(slog.NewTextHandler(io.Discard, nil)))
	ts := httptest.NewServer(s.Router())
	defer ts.Close()

	body, _ := json.Marshal(RegisterRequest{
		DeviceID:  "d1",
		Platform:  storage.PlatformAndroid,
		PushToken: "x",
	})
	req, _ := http.NewRequest("POST", ts.URL+"/v1/devices", bytes.NewReader(body))
	authed(t, req)
	req.Header.Set("Content-Type", "application/json")
	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", resp.StatusCode)
	}
}
