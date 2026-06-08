// Package storage persists relay state to BoltDB. The schema
// is two buckets:
//
//   devices (key: deviceId)         -> DeviceRecord
//   states  (key: serverId|monitorId) -> MonitorState
//   events  (key: auto-increment)   -> CoalesceEvent (rolling window)
//
// All reads and writes are atomic via Bolt's Update/View
// transactions. We never hold a transaction across a network
// call (no APNs/FCM inside Update).
package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	bolt "go.etcd.io/bbolt"
)

// ErrNotFound is returned when a key isn't in the bucket. Callers
// can use errors.Is(err, ErrNotFound) to distinguish missing from
// other errors.
var ErrNotFound = errors.New("storage: not found")

// Platform is the device's push platform. "ios" goes through
// APNs, "android" goes through FCM.
type Platform string

const (
	PlatformIOS     Platform = "ios"
	PlatformAndroid Platform = "android"
)

// QuietHours mirrors the app-side settings shape. Minutes-from-
// midnight. The relay honors these on the server side so the
// app doesn't have to be alive to mute notifications.
type QuietHours struct {
	Enabled     bool `json:"enabled"`
	StartMinute int  `json:"startMinute"`
	EndMinute   int  `json:"endMinute"`
}

// ServerRef identifies a Kuma instance the device wants push
// notifications for. Multiple per device are allowed.
type ServerRef struct {
	ID    string `json:"id"`    // relay-assigned, stable across restarts
	Label string `json:"label"` // user-friendly: "Prod", "Staging"
	URL   string `json:"url"`   // https://kuma.example.com
}

// DeviceRecord is one registered device. We store the push token
// here; it's the only secret-like thing in the relay. The relay
// never returns a device record via the public API.
type DeviceRecord struct {
	DeviceID    string      `json:"deviceId"`
	Platform    Platform    `json:"platform"`
	PushToken   string      `json:"pushToken"`
	Servers     []ServerRef `json:"servers"`
	QuietHours  QuietHours  `json:"quietHours"`
	Locale      string      `json:"locale"`
	CreatedAt   time.Time   `json:"createdAt"`
	UpdatedAt   time.Time   `json:"updatedAt"`
}

// MonitorState is the last-known status of one monitor on one
// Kuma instance. The relay diffs new heartbeats against this
// to detect transitions.
type MonitorState struct {
	ServerID    string    `json:"serverId"`
	MonitorID   int       `json:"monitorId"`
	MonitorName string    `json:"monitorName"`
	Status      string    `json:"status"`
	LastBeat    time.Time `json:"lastBeat"`
}

// CoalesceEvent is one transition that happened in the recent
// window. We keep a rolling buffer (default: last 5 minutes) so
// the coalesce engine can answer "did 3+ transitions happen
// within 30s?". Events auto-expire.
type CoalesceEvent struct {
	ServerID    string    `json:"serverId"`
	MonitorName string    `json:"monitorName"`
	FromStatus  string    `json:"fromStatus"`
	ToStatus    string    `json:"toStatus"`
	OccurredAt  time.Time `json:"occurredAt"`
}

const (
	bucketDevices = "devices"
	bucketStates  = "states"
	bucketEvents  = "events"

	// Keep the rolling event window long enough that the longest
	// coalesce window still has all the data it needs. We do
	// cleanup on every read of GetRecentEvents.
	eventRetention = 5 * time.Minute
)

// Store is the BoltDB-backed storage. It is safe for concurrent
// use — Bolt serializes writes through a single RWMutex, and
// reads use a shared lock.
type Store struct {
	db *bolt.DB
}

