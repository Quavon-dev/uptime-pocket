package storage

import (
	"path/filepath"
	"sort"
	"testing"
	"time"
)

// newTestStore opens a BoltDB at a temp file path, returning
// the store + a cleanup func.
func newTestStore(t *testing.T) (*Store, func()) {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "test.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	return s, func() { s.Close() }
}

func TestDeviceCRUD(t *testing.T) {
	s, cleanup := newTestStore(t)
	defer cleanup()

	d := DeviceRecord{
		DeviceID:  "ios-1",
		Platform:  PlatformIOS,
		PushToken: "apns-token-abc",
		Servers: []ServerRef{
			{ID: "kuma-a", Label: "Prod", URL: "https://kuma.example.com"},
		},
		QuietHours: QuietHours{Enabled: true, StartMinute: 22 * 60, EndMinute: 7 * 60},
		Locale:     "en",
	}
	if err := s.PutDevice(d); err != nil {
		t.Fatalf("PutDevice: %v", err)
	}

	got, err := s.GetDevice("ios-1")
	if err != nil {
		t.Fatalf("GetDevice: %v", err)
	}
	if got.PushToken != d.PushToken {
		t.Errorf("PushToken = %q, want %q", got.PushToken, d.PushToken)
	}
	if len(got.Servers) != 1 || got.Servers[0].ID != "kuma-a" {
		t.Errorf("Servers = %+v, want one server kuma-a", got.Servers)
	}
	if !got.UpdatedAt.After(time.Time{}) {
		t.Error("UpdatedAt should be set by PutDevice")
	}

	// Round-trip: second write with different locale should
	// preserve all other fields.
	d.Locale = "de"
	if err := s.PutDevice(d); err != nil {
		t.Fatalf("PutDevice round-trip: %v", err)
	}
	got, _ = s.GetDevice("ios-1")
	if got.Locale != "de" {
		t.Errorf("Locale = %q, want de", got.Locale)
	}
	if len(got.Servers) != 1 {
		t.Errorf("Servers was wiped on round-trip")
	}

	// Missing device
	_, err = s.GetDevice("does-not-exist")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}

	// Delete
	if err := s.DeleteDevice("ios-1"); err != nil {
		t.Fatalf("DeleteDevice: %v", err)
	}
	_, err = s.GetDevice("ios-1")
	if err != ErrNotFound {
		t.Errorf("after delete: expected ErrNotFound, got %v", err)
	}
}

func TestPutDevice_ValidationErrors(t *testing.T) {
	s, cleanup := newTestStore(t)
	defer cleanup()

	cases := []struct {
		name string
		d    DeviceRecord
	}{
		{"missing id", DeviceRecord{Platform: PlatformIOS, PushToken: "x"}},
		{"missing platform", DeviceRecord{DeviceID: "x", PushToken: "x"}},
		{"missing token", DeviceRecord{DeviceID: "x", Platform: PlatformIOS}},
		{"bad platform", DeviceRecord{DeviceID: "x", Platform: "web", PushToken: "x"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if err := s.PutDevice(c.d); err == nil {
				t.Error("expected error, got nil")
			}
		})
	}
}

func TestListAndFilterDevices(t *testing.T) {
	s, cleanup := newTestStore(t)
	defer cleanup()

	devices := []DeviceRecord{
		{DeviceID: "a", Platform: PlatformIOS, PushToken: "t", Servers: []ServerRef{{ID: "kuma-1"}}},
		{DeviceID: "b", Platform: PlatformAndroid, PushToken: "t", Servers: []ServerRef{{ID: "kuma-1"}, {ID: "kuma-2"}}},
		{DeviceID: "c", Platform: PlatformIOS, PushToken: "t", Servers: []ServerRef{{ID: "kuma-2"}}},
	}
	for _, d := range devices {
		if err := s.PutDevice(d); err != nil {
			t.Fatalf("PutDevice: %v", err)
		}
	}

	all, err := s.ListDevices()
	if err != nil {
		t.Fatalf("ListDevices: %v", err)
	}
	if len(all) != 3 {
		t.Errorf("ListDevices returned %d, want 3", len(all))
	}

	got1, err := s.DevicesForServer("kuma-1")
	if err != nil {
		t.Fatalf("DevicesForServer: %v", err)
	}
	// a and b subscribe to kuma-1
	ids := []string{got1[0].DeviceID, got1[1].DeviceID}
	sort.Strings(ids)
	want := []string{"a", "b"}
	if !equalStrings(ids, want) {
		t.Errorf("DevicesForServer(kuma-1) = %v, want %v", ids, want)
	}

	got2, _ := s.DevicesForServer("kuma-2")
	if len(got2) != 2 {
		t.Errorf("DevicesForServer(kuma-2) returned %d, want 2", len(got2))
	}
}

