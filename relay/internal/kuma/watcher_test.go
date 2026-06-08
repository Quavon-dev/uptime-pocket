package kuma

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/quavon-dev/uptime-pocket-relay/internal/status"
)

func TestParseMetrics_Basic(t *testing.T) {
	body := `# HELP uptime_kuma_monitor_up 1 if up, 0 if down
# TYPE uptime_kuma_monitor_up gauge
uptime_kuma_monitor_up{monitor_id="1",monitor_name="API",monitor_type="http"} 1
uptime_kuma_monitor_up{monitor_id="2",monitor_name="Web",monitor_type="http"} 0
uptime_kuma_monitor_down{monitor_id="1",monitor_name="API",monitor_type="http"} 0
uptime_kuma_monitor_down{monitor_id="2",monitor_name="Web",monitor_type="http"} 1
# Another metric, unrelated
go_goroutines 42
`
	snaps := parseMetrics("k1", body)
	if len(snaps) != 2 {
		t.Fatalf("got %d snapshots, want 2", len(snaps))
	}
	// Build a map for easy lookup
	byID := make(map[int]MonitorSnapshot)
	for _, s := range snaps {
		byID[s.MonitorID] = s
	}
	if byID[1].Status != status.StatusUp {
		t.Errorf("monitor 1: status = %q, want up", byID[1].Status)
	}
	if byID[1].MonitorName != "API" {
		t.Errorf("monitor 1: name = %q, want API", byID[1].MonitorName)
	}
	if byID[1].MonitorType != "http" {
		t.Errorf("monitor 1: type = %q, want http", byID[1].MonitorType)
	}
	if byID[2].Status != status.StatusDown {
		t.Errorf("monitor 2: status = %q, want down", byID[2].Status)
	}
}

func TestParseMetrics_LegacyFormat(t *testing.T) {
	// Kuma 1.x exposed a single combined metric
	body := `monitor_status{monitor_id="1",monitor_name="API"} 2
monitor_status{monitor_id="2",monitor_name="Web"} 1
monitor_status{monitor_id="3",monitor_name="DB"} 0
`
	snaps := parseMetrics("k1", body)
	if len(snaps) != 3 {
		t.Fatalf("got %d, want 3", len(snaps))
	}
	want := map[int]status.Status{
		1: status.StatusDown,
		2: status.StatusUp,
		3: status.StatusPending,
	}
	for _, s := range snaps {
		if s.Status != want[s.MonitorID] {
			t.Errorf("monitor %d: got %q, want %q", s.MonitorID, s.Status, want[s.MonitorID])
		}
	}
}

func TestParseMetrics_MaintenanceAndPaused(t *testing.T) {
	body := `uptime_kuma_monitor_up{monitor_id="1",monitor_name="A"} 0
uptime_kuma_monitor_down{monitor_id="1",monitor_name="A"} 0
uptime_kuma_monitor_maintenance{monitor_id="1",monitor_name="A"} 1
uptime_kuma_monitor_paused{monitor_id="2",monitor_name="B"} 1
`
	snaps := parseMetrics("k1", body)
	if len(snaps) != 2 {
		t.Fatalf("got %d, want 2", len(snaps))
	}
	byID := map[int]MonitorSnapshot{}
	for _, s := range snaps {
		byID[s.MonitorID] = s
	}
	if byID[1].Status != status.StatusMaintenance {
		t.Errorf("1: got %q, want maintenance", byID[1].Status)
	}
	if byID[2].Status != status.StatusPaused {
		t.Errorf("2: got %q, want paused", byID[2].Status)
	}
}

func TestParseMetrics_QuotedLabels(t *testing.T) {
	body := `uptime_kuma_monitor_up{monitor_id="1",monitor_name="My, API",monitor_type="http"} 1`
	snaps := parseMetrics("k1", body)
	if len(snaps) != 1 {
		t.Fatalf("got %d, want 1", len(snaps))
	}
	if snaps[0].MonitorName != "My, API" {
		t.Errorf("MonitorName = %q, want 'My, API'", snaps[0].MonitorName)
	}
}

func TestWatcher_PollsAndSendsSnapshots(t *testing.T) {
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, `uptime_kuma_monitor_up{monitor_id="1",monitor_name="API"} 1
`)
	}))
	defer srv.Close()

	w := NewWatcher("k1", srv.URL, "")
	w.Interval = 50 * time.Millisecond

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go w.Start(ctx)

	// Wait for at least 2 snapshots
	deadline := time.After(2 * time.Second)
	count := 0
	for {
		select {
		case snap := <-w.Snapshots:
			count++
			if len(snap) != 1 || snap[0].MonitorName != "API" {
				t.Errorf("unexpected snapshot: %+v", snap)
			}
			if count >= 2 {
				w.Stop()
				if atomic.LoadInt32(&hits) < 2 {
					t.Errorf("server hits = %d, want >= 2", hits)
				}
				return
			}
		case <-deadline:
			t.Fatalf("timed out waiting for snapshots (count=%d, hits=%d)", count, atomic.LoadInt32(&hits))
		}
	}
}

func TestWatcher_AuthHeader(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		fmt.Fprint(w, "# empty")
	}))
	defer srv.Close()

	w := NewWatcher("k1", srv.URL, "secret-token-12345")
	w.Interval = 50 * time.Millisecond

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go w.Start(ctx)

	select {
	case <-w.Snapshots:
	case <-time.After(2 * time.Second):
		t.Fatal("timeout")
	}
	w.Stop()
	if gotAuth != "Bearer secret-token-12345" {
		t.Errorf("Authorization = %q, want Bearer", gotAuth)
	}
}

func TestWatcher_AuthFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusUnauthorized)
	}))
	defer srv.Close()

	w := NewWatcher("k1", srv.URL, "wrong")
	w.Interval = 50 * time.Millisecond

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go w.Start(ctx)

	// We should get NO snapshots because the server returns
	// 401. Wait long enough for one scrape cycle.
	select {
	case snap := <-w.Snapshots:
		t.Errorf("got snapshot on auth failure: %+v", snap)
	case <-time.After(300 * time.Millisecond):
		// expected
	}
	w.Stop()
}

func TestWatcher_StopIsIdempotent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "# nothing")
	}))
	defer srv.Close()

	w := NewWatcher("k1", srv.URL, "")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go w.Start(ctx)
	w.Stop()
	// Calling Stop again should not deadlock or panic.
	done := make(chan struct{})
	go func() {
		w.Stop()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(1 * time.Second):
		t.Fatal("second Stop() hung")
	}
}

func TestWatcher_SlowConsumerDropsSnapshots(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `uptime_kuma_monitor_up{monitor_id="1",monitor_name="X"} 1`)
	}))
	defer srv.Close()

	w := NewWatcher("k1", srv.URL, "")
	w.Interval = 30 * time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go w.Start(ctx)

	// Don't read from Snapshots. The poller should keep running
	// and never block. Wait a bit and assert no panic.
	time.Sleep(200 * time.Millisecond)
	w.Stop()
}