// Open opens (or creates) the BoltDB file at path and ensures
// all expected buckets exist.
func Open(path string) (*Store, error) {
	db, err := bolt.Open(path, 0600, &bolt.Options{Timeout: 5 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("storage: open: %w", err)
	}
	if err := db.Update(func(tx *bolt.Tx) error {
		for _, b := range []string{bucketDevices, bucketStates, bucketEvents} {
			if _, err := tx.CreateBucketIfNotExists([]byte(b)); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("storage: init buckets: %w", err)
	}
	return &Store{db: db}, nil
}

// Close releases the underlying file lock. Safe to call multiple
// times; subsequent calls are no-ops.
func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

// --- Device CRUD ---

// PutDevice upserts a device. The UpdatedAt field is set to now
// (overwriting whatever the caller set).
func (s *Store) PutDevice(d DeviceRecord) error {
	if d.DeviceID == "" {
		return errors.New("storage: DeviceID is required")
	}
	if d.Platform != PlatformIOS && d.Platform != PlatformAndroid {
		return fmt.Errorf("storage: invalid platform %q", d.Platform)
	}
	if d.PushToken == "" {
		return errors.New("storage: PushToken is required")
	}
	d.UpdatedAt = time.Now().UTC()
	if d.CreatedAt.IsZero() {
		d.CreatedAt = d.UpdatedAt
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketDevices))
		buf, err := json.Marshal(d)
		if err != nil {
			return err
		}
		return b.Put([]byte(d.DeviceID), buf)
	})
}

// GetDevice returns the device with the given ID, or ErrNotFound.
func (s *Store) GetDevice(id string) (DeviceRecord, error) {
	var d DeviceRecord
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketDevices))
		raw := b.Get([]byte(id))
		if raw == nil {
			return ErrNotFound
		}
		return json.Unmarshal(raw, &d)
	})
	return d, err
}

// DeleteDevice removes a device. Idempotent: deleting a missing
// device is a no-op.
func (s *Store) DeleteDevice(id string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketDevices))
		return b.Delete([]byte(id))
	})
}

// ListDevices returns every registered device. Order is not
// guaranteed; sort by CreatedAt in the caller if you need it.
func (s *Store) ListDevices() ([]DeviceRecord, error) {
	var out []DeviceRecord
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketDevices))
		return b.ForEach(func(_, v []byte) error {
			var d DeviceRecord
			if err := json.Unmarshal(v, &d); err != nil {
				return err
			}
			out = append(out, d)
			return nil
		})
	})
	return out, err
}

// DevicesForServer returns all devices that have subscribed to
// the given server. O(N) over devices; with a few hundred devices
// this is fine. If we ever need to scale, add a per-server index.
func (s *Store) DevicesForServer(serverID string) ([]DeviceRecord, error) {
	all, err := s.ListDevices()
	if err != nil {
		return nil, err
	}
	out := make([]DeviceRecord, 0, len(all))
	for _, d := range all {
		for _, srv := range d.Servers {
			if srv.ID == serverID {
				out = append(out, d)
				break
			}
		}
	}
	return out, nil
}

// --- Monitor state ---

func stateKey(serverID string, monitorID int) string {
	return serverID + "|" + fmt.Sprintf("%d", monitorID)
}

// GetState returns the last-known state for a monitor, or
// ErrNotFound if we've never seen it.
func (s *Store) GetState(serverID string, monitorID int) (MonitorState, error) {
	var st MonitorState
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketStates))
		raw := b.Get([]byte(stateKey(serverID, monitorID)))
		if raw == nil {
			return ErrNotFound
		}
		return json.Unmarshal(raw, &st)
	})
	return st, err
}

// PutState upserts the state. The relay calls this on every
// heartbeat, even non-transitioning ones, so the cache is
// always fresh.
func (s *Store) PutState(st MonitorState) error {
	if st.ServerID == "" || st.MonitorID == 0 {
		return errors.New("storage: ServerID and MonitorID are required")
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketStates))
		buf, err := json.Marshal(st)
		if err != nil {
			return err
		}
		return b.Put([]byte(stateKey(st.ServerID, st.MonitorID)), buf)
	})
}

// ListStates returns all stored states. Used at startup to
// repopulate the in-memory diff engine after a restart.
func (s *Store) ListStates() ([]MonitorState, error) {
	var out []MonitorState
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketStates))
		return b.ForEach(func(_, v []byte) error {
			var st MonitorState
			if err := json.Unmarshal(v, &st); err != nil {
				return err
			}
			out = append(out, st)
			return nil
		})
	})
	return out, err
}

