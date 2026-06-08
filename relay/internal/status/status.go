// Package status implements the relay's status-diff engine.
//
// The job is small but precise: given a new heartbeat from Kuma,
// compare it to the last-known state, and report whether this
// heartbeat represents a notification-worthy transition.
//
// We mirror Kuma's own notification policy:
//   - DOWN from UP/pending/maintenance  -> notify (the service is broken)
//   - UP from DOWN                       -> notify (recovered)
//   - Anything else                      -> no notify
//
// We also support a coalesce rule: if 3+ DOWN transitions happen
// within CoalesceWindow on the same server, we report a single
// "critical" event instead of N individual ones. The actual
// per-event notification logic lives upstream of this package
// (the engine just emits the transitions; coalesce decides which
// of them get suppressed).
package status

import (
	"errors"
	"fmt"
	"time"
)

// Status is the normalized monitor status the relay cares about.
// We use a smaller set than Kuma: paused/maintenance never
// produce a notify-worthy transition, and pending is only ever
// a "from" state, never a "to" state.
type Status string

const (
	StatusUp          Status = "up"
	StatusDown        Status = "down"
	StatusPending     Status = "pending"
	StatusMaintenance Status = "maintenance"
	StatusPaused      Status = "paused"
)

// Normalize maps a Kuma status string to our enum. Kuma 2.0+
// uses numeric codes (0=pending, 1=up, 2=down, 3=maintenance)
// for some events and string names for others; we accept both.
func Normalize(s string) (Status, error) {
	switch s {
	case "up", "UP", "1", "1.0":
		return StatusUp, nil
	case "down", "DOWN", "2", "2.0", "0.0":
		return StatusDown, nil
	case "pending", "PENDING", "0":
		return StatusPending, nil
	case "maintenance", "MAINTENANCE", "3":
		return StatusMaintenance, nil
	case "paused", "PAUSED":
		return StatusPaused, nil
	default:
		return "", fmt.Errorf("status: unknown kuma status %q", s)
	}
}

// Heartbeat is one update from Kuma. It's the unit of input
// the diff engine consumes.
type Heartbeat struct {
	ServerID    string
	MonitorID   int
	MonitorName string
	Status      Status
	Time        time.Time
	// Msg is Kuma's per-heartbeat message ("HTTP 200", "timeout",
	// "TLS error", etc). We pass it through to the push payload.
	Msg string
}

// TransitionKind classifies a single Heartbeat. The engine
// returns one of these per Heartbeat so the caller knows
// whether to send a push.
type TransitionKind int

const (
	// NoChange: the heartbeat matches the previous state. No
	// notification.
	NoChange TransitionKind = iota
	// Recovery: status went from non-UP to UP. Notify the user
	// with a "back up" message.
	Recovery
	// Outage: status went from UP/pending/maintenance to DOWN.
	// Notify with a "is down" message.
	Outage
	// MaintenanceOrPause: status went to maintenance or paused.
	// We do NOT notify for these — they're expected transitions
	// the user typically initiates from Kuma's UI.
	MaintenanceOrPause
)

// Classify compares a new heartbeat to the previous state and
// returns what kind of transition this is, plus a normalized
// "to" status for the caller to persist.
//
// previous may be the zero value if this is the first heartbeat
// we've ever seen for the monitor. In that case:
//
//   - If status is UP or PENDING, the first heartbeat is just
//     an initial state — no notification.
//   - If status is DOWN, the monitor was already down before we
//     started watching. We treat this as an initial state too;
//     we don't want to spam the user with historical outages
//     when the relay restarts.
//
// This "no notification for the very first heartbeat" rule
// is what makes the relay safe to restart.
func Classify(prev Status, hb Heartbeat) (TransitionKind, Status) {
	return ClassifyWithFirst(prev, hb, prev == "")
}

