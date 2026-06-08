// Package coalesce decides whether a single status transition
// should be sent as its own push, or grouped with recent
// transitions into a single "critical" alert.
//
// The rule we implement (matching Kuma's own notification
// behavior):
//
//   If N or more DOWN transitions happen on the same server
//   within the CoalesceWindow, we suppress the individual
//   notifications and emit a single "critical" notification
//   instead. The first transition that triggers the rule is
//   the one that becomes the "critical" — the rest of the
//   transitions in the window are dropped.
//
//   If the threshold is NOT met, every transition produces its
//   own notification (the normal case).
package coalesce

import (
	"time"

	"github.com/quavon-dev/uptime-pocket-relay/internal/storage"
)

// Decision is what the engine says to do with a transition.
type Decision int

const (
	// SendIndividual: send the per-monitor push.
	SendIndividual Decision = iota
	// SendCritical: suppress this individual push, but also
	// record it as a candidate for the "critical" push. The
	// caller should check the "is this the trigger?" return
	// value to decide whether to send the critical immediately
	// or just append.
	SendCritical
)

// Decide inspects the recent event window and returns a
// Decision for the new transition. The "new" transition is
// included in the count.
//
// The caller passes events that are already in the window
// (excluding the new one); we add 1 to the count to get the
// total transitions in the window after the new one.
//
// If Decide returns SendCritical, the caller should:
//   1. Record the new event in storage.
//   2. If this is the first event that pushed the count over
//      MinN, also send a "critical" push summarizing the
//      affected monitors (the new event's monitor name + the
//      other recent ones).
//
// To detect "first event over threshold", the caller compares
// len(events) (before adding the new one) to MinN:
//   - len(events) < MinN  &&  len(events)+1 >= MinN  -> THIS is
//     the trigger. Send the critical.
//   - len(events) >= MinN -> we're already past the threshold;
//     a previous event already sent the critical. Suppress.
func Decide(recent []storage.CoalesceEvent, newEv storage.CoalesceEvent, minN int) Decision {
	// Same-server scope: we only coalesce events from the same
	// Kuma instance. A prod outage and a staging outage should
	// not be merged.
	count := 1 // the new event
	for _, e := range recent {
		if e.ServerID == newEv.ServerID {
			count++
		}
	}
	if count < minN {
		return SendIndividual
	}
	return SendCritical
}

// IsTrigger returns true if the new event is the one that
// pushed the recent-event count over the threshold (and
// therefore the caller should send a "critical" push now).
//
// recent is the count BEFORE adding the new event.
func IsTrigger(recent []storage.CoalesceEvent, newEv storage.CoalesceEvent, minN int) bool {
	countBefore := 0
	for _, e := range recent {
		if e.ServerID == newEv.ServerID {
			countBefore++
		}
	}
	return countBefore < minN && countBefore+1 >= minN
}

// SummarizeCritical builds the human-readable summary used in
// the "critical" push. We list the first 5 monitor names; if
// there are more, we append "and N more". The summary is
// locale-aware through the i18n function: callers pass a
// function that produces a localized string for a list of
// monitor names. The default English is "M1, M2, M3, M4, M5
// and 2 more".
//
// We pass a function rather than import the i18n package here
// to keep this package dependency-free.
func SummarizeCritical(monitorNames []string, moreCount int, format func(names []string, more int) string) string {
	max := 5
	shown := monitorNames
	if len(shown) > max {
		shown = shown[:max]
	}
	return format(shown, moreCount)
}

// RollingWindow is the default coalesce window (30s). It's
// exposed as a constant so callers can name it without magic
// numbers.
const RollingWindow = 30 * time.Second