// --- Coalesce event window ---

// RecordEvent appends an event to the rolling window.
func (s *Store) RecordEvent(ev CoalesceEvent) error {
	if ev.OccurredAt.IsZero() {
		ev.OccurredAt = time.Now().UTC()
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketEvents))
		// Use the timestamp + a server|monitor suffix to keep
		// ordering stable. BoltDB keys are sorted lexicographically,
		// so a Unix-nanos prefix gives us chronological order.
		key := []byte(fmt.Sprintf("%d|%s|%s", ev.OccurredAt.UnixNano(), ev.ServerID, ev.MonitorName))
		buf, err := json.Marshal(ev)
		if err != nil {
			return err
		}
		return b.Put(key, buf)
	})
}

// GetRecentEvents returns all events in the last `window`, plus
// opportunistically prunes anything older than eventRetention.
// This is the only place that does cleanup — every read gets a
// fresh view and pays the cost.
func (s *Store) GetRecentEvents(window time.Duration) ([]CoalesceEvent, error) {
	cutoff := time.Now().UTC().Add(-window)
	pruneCutoff := time.Now().UTC().Add(-eventRetention)
	var out []CoalesceEvent

	err := s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketEvents))
		// Walk with a cursor so we can delete during iteration.
		// Bolt's docs explicitly say this is safe inside Update.
		c := b.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			// Key format: <nanos>|<serverId>|<monitorName>.
			// The prefix is the timestamp.
			bar := strings.IndexByte(string(k), '|')
			if bar < 0 {
				// Malformed key — drop it and move on.
				c.Delete()
				continue
			}
			var nanos int64
			if _, err := fmt.Sscanf(string(k[:bar]), "%d", &nanos); err != nil {
				c.Delete()
				continue
			}
			ts := time.Unix(0, nanos)
			if ts.Before(pruneCutoff) {
				c.Delete()
				continue
			}
			if !ts.Before(cutoff) {
				var ev CoalesceEvent
				if err := json.Unmarshal(v, &ev); err != nil {
					// Don't delete malformed events on a read; an
					// operator can inspect them. Just skip.
					continue
				}
				out = append(out, ev)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	// Sort by OccurredAt ascending. We don't rely on Bolt key
	// order because of the |server|monitor suffix collisions
	// within the same nanosecond (rare but possible).
	sort.Slice(out, func(i, j int) bool {
		return out[i].OccurredAt.Before(out[j].OccurredAt)
	})
	return out, nil
}

// --- Stats (used by healthcheck) ---

// Stats is a snapshot of the relay's storage state, returned by
// the /v1/health endpoint so an operator can see at a glance how
// many devices and monitors are tracked.
type Stats struct {
	DeviceCount   int   `json:"deviceCount"`
	StateCount    int   `json:"stateCount"`
	EventCount    int   `json:"eventCount"`
	OldestEventAt int64 `json:"oldestEventAt"` // unix millis, 0 if none
}

// Stats returns a snapshot of the storage state. The counts are
// computed in a single View transaction for consistency.
func (s *Store) Stats() (Stats, error) {
	var st Stats
	err := s.db.View(func(tx *bolt.Tx) error {
		devices := tx.Bucket([]byte(bucketDevices))
		states := tx.Bucket([]byte(bucketStates))
		events := tx.Bucket([]byte(bucketEvents))

		// For event count + oldest timestamp, we walk events once.
		var oldest int64
		events.ForEach(func(k, _ []byte) error {
			bar := strings.IndexByte(string(k), '|')
			if bar > 0 {
				var nanos int64
				fmt.Sscanf(string(k[:bar]), "%d", &nanos)
				if oldest == 0 || nanos < oldest {
					oldest = nanos
				}
			}
			return nil
		})

		st.DeviceCount = devices.Stats().KeyN
		st.StateCount = states.Stats().KeyN
		st.EventCount = events.Stats().KeyN
		st.OldestEventAt = oldest / int64(time.Millisecond)
		return nil
	})
	return st, err
}

// --- internals ---

// (no package-level locks; Bolt serializes writes.)