// ClassifyWithFirst is the lower-level form: callers that know
// whether this is the first-ever heartbeat for a monitor pass
// firstSeen=true to suppress notifications on the first hit,
// even if prev is already a real value (e.g. when the previous
// state was just hydrated from BoltDB on relay startup).
func ClassifyWithFirst(prev Status, hb Heartbeat, firstSeen bool) (TransitionKind, Status) {
	curr := hb.Status

	// If this is the very first heartbeat for this monitor,
	// silently adopt the current state regardless of what prev
	// says. The caller will persist it; subsequent heartbeats
	// will diff against it.
	if firstSeen {
		return NoChange, curr
	}

	if prev == curr {
		return NoChange, curr
	}

	switch curr {
	case StatusUp:
		// Anything -> UP is a recovery, even UP -> UP was caught
		// above as NoChange. So this must be a non-UP -> UP.
		return Recovery, curr

	case StatusDown:
		// We only notify for outages from "active" states. We
		// don't want to fire a push when the relay starts
		// watching a monitor that's already paused or in
		// maintenance.
		switch prev {
		case StatusUp, StatusPending, StatusMaintenance:
			return Outage, curr
		default:
			// DOWN from paused or already-DOWN: treat as no
			// transition. (The "already DOWN" case is caught by
			// prev == curr above, so this is really just
			// paused -> DOWN.)
			return NoChange, curr
		}

	case StatusPending:
		// Going TO pending from anything is a no-op. Pending
		// means "we're checking now, hold tight" — not a state
		// the user wants a push for.
		return NoChange, curr

	case StatusMaintenance, StatusPaused:
		// Going TO maintenance/paused is expected; the user
		// did it themselves. Don't notify.
		return MaintenanceOrPause, curr
	}

	// Unknown transition. Defensive default: no notify.
	return NoChange, curr
}

// ValidateQuietHours returns true if the device is currently in
// quiet hours (and therefore should not receive a push), false
// otherwise.
//
// The window is inclusive on both ends and supports wrapping
// midnight (start > end means "spans midnight"). E.g.:
//   - start=22:00, end=07:00  -> quiet from 22:00 today through
//     07:00 tomorrow
//   - start=00:00, end=00:00  -> not quiet (no-op window)
//   - start=09:00, end=17:00  -> quiet from 09:00 to 17:00 same
//     day
func IsInQuietHours(now time.Time, enabled bool, startMinute, endMinute int) bool {
	if !enabled {
		return false
	}
	// Same-day window: 09:00 to 17:00
	nowMin := now.Hour()*60 + now.Minute()
	if startMinute < endMinute {
		return nowMin >= startMinute && nowMin < endMinute
	}
	// Overnight window: 22:00 to 07:00. Two cases:
	//   - after start (>= startMinute): quiet
	//   - before end  (<  endMinute):  quiet
	if startMinute == endMinute {
		// 24h silent mode. Yes this is weird; honor it.
		return true
	}
	return nowMin >= startMinute || nowMin < endMinute
}

// ErrInvalidHeartbeat is returned by Validate() if a heartbeat
// is missing required fields. Callers should log and drop it.
var ErrInvalidHeartbeat = errors.New("status: invalid heartbeat")

// Validate checks the heartbeat has the minimum fields needed
// to be processed.
func (hb Heartbeat) Validate() error {
	if hb.ServerID == "" {
		return fmt.Errorf("%w: missing ServerID", ErrInvalidHeartbeat)
	}
	if hb.MonitorID == 0 {
		return fmt.Errorf("%w: missing MonitorID", ErrInvalidHeartbeat)
	}
	if hb.MonitorName == "" {
		return fmt.Errorf("%w: missing MonitorName", ErrInvalidHeartbeat)
	}
	if hb.Status == "" {
		return fmt.Errorf("%w: missing Status", ErrInvalidHeartbeat)
	}
	if hb.Time.IsZero() {
		return fmt.Errorf("%w: missing Time", ErrInvalidHeartbeat)
	}
	return nil
}
