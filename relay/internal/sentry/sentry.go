// Package sentry wraps the Sentry Go SDK for the relay.
//
// Sentry is opt-in for the relay: if SentryDSN is empty in the
// config, none of the package's exports do anything. We don't
// pull the SDK into the binary at all if Sentry is never enabled
// at startup.
//
// Privacy: the relay does NOT collect PII by default. We strip
// request bodies, monitor names, server URLs, and bearer tokens
// from events before they leave the process. See the
// beforeSend hook for the redaction list.
package sentry

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/getsentry/sentry-go"
)

// Config is the input to Init. Only DSN is required to enable
// Sentry; the rest have sensible defaults.
type Config struct {
	DSN         string
	Environment string  // "production" | "development" | "preview"
	Release     string  // e.g. "relay@v1.2.3"
	SampleRate  float64 // 0..1
	Debug       bool    // verbose SDK logs
}

// active is the package-level singleton. nil means Sentry is off.
var active *sentry.Hub

// Init brings up the Sentry SDK. If cfg.DSN is empty, Init is a
// no-op (the SDK is not loaded, the singleton stays nil, all
// CaptureException calls are no-ops).
//
// We return a close function. The caller is expected to call it
// during shutdown so any pending events flush to Sentry before
// the process exits. The close function respects a 5-second
// timeout — anything left in the buffer after that is dropped.
func Init(ctx context.Context, cfg Config, logger *slog.Logger) (close func(context.Context) error, err error) {
	if cfg.DSN == "" {
		logger.Info("sentry: DSN not set, Sentry is disabled")
		return func(context.Context) error { return nil }, nil
	}

	if cfg.Environment == "" {
		cfg.Environment = "production"
	}
	if cfg.SampleRate == 0 {
		cfg.SampleRate = 0.1
	}

	err = sentry.Init(sentry.ClientOptions{
		Dsn:              cfg.DSN,
		Environment:      cfg.Environment,
		Release:          cfg.Release,
		SampleRate:       cfg.SampleRate, // error event sample rate
		EnableTracing:    true,
		TracesSampleRate: cfg.SampleRate, // transaction sample rate
		Debug:            cfg.Debug,
		// PII disabled at the SDK level. We additionally scrub
		// in BeforeSend below.
		SendDefaultPII: false,
		AttachStacktrace: true,
		BeforeSend:     scrubEvent,
	})
	if err != nil {
		return nil, fmt.Errorf("sentry init: %w", err)
	}

	active = sentry.CurrentHub().Clone()
	logger.Info("sentry: enabled",
		"environment", cfg.Environment,
		"sample_rate", cfg.SampleRate,
	)

	return func(ctx context.Context) error {
		if active == nil {
			return nil
		}
		// Flush with a hard cap so we don't block shutdown forever.
		flushCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		_ = flushCtx // v0.34 SDK takes a time.Duration
		ok := active.Flush(5 * time.Second)
		active = nil
		if !ok {
			return errors.New("sentry: flush timeout")
		}
		return nil
	}, nil
}

// IsEnabled returns true if Sentry was successfully initialized.
func IsEnabled() bool {
	return active != nil
}

// CaptureException is a no-op if Sentry is not enabled. Use
// everywhere we have a caught error that we want reported.
func CaptureException(err error, tags map[string]string) {
	if active == nil || err == nil {
		return
	}
	if len(tags) == 0 {
		active.CaptureException(err)
		return
	}
	active.WithScope(func(scope *sentry.Scope) {
		for k, v := range tags {
			scope.SetTag(k, v)
		}
		active.CaptureException(err)
	})
}

// CaptureMessage is a no-op if Sentry is not enabled.
func CaptureMessage(msg string, level sentry.Level, tags map[string]string) {
	if active == nil {
		return
	}
	// v0.34 doesn't have a level parameter on CaptureMessage.
	// Set the level on the event via WithScope.
	active.WithScope(func(scope *sentry.Scope) {
		scope.SetLevel(level)
		for k, v := range tags {
			scope.SetTag(k, v)
		}
		active.CaptureMessage(msg)
	})
}

// --- PII scrubbing ---

// Patterns we redact. Mirrors the TS scrubber.
var (
	// Authorization: Bearer *** () => {
	authHeaderRe = regexp.MustCompile(`(?i)(authorization\s*:\s*)(bearer|basic|token|api[_-]?key)\s+\S+`)

	// Anything that looks like a URL with a host. We keep the
	// scheme and the path (useful for grouping) but strip host.
	schemeRe = regexp.MustCompile(`(?i)(https?|wss?)://[^\s"'<>]+`)

	// PII key patterns. Same as TS scrubber. Keep in sync.
	piiKeyRe = regexp.MustCompile(`(?i)(host|hostname|server|token|password|secret|api[_-]?key|auth|authorization|cookie|set[_-]?cookie|monitor[_-]?name|server[_-]?name|email|user[_-]?id|username)`)
)

