// Package transport sends push notifications to the user's
// devices. There are two implementations:
//
//   - APNs:  Apple's HTTP/2 push gateway (iOS)
//   - FCM:   Google's Firebase HTTP v1 (Android)
//
// Both are behind a single Sender interface so the rest of the
// relay code doesn't care which one it's talking to. The
// interface is intentionally small: one method, Send(), that
// takes a payload and a target push token.
//
// All Send() implementations MUST be safe to call concurrently.
// The relay fans out to many devices in parallel after a
// single Kuma transition.
package transport

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/quavon-dev/uptime-pocket-relay/internal/storage"
)

// Kind identifies which transport a Sender implements.
type Kind string

const (
	KindAPNs Kind = "apns"
	KindFCM  Kind = "fcm"
)

// Alert is the user-visible content of one push. The relay
// builds it from the i18n catalog at the moment of sending
// so the language matches the device's preference.
type Alert struct {
	Title    string // "{monitor} is down"
	Body     string // "{monitor} on {server} is not responding."
	Server   string // server label, for context
	Monitor  string // monitor name
	From     string // previous status (e.g. "up")
	To       string // new status (e.g. "down")
	Critical bool   // true for coalesced "many things down" alerts
	Count    int    // for critical alerts, how many things are down
}

// Sender is the contract every transport implements.
type Sender interface {
	Kind() Kind
	// Send delivers an Alert to a single push token. The
	// platform parameter is taken from the device's stored
	// record so a misconfigured device (wrong pushToken for
	// platform) gets caught here.
	Send(ctx context.Context, pushToken string, alert Alert) error
}

// ErrInvalidToken is returned by a Sender when the platform
// rejects the push token. The relay reacts by deleting the
// device record (the user almost certainly uninstalled).
var ErrInvalidToken = errors.New("transport: invalid push token")

// ErrTransient is returned for retryable failures (5xx, network
// timeout, etc). The relay logs and continues; it does not
// delete the device.
var ErrTransient = errors.New("transport: transient error")

// Multiplexer fans out an alert to many devices in parallel.
// Each device may use APNs or FCM depending on its platform;
// the multiplexer looks up the right Sender per device.
type Multiplexer struct {
	apns Sender
	fcm  Sender
}

// NewMultiplexer builds a multiplexer from the (possibly nil)
// per-platform senders. If a platform's sender is nil, devices
// on that platform are silently skipped (we never want to crash
// the relay because a platform is misconfigured).
func NewMultiplexer(apns, fcm Sender) *Multiplexer {
	return &Multiplexer{apns: apns, fcm: fcm}
}

// Fanout delivers the same alert to every device. Returns the
// first non-nil error; other devices still get their attempt.
// A device whose pushToken is rejected (ErrInvalidToken) is
// reported via onInvalid, which the caller can use to clean up.
func (m *Multiplexer) Fanout(
	ctx context.Context,
	devices []storage.DeviceRecord,
	alert Alert,
	onInvalid func(deviceID string),
) (int, error) {
	if len(devices) == 0 {
		return 0, nil
	}

	type result struct {
		deviceID string
		err      error
	}
	results := make(chan result, len(devices))
	// We don't know up-front how many devices will actually be
	// sent (some may be skipped because the platform's sender
	// is nil). Track that with a counter rather than waiting
	// for len(devices) results, which would deadlock when
	// devices are skipped.
	expected := 0
	for _, d := range devices {
		d := d
		var s Sender
		switch d.Platform {
		case storage.PlatformIOS:
			s = m.apns
		case storage.PlatformAndroid:
			s = m.fcm
		default:
			results <- result{deviceID: d.DeviceID, err: fmt.Errorf("unknown platform %q", d.Platform)}
			expected++
			continue
		}
		if s == nil {
			// Platform not configured on this relay. Skip
			// silently — the device-registration endpoint
			// already filters these.
			continue
		}
		expected++
		go func() {
			// Per-device context timeout. We cap each push
			// at 10s; APNs and FCM are both fast under
			// normal conditions.
			cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			defer cancel()
			results <- result{deviceID: d.DeviceID, err: s.Send(cctx, d.PushToken, alert)}
		}()
	}

	sent := 0
	var firstErr error
	for i := 0; i < expected; i++ {
		r := <-results
		if r.err == nil {
			sent++
			continue
		}
		if errors.Is(r.err, ErrInvalidToken) && onInvalid != nil {
			onInvalid(r.deviceID)
		}
		if firstErr == nil {
			firstErr = r.err
		}
	}
	return sent, firstErr
}