func TestStateCRUD(t *testing.T) {
	s, cleanup := newTestStore(t)
	defer cleanup()

	// Get on empty
	_, err := s.GetState("k1", 7)
	if err != ErrNotFound {
		t.Errorf("GetState on empty: want ErrNotFound, got %v", err)
	}

	st := MonitorState{
		ServerID:    "k1",
		MonitorID:   7,
		MonitorName: "API",
		Status:      "up",
		LastBeat:    time.Now(),
	}
	if err := s.PutState(st); err != nil {
		t.Fatalf("PutState: %v", err)
	}
	got, _ := s.GetState("k1", 7)
	if got.MonitorName != "API" {
		t.Errorf("MonitorName = %q, want API", got.MonitorName)
	}

	// Different (server, monitor) pair should not collide
	st2 := st
	st2.MonitorID = 8
	if err := s.PutState(st2); err != nil {
		t.Fatalf("PutState 2: %v", err)
	}
	all, _ := s.ListStates()
	if len(all) != 2 {
		t.Errorf("ListStates returned %d, want 2", len(all))
	}
}

func TestCoalesceEvents(t *testing.T) {
	s, cleanup := newTestStore(t)
	defer cleanup()

	now := time.Now().UTC()
	// 4 events in last 10s, 1 event at -5min (should be pruned on read)
	events := []CoalesceEvent{
		{ServerID: "k1", MonitorName: "A", FromStatus: "up", ToStatus: "down", OccurredAt: now.Add(-9 * time.Second)},
		{ServerID: "k1", MonitorName: "B", FromStatus: "up", ToStatus: "down", OccurredAt: now.Add(-8 * time.Second)},
		{ServerID: "k1", MonitorName: "C", FromStatus: "up", ToStatus: "down", OccurredAt: now.Add(-7 * time.Second)},
		{ServerID: "k1", MonitorName: "D", FromStatus: "up", ToStatus: "down", OccurredAt: now.Add(-6 * time.Second)},
		{ServerID: "k1", MonitorName: "E", FromStatus: "up", ToStatus: "down", OccurredAt: now.Add(-5 * time.Minute)},
	}
	for _, ev := range events {
		if err := s.RecordEvent(ev); err != nil {
			t.Fatalf("RecordEvent: %v", err)
		}
	}

	// Read with window=30s: should get the 4 recent, prune the 5min-old
	got, err := s.GetRecentEvents(30 * time.Second)
	if err != nil {
		t.Fatalf("GetRecentEvents: %v", err)
	}
	if len(got) != 4 {
		t.Errorf("GetRecentEvents returned %d, want 4 (the 5min-old one should be pruned)", len(got))
	}

	// Read again: prune happened, so the count should stay at 4
	got2, _ := s.GetRecentEvents(30 * time.Second)
	if len(got2) != 4 {
		t.Errorf("second read returned %d, want 4", len(got2))
	}
}

func TestStats(t *testing.T) {
	s, cleanup := newTestStore(t)
	defer cleanup()

	// Empty
	st, _ := s.Stats()
	if st.DeviceCount != 0 || st.StateCount != 0 || st.EventCount != 0 {
		t.Errorf("empty store stats: %+v", st)
	}

	// Add stuff
	_ = s.PutDevice(DeviceRecord{DeviceID: "a", Platform: PlatformIOS, PushToken: "t"})
	_ = s.PutDevice(DeviceRecord{DeviceID: "b", Platform: PlatformAndroid, PushToken: "t"})
	_ = s.PutState(MonitorState{ServerID: "k", MonitorID: 1, MonitorName: "x", Status: "up", LastBeat: time.Now()})
	_ = s.RecordEvent(CoalesceEvent{ServerID: "k", MonitorName: "x", FromStatus: "up", ToStatus: "down", OccurredAt: time.Now()})

	st, _ = s.Stats()
	if st.DeviceCount != 2 {
		t.Errorf("DeviceCount = %d, want 2", st.DeviceCount)
	}
	if st.StateCount != 1 {
		t.Errorf("StateCount = %d, want 1", st.StateCount)
	}
	if st.EventCount != 1 {
		t.Errorf("EventCount = %d, want 1", st.EventCount)
	}
	if st.OldestEventAt == 0 {
		t.Error("OldestEventAt should be set after RecordEvent")
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
