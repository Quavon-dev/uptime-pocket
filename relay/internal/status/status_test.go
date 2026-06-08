package status

import (
	"testing"
	"time"
)

func TestNormalize(t *testing.T) {
	cases := []struct {
		in   string
		want Status
		err  bool
	}{
		// Strings
		{"up", StatusUp, false},
		{"UP", StatusUp, false},
		{"down", StatusDown, false},
		{"DOWN", StatusDown, false},
		{"pending", StatusPending, false},
		{"maintenance", StatusMaintenance, false},
		{"paused", StatusPaused, false},
		// Numeric codes Kuma 2.0+ uses
		{"0", StatusPending, false},
		{"1", StatusUp, false},
		{"2", StatusDown, false},
		{"3", StatusMaintenance, false},
		// 0.0 means "DOWN" in Kuma 1.x socket events
		{"0.0", StatusDown, false},
		{"2.0", StatusDown, false},
		// Unknown
		{"", "", true},
		{"foo", "", true},
		{"999", "", true},
	}
	for _, c := range cases {
		got, err := Normalize(c.in)
		if c.err {
			if err == nil {
				t.Errorf("Normalize(%q) expected error, got %v", c.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("Normalize(%q) unexpected error: %v", c.in, err)
			continue
		}
		if got != c.want {
			t.Errorf("Normalize(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestClassify_FirstHeartbeatIsSilent(t *testing.T) {
	// The very first heartbeat for a monitor should never
	// produce a notification, regardless of status. This is
	// the rule that makes a relay restart safe.
	hb := Heartbeat{
		ServerID:    "kuma-a",
		MonitorID:   1,
		MonitorName: "API",
		Status:      StatusDown,
		Time:        time.Now(),
	}
	for _, startStatus := range []Status{"", StatusUp, StatusDown, StatusPending} {
		kind, persisted := ClassifyWithFirst(startStatus, hb, true /* firstSeen */)
		if kind != NoChange {
			t.Errorf("first heartbeat from prev=%q should be NoChange, got %v", startStatus, kind)
		}
		if persisted != StatusDown {
			t.Errorf("first heartbeat should persist %q, got %q", StatusDown, persisted)
		}
	}
}

func TestClassify_OutageAndRecovery(t *testing.T) {
	now := time.Now()
	hb := func(s Status) Heartbeat {
		return Heartbeat{ServerID: "k", MonitorID: 1, MonitorName: "x", Status: s, Time: now}
	}

	cases := []struct {
		prev Status
		curr Status
		want TransitionKind
	}{
		// No-op
		{StatusUp, StatusUp, NoChange},
		{StatusDown, StatusDown, NoChange},
		// Recovery: non-UP -> UP
		{StatusDown, StatusUp, Recovery},
		{StatusPending, StatusUp, Recovery},
		{StatusMaintenance, StatusUp, Recovery},
		// Outage: active -> DOWN
		{StatusUp, StatusDown, Outage},
		{StatusPending, StatusDown, Outage},
		{StatusMaintenance, StatusDown, Outage},
		// paused -> DOWN is NOT an outage (we never observed it
		// as up; going to down from paused is the user coming
		// back from a pause to find the service still down)
		{StatusPaused, StatusDown, NoChange},
		// Maintenance/pause transitions are not notifications
		{StatusUp, StatusMaintenance, MaintenanceOrPause},
		{StatusDown, StatusMaintenance, MaintenanceOrPause},
		{StatusUp, StatusPaused, MaintenanceOrPause},
		{StatusDown, StatusPaused, MaintenanceOrPause},
		// Going to pending is a no-op
		{StatusUp, StatusPending, NoChange},
		{StatusDown, StatusPending, NoChange},
	}
	for _, c := range cases {
		got, _ := Classify(c.prev, hb(c.curr))
		if got != c.want {
			t.Errorf("Classify(%q -> %q) = %v, want %v", c.prev, c.curr, got, c.want)
		}
	}
}

func TestIsInQuietHours(t *testing.T) {
	// Pin a date so the test is deterministic regardless of
	// when the CI machine is running.
	base := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)

	cases := []struct {
		name        string
		enabled     bool
		start, end  int
		at          time.Time
		want        bool
	}{
		{
			name: "disabled never quiet",
			enabled: false,
			start: 0, end: 1439,
			at: base.Add(12 * time.Hour),
			want: false,
		},
		{
			name: "same-day window 09:00-17:00, at 12:00",
			enabled: true,
			start: 9*60 + 0, end: 17*60 + 0,
			at: base.Add(12 * time.Hour),
			want: true,
		},
		{
			name: "same-day window 09:00-17:00, at 08:59",
			enabled: true,
			start: 9*60 + 0, end: 17*60 + 0,
			at: base.Add(8*time.Hour + 59*time.Minute),
			want: false,
		},
		{
			name: "same-day window 09:00-17:00, at 17:00 (boundary)",
			enabled: true,
			start: 9*60 + 0, end: 17*60 + 0,
			at: base.Add(17 * time.Hour),
			want: false, // exclusive end
		},
		{
			name: "overnight window 22:00-07:00, at 23:00",
			enabled: true,
			start: 22*60 + 0, end: 7*60 + 0,
			at: base.Add(23 * time.Hour),
			want: true,
		},
		{
			name: "overnight window 22:00-07:00, at 03:00",
			enabled: true,
			start: 22*60 + 0, end: 7*60 + 0,
			at: base.Add(3 * time.Hour),
			want: true,
		},
		{
			name: "overnight window 22:00-07:00, at 10:00",
			enabled: true,
			start: 22*60 + 0, end: 7*60 + 0,
			at: base.Add(10 * time.Hour),
			want: false,
		},
		{
			name: "24h silent mode (start==end) is always quiet",
			enabled: true,
			start: 0, end: 0,
			at: base.Add(15 * time.Hour),
			want: true,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := IsInQuietHours(c.at, c.enabled, c.start, c.end)
			if got != c.want {
				t.Errorf("at %s: got %v, want %v", c.at.Format("15:04"), got, c.want)
			}
		})
	}
}

func TestHeartbeatValidate(t *testing.T) {
	base := Heartbeat{
		ServerID:    "k",
		MonitorID:   1,
		MonitorName: "x",
		Status:      StatusUp,
		Time:        time.Now(),
	}
	if err := base.Validate(); err != nil {
		t.Errorf("complete heartbeat should validate, got %v", err)
	}

	bad := base
	bad.ServerID = ""
	if err := bad.Validate(); err == nil {
		t.Error("missing ServerID should fail")
	}

	bad = base
	bad.MonitorID = 0
	if err := bad.Validate(); err == nil {
		t.Error("missing MonitorID should fail")
	}

	bad = base
	bad.MonitorName = ""
	if err := bad.Validate(); err == nil {
		t.Error("missing MonitorName should fail")
	}

	bad = base
	bad.Status = ""
	if err := bad.Validate(); err == nil {
		t.Error("missing Status should fail")
	}

	bad = base
	bad.Time = time.Time{}
	if err := bad.Validate(); err == nil {
		t.Error("missing Time should fail")
	}
}
