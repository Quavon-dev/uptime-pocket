package sentry

import (
	"strings"
	"testing"

	"github.com/getsentry/sentry-go"
)

func TestScrubString_URL(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"GET https://kuma.example.com/api/status", "GET https://[Redacted]/api/status"},
		{"wss://10.0.0.1:3001/socket.io/", "wss://[Redacted]/socket.io/"},
		{"connect to https://my-internal-kuma.corp.local:8443/", "connect to https://[Redacted]/"},
	}
	for _, c := range cases {
		got := scrubString(c.in)
		if got != c.want {
			t.Errorf("scrubString(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestScrubString_AuthHeader(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"Authorization: Bearer abc123", "Authorization: Bearer [Redacted]"},
		{"Authorization: Basic dXNlcjpwYXNz", "Authorization: Basic [Redacted]"},
		{"Authorization: Token my-secret", "Authorization: Token [Redacted]"},
		{"Authorization: api_key abc", "Authorization: api_key [Redacted]"},
	}
	for _, c := range cases {
		got := scrubString(c.in)
		if got != c.want {
			t.Errorf("scrubString(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestScrubString_QueryValues(t *testing.T) {
	in := "GET https://api.example.com/data?api_key=supersecret&page=1"
	out := scrubString(in)
	if strings.Contains(out, "supersecret") {
		t.Errorf("expected secret to be redacted, got %q", out)
	}
	if !strings.Contains(out, "api_key=Redacted") {
		t.Errorf("expected key name preserved, got %q", out)
	}
}

func TestScrubString_Truncates(t *testing.T) {
	long := strings.Repeat("x", 2000)
	out := scrubString(long)
	// 1024 runes + ellipsis (1 rune). We check rune count not
	// byte count because `…` is 3 bytes in UTF-8.
	if r := []rune(out); len(r) > 1025 {
		t.Errorf("expected rune length <= 1025 (1024 + ellipsis), got %d", len(r))
	}
}

func TestIsPiiKey(t *testing.T) {
	cases := []struct {
		key string
		pii bool
	}{
		{"server_url", true},
		{"token", true},
		{"password", true},
		{"monitorName", true},
		{"apiKey", true},
		{"environment", false},
		{"status", false},
		{"version", false},
		{"count", false},
	}
	for _, c := range cases {
		got := piiKeyRe.MatchString(c.key)
		if got != c.pii {
			t.Errorf("isPiiKey(%q) = %v, want %v", c.key, got, c.pii)
		}
	}
}

func TestScrubEvent_DropsServerName(t *testing.T) {
	ev := &sentry.Event{
		ServerName: "my-internal-host",
		Message:    "boom",
	}
	out := scrubEvent(ev, nil)
	if out.ServerName != "" {
		t.Errorf("expected server_name dropped, got %q", out.ServerName)
	}
}

func TestScrubEvent_RedactsUserPII(t *testing.T) {
	ev := &sentry.Event{
		User: sentry.User{
			ID:        "anon-hash-123",
			Email:     "leopold@example.com",
			IPAddress: "203.0.113.42",
			Username:  "leopold",
		},
	}
	out := scrubEvent(ev, nil)
	if out.User.Email != "" || out.User.IPAddress != "" || out.User.Username != "" {
		t.Errorf("expected user PII fields cleared, got %+v", out.User)
	}
	if out.User.ID != "anon-hash-123" {
		t.Errorf("expected user ID preserved, got %q", out.User.ID)
	}
}

func TestScrubEvent_RedactsExceptionValues(t *testing.T) {
	ev := &sentry.Event{
		Exception: []sentry.Exception{
			{
				Type:  "TypeError",
				Value: "request to https://kuma.example.com/api failed",
			},
		},
	}
	out := scrubEvent(ev, nil)
	if strings.Contains(out.Exception[0].Value, "kuma.example.com") {
		t.Errorf("expected URL redacted, got %q", out.Exception[0].Value)
	}
}

func TestScrubEvent_RedactsTags(t *testing.T) {
	ev := &sentry.Event{
		Tags: map[string]string{
			"server_url":   "https://kuma.example.com",
			"monitor_name": "web-prod",
			"environment":  "production",
		},
	}
	out := scrubEvent(ev, nil)
	if out.Tags["server_url"] != "[Redacted]" {
		t.Errorf("expected server_url redacted, got %q", out.Tags["server_url"])
	}
	if out.Tags["monitor_name"] != "[Redacted]" {
		t.Errorf("expected monitor_name redacted, got %q", out.Tags["monitor_name"])
	}
	if out.Tags["environment"] != "production" {
		t.Errorf("expected environment preserved, got %q", out.Tags["environment"])
	}
}

func TestScrubEvent_RedactsFramePaths(t *testing.T) {
	ev := &sentry.Event{
		Exception: []sentry.Exception{
			{
				Stacktrace: &sentry.Stacktrace{
					Frames: []sentry.Frame{
						{AbsPath: "file:///Users/leopold/.../main.go", Filename: "main.go"},
						{AbsPath: "/usr/local/go/src/.../main.go", Filename: "main.go"},
					},
				},
			},
		},
	}
	out := scrubEvent(ev, nil)
	// file:// has a scheme — drop abs_path
	if out.Exception[0].Stacktrace.Frames[0].AbsPath != "" {
		t.Errorf("expected file:// abs_path dropped, got %q", out.Exception[0].Stacktrace.Frames[0].AbsPath)
	}
	// plain path — keep
	if out.Exception[0].Stacktrace.Frames[1].AbsPath == "" {
		t.Errorf("expected plain abs_path preserved")
	}
}

func TestScrubBreadcrumb_RedactsMessage(t *testing.T) {
	crumb := &sentry.Breadcrumb{
		Message: "Authorization: Bearer abc123",
		Data: map[string]any{
			"url":    "https://kuma.example.com",
			"status": 200,
		},
	}
	scrubBreadcrumb(crumb)
	if strings.Contains(crumb.Message, "abc123") {
		t.Errorf("expected auth token redacted, got %q", crumb.Message)
	}
	if strings.Contains(crumb.Data["url"].(string), "kuma.example.com") {
		t.Errorf("expected URL redacted, got %q", crumb.Data["url"])
	}
	if crumb.Data["status"] != 200 {
		t.Errorf("expected status preserved, got %v", crumb.Data["status"])
	}
}

func TestScrubStringMap_HandlesPII(t *testing.T) {
	in := map[string]string{
		"server_url":  "https://kuma.example.com",
		"environment": "production",
		"version":     "1.0.0",
	}
	out := scrubStringMap(in)
	if out["server_url"] != "[Redacted]" {
		t.Errorf("expected server_url redacted, got %q", out["server_url"])
	}
	if out["environment"] != "production" {
		t.Errorf("expected environment preserved, got %q", out["environment"])
	}
	if out["version"] != "1.0.0" {
		t.Errorf("expected version preserved, got %q", out["version"])
	}
}

func TestScrubAnyMap_Recursive(t *testing.T) {
	in := map[string]any{
		"server_url": "https://kuma.example.com",
		"nested": map[string]any{
			"token": "my-secret",
			"safe":  "ok",
		},
		"count": 3,
	}
	out := scrubAnyMap(in)
	if out["server_url"] != "[Redacted]" {
		t.Errorf("expected server_url redacted")
	}
	if out["count"] != 3 {
		t.Errorf("expected count preserved")
	}
	nested, ok := out["nested"].(map[string]any)
	if !ok {
		t.Fatalf("expected nested to be a map")
	}
	if nested["token"] != "[Redacted]" {
		t.Errorf("expected nested token redacted, got %v", nested["token"])
	}
	if nested["safe"] != "ok" {
		t.Errorf("expected nested safe preserved, got %v", nested["safe"])
	}
}

func TestRedactURLMatch_HandlesCredentials(t *testing.T) {
	match := "wss://user:hunter2@kuma.example.com/socket.io/"
	out := redactURLMatch(match)
	if strings.Contains(out, "user") || strings.Contains(out, "hunter2") {
		t.Errorf("expected credentials redacted, got %q", out)
	}
	if !strings.Contains(out, "wss://[Redacted]/socket.io/") {
		t.Errorf("expected redacted URL, got %q", out)
	}
}
