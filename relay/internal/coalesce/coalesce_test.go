package coalesce

import (
	"testing"
	"time"

	"github.com/quavon-dev/uptime-pocket-relay/internal/storage"
)

func TestDecide_BelowThreshold(t *testing.T) {
	// 2 recent + 1 new = 3 transitions on the same server
	// with minN=3. We're at the threshold. Decide should
	// suppress (we'd send the critical, not the individual).
	recent := []storage.CoalesceEvent{
		{ServerID: "k1", MonitorName: "A", OccurredAt: time.Now().Add(-1 * time.Second)},
		{ServerID: "k1", MonitorName: "B", OccurredAt: time.Now().Add(-2 * time.Second)},
	}
	newEv := storage.CoalesceEvent{ServerID: "k1", MonitorName: "C", OccurredAt: time.Now()}

	if d := Decide(recent, newEv, 3); d != SendCritical {
		t.Errorf("at threshold: got %v, want SendCritical", d)
	}
	if !IsTrigger(recent, newEv, 3) {
		t.Error("the new event should be the trigger at threshold")
	}
}

func TestDecide_WellBelowThreshold(t *testing.T) {
	recent := []storage.CoalesceEvent{
		{ServerID: "k1", MonitorName: "A", OccurredAt: time.Now().Add(-1 * time.Second)},
	}
	newEv := storage.CoalesceEvent{ServerID: "k1", MonitorName: "B", OccurredAt: time.Now()}

	if d := Decide(recent, newEv, 3); d != SendIndividual {
		t.Errorf("well below threshold: got %v, want SendIndividual", d)
	}
	if IsTrigger(recent, newEv, 3) {
		t.Error("the new event should NOT be a trigger when below threshold")
	}
}

func TestDecide_PastThresholdSuppresses(t *testing.T) {
	// 3 recent + 1 new = 4. The 3rd was the trigger; this one
	// should be a no-op suppress.
	recent := []storage.CoalesceEvent{
		{ServerID: "k1", MonitorName: "A", OccurredAt: time.Now().Add(-3 * time.Second)},
		{ServerID: "k1", MonitorName: "B", OccurredAt: time.Now().Add(-2 * time.Second)},
		{ServerID: "k1", MonitorName: "C", OccurredAt: time.Now().Add(-1 * time.Second)},
	}
	newEv := storage.CoalesceEvent{ServerID: "k1", MonitorName: "D", OccurredAt: time.Now()}

	if d := Decide(recent, newEv, 3); d != SendCritical {
		t.Errorf("past threshold: got %v, want SendCritical", d)
	}
	if IsTrigger(recent, newEv, 3) {
		t.Error("the new event should NOT be a trigger — earlier event already was")
	}
}

func TestDecide_DifferentServersDoNotCoalesce(t *testing.T) {
	// 2 on k1 + 1 on k2 = threshold for k1 not reached.
	// We do NOT coalesce across servers.
	recent := []storage.CoalesceEvent{
		{ServerID: "k1", MonitorName: "A", OccurredAt: time.Now().Add(-1 * time.Second)},
		{ServerID: "k1", MonitorName: "B", OccurredAt: time.Now().Add(-2 * time.Second)},
		{ServerID: "k2", MonitorName: "X", OccurredAt: time.Now().Add(-1 * time.Second)},
	}
	newEv := storage.CoalesceEvent{ServerID: "k1", MonitorName: "C", OccurredAt: time.Now()}

	// k1 has 2 prior + 1 new = 3 (suppressed), k2 has 1 prior
	// (doesn't count). The new event is for k1, which is at
	// threshold, so the answer is SendCritical.
	if d := Decide(recent, newEv, 3); d != SendCritical {
		t.Errorf("mixed-server: got %v, want SendCritical (k1 only)", d)
	}

	// Now check a new event on k2 — k2 has 1 prior + 1 new = 2,
	// below threshold.
	newEv2 := storage.CoalesceEvent{ServerID: "k2", MonitorName: "Y", OccurredAt: time.Now()}
	if d := Decide(recent, newEv2, 3); d != SendIndividual {
		t.Errorf("mixed-server new on k2: got %v, want SendIndividual", d)
	}
}

func TestSummarizeCritical(t *testing.T) {
	format := func(names []string, more int) string {
		s := ""
		for i, n := range names {
			if i > 0 {
				s += ", "
			}
			s += n
		}
		if more > 0 {
			s += " and " + intToStr(more) + " more"
		}
		return s
	}

	// Exactly 5
	got := SummarizeCritical([]string{"A", "B", "C", "D", "E"}, 0, format)
	if got != "A, B, C, D, E" {
		t.Errorf("got %q, want %q", got, "A, B, C, D, E")
	}

	// 7 total, show 5 + "and 2 more"
	got = SummarizeCritical([]string{"A", "B", "C", "D", "E", "F", "G"}, 2, format)
	if got != "A, B, C, D, E and 2 more" {
		t.Errorf("got %q", got)
	}

	// 3 total
	got = SummarizeCritical([]string{"A", "B", "C"}, 0, format)
	if got != "A, B, C" {
		t.Errorf("got %q", got)
	}
}

func intToStr(n int) string {
	// tiny helper to avoid importing strconv in the test
	if n == 0 {
		return "0"
	}
	if n == 1 {
		return "1"
	}
	if n == 2 {
		return "2"
	}
	return "?"
}
