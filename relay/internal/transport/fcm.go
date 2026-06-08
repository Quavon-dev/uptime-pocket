// FCM transport. Sends pushes to Google's Firebase Cloud Messaging
// HTTP v1 API. We use OAuth2 access tokens derived from a
// service-account JSON file (the recommended approach for
// server-to-server; the legacy "server key" approach is being
// deprecated).
//
// API docs:
//   https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages/send
package transport

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/quavon-dev/uptime-pocket-relay/internal/config"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// FCMSender is the FCM v1 implementation.
type FCMSender struct {
	cfg       config.FCMConfig
	client    *http.Client
	tokenSrc  oauth2.TokenSource
	projectID string
}

// NewFCMSender loads the service account JSON and prepares the
// OAuth2 token source. The token source is refreshable; we
// wrap it in oauth2.StaticTokenSource-like caching via the
// google SDK's auto-refresh.
func NewFCMSender(ctx context.Context, cfg config.FCMConfig) (*FCMSender, error) {
	if !cfg.Enabled {
		return nil, errors.New("fcm: not enabled in config")
	}
	jsonKey, err := os.ReadFile(cfg.ServiceAccountPath)
	if err != nil {
		return nil, fmt.Errorf("fcm: read service account: %w", err)
	}

	// google.JWTConfigFromJSON handles the entire token-refresh
	// dance for us. It expects the JSON to have a "type" of
	// "service_account".
	creds, err := google.JWTConfigFromJSON(jsonKey, "https://www.googleapis.com/auth/firebase.messaging")
	if err != nil {
		return nil, fmt.Errorf("fcm: parse service account: %w", err)
	}
	tokenSrc := creds.TokenSource(ctx)

	client := &http.Client{
		Timeout: 15 * time.Second,
	}

	return &FCMSender{
		cfg:       cfg,
		client:    client,
		tokenSrc:  tokenSrc,
		projectID: cfg.ProjectID,
	}, nil
}

func (s *FCMSender) Kind() Kind { return KindFCM }

// Send delivers one alert to one FCM registration token.
func (s *FCMSender) Send(ctx context.Context, registrationToken string, alert Alert) error {
	if registrationToken == "" {
		return ErrInvalidToken
	}
	token, err := s.tokenSrc.Token()
	if err != nil {
		return fmt.Errorf("%w: get oauth token: %v", ErrTransient, err)
	}

	body := fcmPayload{
		Message: fcmMessage{
			Token: registrationToken,
			Notification: &fcmNotification{
				Title: alert.Title,
				Body:  alert.Body,
			},
			// Android-specific tweaks
			Android: &fcmAndroidConfig{
				Priority: "high",
				// 0 = normal; tapping the notification opens
				// the app to the home tab. A future version
				// could deep-link to the monitor.
			},
			Data: map[string]string{
				"server":   alert.Server,
				"monitor":  alert.Monitor,
				"from":     alert.From,
				"to":       alert.To,
				"critical": fmt.Sprintf("%t", alert.Critical),
				"count":    fmt.Sprintf("%d", alert.Count),
			},
		},
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("fcm: marshal: %w", err)
	}

	url := fmt.Sprintf("https://fcm.googleapis.com/v1/projects/%s/messages:send", s.projectID)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token.AccessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrTransient, err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	switch resp.StatusCode {
	case 200, 201:
		return nil
	case 400, 404:
		// 400 with NOT_FOUND or INVALID_ARGUMENT means the
		// registration token is dead. UNREGISTERED (also
		// 404) is the same.
		return fmt.Errorf("%w: %s", ErrInvalidToken, string(respBody))
	case 401, 403:
		// Token / project misconfiguration. Treat as transient
		// so we don't mass-delete devices, but log loudly.
		return fmt.Errorf("%w: auth (check service account + project ID): %s", ErrTransient, string(respBody))
	case 429, 500, 502, 503, 504:
		return fmt.Errorf("%w: status=%d body=%s", ErrTransient, resp.StatusCode, string(respBody))
	default:
		return fmt.Errorf("%w: status=%d body=%s", ErrTransient, resp.StatusCode, string(respBody))
	}
}

// --- payload shapes (see FCM v1 docs) ---

type fcmPayload struct {
	Message fcmMessage `json:"message"`
}

type fcmMessage struct {
	Token        string             `json:"token"`
	Notification *fcmNotification   `json:"notification,omitempty"`
	Android      *fcmAndroidConfig  `json:"android,omitempty"`
	Data         map[string]string  `json:"data,omitempty"`
}

type fcmNotification struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

type fcmAndroidConfig struct {
	Priority string `json:"priority,omitempty"`
}

// --- import suppression ---
// (kept for symmetry with apns.go)

var _ sync.Mutex // ensure sync is in the dep graph for future hot paths
