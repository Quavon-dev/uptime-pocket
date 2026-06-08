// Package kuma provides the relay's view of a Uptime Kuma
// instance. We use Prometheus metrics scraping as the source
// of truth: every Kuma instance exposes /metrics with one
// line per monitor.
//
// Why Prometheus, not socket.io?
//
//   - It's the most stable API surface in Kuma. The socket
//     protocol has changed twice in the last 2 years; the
//     metrics endpoint has been stable since 1.13.
//   - It works behind reverse proxies and Cloudflare without
//     WebSocket upgrade headers.
//   - It supports bearer-token auth (just a header).
//   - The relay doesn't need real-time sub-second updates.
//     10s polling is fine for "the service is down" alerts —
//     a few seconds of latency is acceptable.
//
// Trade-off: we lose access to per-heartbeat messages
// ("HTTP 200", "timeout", "TLS error"). For v1.0 we
// deliberately don't include the per-heartbeat msg in the
// push — the user gets "{monitor} is down", not the technical
// reason. This is intentional; we can add a /metrics line for
// "last message" in v1.1.
package kuma

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/quavon-dev/uptime-pocket-relay/internal/status"
)

// MonitorSnapshot is one row of the metrics scrape, plus the
// relay-side monitor ID we assign for stable identification.
type MonitorSnapshot struct {
	ServerID    string // the relay-assigned ID for this Kuma instance
	MonitorID   int    // Kuma's numeric monitor ID
	MonitorName string
	MonitorType string
	Status      status.Status
}

// Watcher is a long-lived poller for one Kuma instance. Create
// one per server; the caller invokes Start() to begin polling
// and Stop() to shut it down. Snapshots are pushed onto Snapshots.
type Watcher struct {
	URL       string
	Bearer    string
	ServerID  string
	Interval  time.Duration
	HTTPClient *http.Client

	// Snapshots receives a snapshot after every successful
	// scrape. The caller is expected to read from it
	// promptly; we use a buffered channel of size 1 so a slow
	// consumer doesn't block the poller (we drop the latest
	// snapshot and emit the next one).
	Snapshots chan []MonitorSnapshot

	// Logger is called on every error. Optional; defaults
	// to a no-op.
	Logger func(format string, args ...any)

	// Clock lets tests fake time. Defaults to time.Now.
	Clock func() time.Time

	stopCh chan struct{}
	doneCh chan struct{}
	once   sync.Once
}

// NewWatcher validates inputs and returns a ready-to-Start
// watcher. The caller must call Start in a goroutine.
func NewWatcher(serverID, url, bearer string) *Watcher {
	return &Watcher{
		URL:        url,
		Bearer:     bearer,
		ServerID:   serverID,
		Interval:   10 * time.Second,
		HTTPClient: &http.Client{Timeout: 15 * time.Second},
		Snapshots:  make(chan []MonitorSnapshot, 1),
		stopCh:     make(chan struct{}),
		doneCh:     make(chan struct{}),
	}
}

func (w *Watcher) log(format string, args ...any) {
	if w.Logger != nil {
		w.Logger(format, args...)
	}
}

// Start begins polling. Returns immediately; the watcher runs
// until Stop is called. The first scrape happens after one
// Interval (not immediately) so a tight Start-Stop cycle
// doesn't fire a redundant request.
func (w *Watcher) Start(ctx context.Context) {
	defer close(w.doneCh)
	t := time.NewTicker(w.Interval)
	defer t.Stop()

	// First tick: scrape now, but don't block on send.
	if snaps, err := w.scrape(ctx); err == nil {
		w.trySend(snaps)
	} else {
		w.log("kuma %s: initial scrape failed: %v", w.ServerID, err)
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-w.stopCh:
			return
		case <-t.C:
			snaps, err := w.scrape(ctx)
			if err != nil {
				w.log("kuma %s: scrape failed: %v", w.ServerID, err)
				continue
			}
			w.trySend(snaps)
		}
	}
}

// Stop signals the watcher to exit. Safe to call multiple times.
// Blocks until the watcher has actually exited.
func (w *Watcher) Stop() {
	w.once.Do(func() { close(w.stopCh) })
	<-w.doneCh
}

func (w *Watcher) trySend(snaps []MonitorSnapshot) {
	select {
	case w.Snapshots <- snaps:
	default:
		// Consumer is slow; drop the snapshot. Better to
		// miss one tick than to back up the poller. The
		// next tick will fill in.
		w.log("kuma %s: snapshot channel full, dropping", w.ServerID)
	}
}