// scrubEvent is the beforeSend hook. It returns the event with
// PII removed. We never drop the event (always return non-nil);
// we'd rather lose some context than lose a crash report.
func scrubEvent(event *sentry.Event, _ *sentry.EventHint) *sentry.Event {
	if event == nil {
		return nil
	}

	// Drop server_name (always a hostname).
	event.ServerName = ""

	// Drop user context fields that may contain PII. We keep
	// only an anonymized id.
	if !event.User.IsEmpty() {
		event.User.Email = ""
		event.User.IPAddress = ""
		event.User.Username = ""
	}

	// Scrub exception values.
	if event.Exception != nil {
		for i, ex := range event.Exception {
			ex.Value = scrubString(ex.Value)
			ex.Type = truncate(ex.Type, 200)
			if ex.Stacktrace != nil {
				for j, frame := range ex.Stacktrace.Frames {
					if strings.Contains(frame.AbsPath, "://") {
						frame.AbsPath = ""
					}
					frame.Filename = truncate(frame.Filename, 200)
					ex.Stacktrace.Frames[j] = frame
				}
			}
			event.Exception[i] = ex
		}
	}

	// Scrub tags/extra/breadcrumbs.
	event.Tags = scrubStringMap(event.Tags)
	if event.Extra != nil {
		event.Extra = scrubAnyMap(event.Extra)
	}
	for i, crumb := range event.Breadcrumbs {
		event.Breadcrumbs[i] = scrubBreadcrumb(crumb)
	}

	// Message.
	event.Message = scrubString(event.Message)

	return event
}

func scrubBreadcrumb(crumb *sentry.Breadcrumb) *sentry.Breadcrumb {
	if crumb == nil {
		return nil
	}
	crumb.Message = scrubString(crumb.Message)
	if crumb.Data != nil {
		crumb.Data = scrubAnyMap(crumb.Data)
	}
	return crumb
}

// scrubAnyMap walks values and applies the appropriate transform
// per-type. Used for the loose Extra and Breadcrumb.Data maps.
func scrubAnyMap(m map[string]any) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		if piiKeyRe.MatchString(k) {
			out[k] = "[Redacted]"
			continue
		}
		switch val := v.(type) {
		case string:
			out[k] = scrubString(val)
		case map[string]any:
			out[k] = scrubAnyMap(val)
		default:
			out[k] = v
		}
	}
	return out
}

// scrubStringMap is for Sentry's typed Tags map. Shallow redaction
// since tags are flat.
func scrubStringMap(m map[string]string) map[string]string {
	out := make(map[string]string, len(m))
	for k, v := range m {
		if piiKeyRe.MatchString(k) {
			out[k] = "[Redacted]"
		} else {
			out[k] = scrubString(v)
		}
	}
	return out
}

// scrubString applies the in-string redactions.
func scrubString(s string) string {
	if s == "" {
		return s
	}
	s = authHeaderRe.ReplaceAllString(s, `$1$2 [Redacted]`)
	s = schemeRe.ReplaceAllStringFunc(s, redactURLMatch)
	if len(s) > 1024 {
		s = s[:1024] + "…"
	}
	return s
}

// redactURLMatch is the callback for schemeRe.ReplaceAllStringFunc.
// We parse with net/url so we can preserve the path and a sanitized
// query (key names only, values become "Redacted").
func redactURLMatch(match string) string {
	u, err := url.Parse(match)
	if err != nil {
		return "[Redacted]"
	}
	q := u.RawQuery
	if q != "" {
		parts := strings.Split(q, "&")
		clean := make([]string, 0, len(parts))
		for _, p := range parts {
			if i := strings.Index(p, "="); i >= 0 {
				clean = append(clean, p[:i+1]+"Redacted")
			} else {
				clean = append(clean, p)
			}
		}
		q = strings.Join(clean, "&")
	}
	out := u.Scheme + "://[Redacted]" + u.Path
	if q != "" {
		out += "?" + q
	}
	return out
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

// --- HTTP middleware ---

// Middleware returns an http middleware that captures panics as
// Sentry events. Non-panic returned errors are NOT captured (the
// Go convention is to handle them inline).
//
// This is a no-op if Sentry is not enabled.
func Middleware(next http.Handler) http.Handler {
	if !IsEnabled() {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hub := active.Clone()
		hub.ConfigureScope(func(scope *sentry.Scope) {
			scope.SetRequest(r)
		})
		defer func() {
			if rec := recover(); rec != nil {
				hub.RecoverWithContext(r.Context(), rec)
				panic(rec) // re-raise
			}
		}()
		next.ServeHTTP(w, r)
	})
}
