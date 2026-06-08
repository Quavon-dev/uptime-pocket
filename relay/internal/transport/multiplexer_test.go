package transport

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/quavon-dev/uptime-pocket-relay/internal/storage"
)

// fakeSender records every Send call. It can be configured to
// return a specific error per call to exercise error paths.
type fakeSender struct {
	kind     Kind
	mu       sync.Mutex
	calls    []fakeCall
	err      error // returned by every Send
	callNum  int32
	perCall  map[int32]error
}

type fakeCall struct {
	Token string
	Alert Alert
}

func (f *fakeSender) Kind() Kind { return f.kind }

func (f *fakeSender) Send(_ context.Context, token string, alert Alert) error {
	n := atomic.AddInt32(&f.callNum, 1) - 1
	f.mu.Lock()
	f.calls = append(f.calls, fakeCall{Token: token, Alert: alert})
	f.mu.Unlock()
	if e, ok := f.perCall[n]; ok {
		return e
	}
	return f.err
}

func (f *fakeSender) callCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.calls)
}

func TestFanout_DeliversToAllDevices(t *testing.T) {
	apns := &fakeSender{kind: KindAPNs}
	fcm := &fakeSender{kind: KindFCM}
	m := NewMultiplexer(apns, fcm)

	devices := []storage.DeviceRecord{
		{DeviceID: "ios-1", Platform: storage.PlatformIOS, PushToken: "ios-tok"},
		{DeviceID: "and-1", Platform: storage.PlatformAndroid, PushToken: "and-tok"},
		{DeviceID: "ios-2", Platform: storage.PlatformIOS, PushToken: "ios-tok-2"},
	}
	alert := Alert{Title: "API is down", Body: "...", Server: "Prod", Monitor: "API"}

	sent, err := m.Fanout(context.Background(), devices, alert, nil)
	if err != nil {
		t.Errorf("Fanout returned error: %v", err)
	}
	if sent != 3 {
		t.Errorf("sent = %d, want 3", sent)
	}
	if apns.callCount() != 2 {
		t.Errorf("apns calls = %d, want 2", apns.callCount())
	}
	if fcm.callCount() != 1 {
		t.Errorf("fcm calls = %d, want 1", fcm.callCount())
	}
}

func TestFanout_InvalidTokenTriggersCallback(t *testing.T) {
	apns := &fakeSender{
		kind:    KindAPNs,
		perCall: map[int32]error{0: ErrInvalidToken},
	}
	m := NewMultiplexer(apns, nil)

	var invalidated []string
	var mu sync.Mutex
	devices := []storage.DeviceRecord{
		{DeviceID: "ios-1", Platform: storage.PlatformIOS, PushToken: "x"},
	}
	sent, err := m.Fanout(context.Background(), devices, Alert{Title: "x"}, func(id string) {
		mu.Lock()
		defer mu.Unlock()
		invalidated = append(invalidated, id)
	})

	// The caller still sees sent=0 and the error, but the
	// cleanup callback fired.
	if sent != 0 {
		t.Errorf("sent = %d, want 0", sent)
	}
	if err == nil || !errors.Is(err, ErrInvalidToken) {
		t.Errorf("err = %v, want ErrInvalidToken", err)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(invalidated) != 1 || invalidated[0] != "ios-1" {
		t.Errorf("invalidated = %v, want [ios-1]", invalidated)
	}
}

func TestFanout_TransientDoesNotInvalidate(t *testing.T) {
	apns := &fakeSender{kind: KindAPNs, err: ErrTransient}
	m := NewMultiplexer(apns, nil)

	called := false
	_, err := m.Fanout(context.Background(),
		[]storage.DeviceRecord{{DeviceID: "d", Platform: storage.PlatformIOS, PushToken: "x"}},
		Alert{},
		func(_ string) { called = true },
	)
	if err == nil || !errors.Is(err, ErrTransient) {
		t.Errorf("err = %v, want ErrTransient", err)
	}
	if called {
		t.Error("transient errors should NOT trigger invalidation")
	}
}

func TestFanout_SkipsDevicesWithNoSender(t *testing.T) {
	// Only APNs configured; Android devices should be silently
	// skipped (not errored).
	apns := &fakeSender{kind: KindAPNs}
	m := NewMultiplexer(apns, nil)

	devices := []storage.DeviceRecord{
		{DeviceID: "ios-1", Platform: storage.PlatformIOS, PushToken: "x"},
		{DeviceID: "and-1", Platform: storage.PlatformAndroid, PushToken: "y"},
	}
	sent, err := m.Fanout(context.Background(), devices, Alert{}, nil)
	if err != nil {
		t.Errorf("err = %v, want nil", err)
	}
	if sent != 1 {
		t.Errorf("sent = %d, want 1 (only ios-1)", sent)
	}
	if apns.callCount() != 1 {
		t.Errorf("apns calls = %d, want 1", apns.callCount())
	}
}

func TestFanout_UnknownPlatform(t *testing.T) {
	// A device with an unknown platform string is an error
	// case (registration endpoint should reject, but we
	// defend in depth here).
	apns := &fakeSender{kind: KindAPNs}
	m := NewMultiplexer(apns, nil)

	_, err := m.Fanout(context.Background(),
		[]storage.DeviceRecord{{DeviceID: "d", Platform: "web", PushToken: "x"}},
		Alert{},
		nil,
	)
	if err == nil || !strings.Contains(err.Error(), "web") {
		t.Errorf("err = %v, want one mentioning 'web'", err)
	}
}

func TestFanout_ContextCancellation(t *testing.T) {
	// A sender that respects ctx should see the cancellation.
	apns := &fakeSender{kind: KindAPNs}
	m := NewMultiplexer(apns, nil)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // already done
	_, _ = m.Fanout(ctx,
		[]storage.DeviceRecord{{DeviceID: "d", Platform: storage.PlatformIOS, PushToken: "x"}},
		Alert{},
		nil,
	)
	// We don't assert anything other than "didn't panic"; the
	// individual sender's behavior under ctx is the sender's
	// concern.
	_ = time.Now()
}