// scrape does one HTTP GET to /metrics and parses the result.
// Returns the parsed snapshot, or an error.
func (w *Watcher) scrape(ctx context.Context) ([]MonitorSnapshot, error) {
	url := strings.TrimRight(w.URL, "/") + "/metrics"
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	if w.Bearer != "" {
		req.Header.Set("Authorization", "Bearer "+w.Bearer)
	}
	resp, err := w.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("kuma %s: auth failed (%d)", w.ServerID, resp.StatusCode)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("kuma %s: status=%d", w.ServerID, resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	return parseMetrics(w.ServerID, string(body)), nil
}

// parseMetrics extracts the per-monitor status from a /metrics
// body. The shape we parse is:
//
//   uptime_kuma_monitor_up{...labels...} 1
//   uptime_kuma_monitor_down{...} 0
//   uptime_kuma_monitor_maintenance{...} 0
//
// Older Kuma versions (<=1.23) used a single combined line
// with a "status" label. We handle both for compatibility.
func parseMetrics(serverID, body string) []MonitorSnapshot {
	var out []MonitorSnapshot
	seen := make(map[int]*MonitorSnapshot)

	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		// The format is:
		//   metric_name{labels} value
		open := strings.IndexByte(line, '{')
		var labels map[string]string
		var name string
		var value string
		if open >= 0 {
			name = line[:open]
			close := strings.IndexByte(line[open:], '}')
			if close < 0 {
				continue
			}
			labels = parseLabels(line[open+1 : open+close])
			value = strings.TrimSpace(line[open+close+1:])
		} else {
			// No labels (unlikely for our metrics, but
			// handle it for completeness).
			parts := strings.Fields(line)
			if len(parts) != 2 {
				continue
			}
			name, value = parts[0], parts[1]
		}

		// We only care about the per-monitor status lines.
		var s status.Status
		var isLegacy bool
		switch name {
		case "uptime_kuma_monitor_up":
			s = status.StatusUp
		case "uptime_kuma_monitor_down":
			s = status.StatusDown
		case "uptime_kuma_monitor_maintenance":
			s = status.StatusMaintenance
		case "uptime_kuma_monitor_pending":
			s = status.StatusPending
		case "uptime_kuma_monitor_paused":
			s = status.StatusPaused
		case "monitor_status":
			// Legacy combined metric; the value IS the
			// status code (0=pending, 1=up, 2=down, 3=maintenance).
			// Don't apply the "value must be 1" filter below
			// because every code is meaningful here.
			isLegacy = true
			code, err := strconv.Atoi(value)
			if err != nil {
				continue
			}
			switch code {
			case 0:
				s = status.StatusPending
			case 1:
				s = status.StatusUp
			case 2:
				s = status.StatusDown
			case 3:
				s = status.StatusMaintenance
			default:
				continue
			}
		default:
			continue
		}

		// For the modern multi-metric format, only emit a
		// row if the metric value is 1 (i.e. this monitor
		// IS in this state). The Kuma /metrics exposes all
		// states per monitor with 0/1 values; the 0s are
		// noise. The legacy combined format (above) uses
		// the value as a status code and must NOT be
		// filtered this way.
		if !isLegacy && value != "1" {
			continue
		}

		monitorIDStr := labels["monitor_id"]
		if monitorIDStr == "" {
			continue
		}
		monitorID, err := strconv.Atoi(monitorIDStr)
		if err != nil {
			continue
		}
		monitorName := labels["monitor_name"]
		if monitorName == "" {
			monitorName = labels["monitor"]
		}
		if monitorName == "" {
			monitorName = "Monitor " + monitorIDStr
		}
		monitorType := labels["monitor_type"]
		if monitorType == "" {
			monitorType = labels["type"]
		}

		// If we've already seen this monitor (e.g. we hit
		// `uptime_kuma_monitor_up` AND `_down` for the same
		// id, which would indicate a Kuma bug or a race
		// during the scrape), the LAST write wins. We
		// process lines in order, so a later `up` after
		// `down` would overwrite. The metrics file is
		// normally consistent so this is just defensive.
		if existing, ok := seen[monitorID]; ok {
			existing.Status = s
		} else {
			snap := MonitorSnapshot{
				ServerID:    serverID,
				MonitorID:   monitorID,
				MonitorName: monitorName,
				MonitorType: monitorType,
				Status:      s,
			}
			seen[monitorID] = &snap
			out = append(out, snap)
		}
	}
	return out
}

// parseLabels parses the `k=v,k2=v2` portion of a Prometheus
// line. Quoted values are handled; commas inside quotes don't
// split the label set.
func parseLabels(s string) map[string]string {
	out := make(map[string]string)
	i := 0
	for i < len(s) {
		// Skip leading whitespace
		for i < len(s) && (s[i] == ' ' || s[i] == ',') {
			i++
		}
		if i >= len(s) {
			break
		}
		// Read key
		keyStart := i
		for i < len(s) && s[i] != '=' && s[i] != ',' {
			i++
		}
		if i >= len(s) || s[i] != '=' {
			break
		}
		key := strings.TrimSpace(s[keyStart:i])
		i++ // skip '='
		// Read value (possibly quoted)
		if i < len(s) && s[i] == '"' {
			i++ // skip opening quote
			valStart := i
			for i < len(s) && s[i] != '"' {
				if s[i] == '\\' && i+1 < len(s) {
					i += 2
					continue
				}
				i++
			}
			val := s[valStart:i]
			out[key] = strings.ReplaceAll(strings.ReplaceAll(val, `\"`, `"`), `\\`, `\`)
			if i < len(s) {
				i++ // skip closing quote
			}
		} else {
			valStart := i
			for i < len(s) && s[i] != ',' {
				i++
			}
			out[key] = strings.TrimSpace(s[valStart:i])
		}
	}
	return out
}

// ErrNoTransitions is returned by Diff() when the snapshot is
// identical to the previous state.
var ErrNoTransitions = errors.New("kuma: no transitions")
