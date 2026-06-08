// APNs transport. Sends pushes to Apple's HTTP/2 gateway using
// token-based authentication (the .p8 key approach). This is
// preferred over the older .p12 certificate approach because
// keys are easier to rotate and provision.
//
// API docs we implement against:
//   https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
//
// We always use the "production" or "sandbox" gateway based on
// the relay's APNS_ENVIRONMENT setting. We do NOT auto-detect
// from the push token because that's a known footgun (Apple
// silently drops pushes sent to the wrong environment).
package transport

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/oauth2"
	"google.golang.org/api/option"

	// We deliberately use go-apns / sideshow/apns2 in
	// production. For this skeleton we hand-roll the JWT
	// signing + HTTP/2 call so the dependency surface is
	// visible. Replace with a real library once you wire up
	// an Apple Developer account.

	"github.com/quavon-dev/uptime-pocket-relay/internal/config"
)

// apnsHost is the APNs gateway. Apple uses two:
//   - api.push.apple.com (production)
//   - api.sandbox.push.apple.com (sandbox)
const (
	apnsHostProd    = "api.push.apple.com"
	apnsHostSandbox = "api.sandbox.push.apple.com"
	apnsPort        = 443
)

// APNsSender is the token-auth APNs implementation. It holds
// a long-lived HTTP/2 client and a cached JWT (we re-sign
// the JWT every ~50 minutes; Apple requires refresh every
// 60 minutes).
type APNsSender struct {
	cfg      config.APNsConfig
	client   *http.Client
	signKey  any // *ecdsa.PrivateKey
	host     string
	muJWT    sync.Mutex
	cachedJWT string
	cachedAt time.Time
}

// NewAPNsSender validates the .p8 key file and builds a sender.
// The .p8 is a one-line PEM file (ES256 algorithm). The team
// ID and key ID come from the Apple Developer portal.
func NewAPNsSender(cfg config.APNsConfig) (*APNsSender, error) {
	if !cfg.Enabled {
		return nil, errors.New("apns: not enabled in config")
	}
	keyBytes, err := os.ReadFile(cfg.KeyPath)
	if err != nil {
		return nil, fmt.Errorf("apns: read .p8: %w", err)
	}
	signKey, err := jwt.ParseECPrivateKeyFromPEM(keyBytes)
	if err != nil {
		return nil, fmt.Errorf("apns: parse .p8: %w", err)
	}

	host := apnsHostProd
	if cfg.Environment == "sandbox" {
		host = apnsHostSandbox
	}

	// Apple requires HTTP/2 with a long-lived connection. We
	// build an http.Transport that:
	//  - forces HTTP/2 (the Go default since 1.6)
	//  - keeps idle connections alive for 5 minutes
	//  - has a reasonable dial timeout
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{
			// Apple's gateway uses a well-known cert chain.
			// We trust the system pool; the default config
			// is fine.
		},
		IdleConnTimeout: 5 * time.Minute,
		MaxIdleConns:    10,
		DialContext: (&net.Dialer{
			Timeout: 10 * time.Second,
		}).DialContext,
	}
	client := &http.Client{
		Transport: tr,
		Timeout:   15 * time.Second,
	}

	return &APNsSender{
		cfg:     cfg,
		client:  client,
		signKey: signKey,
		host:    host,
	}, nil
}

func (s *APNsSender) Kind() Kind { return KindAPNs }

// Send delivers one alert to one push token.
func (s *APNsSender) Send(ctx context.Context, pushToken string, alert Alert) error {
	if pushToken == "" {
		return ErrInvalidToken
	}
	token, err := s.bearerToken()
	if err != nil {
		// JWT signing error is a misconfiguration, not transient.
		return fmt.Errorf("apns: sign jwt: %w", err)
	}

	body := apnsPayload{
		APS: apnsAps{
			Alert: apnsAlert{
				Title: alert.Title,
				Body:  alert.Body,
			},
			Sound: "default",
			Badge: 1,
		},
		// Custom fields. The app reads these to deep-link
		// straight to the affected monitor.
		Server:   alert.Server,
		Monitor:  alert.Monitor,
		From:     alert.From,
		To:       alert.To,
		Critical: alert.Critical,
		Count:    alert.Count,
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("apns: marshal payload: %w", err)
	}

	u := &url.URL{
		Scheme: "https",
		Host:   fmt.Sprintf("%s:%d", s.host, apnsPort),
		Path:   "/3/device/" + pushToken,
	}
	req, err := http.NewRequestWithContext(ctx, "POST", u.String(), bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("authorization", "bearer "+token)
	req.Header.Set("apns-topic", s.cfg.BundleID)
	// apns-push-type is required for iOS 13+. Alert pushes
	// must be "alert".
	req.Header.Set("apns-push-type", "alert")
	// apns-priority 10 = immediate; 5 = power-considerate.
	// 10 is what you want for a status change.
	req.Header.Set("apns-priority", "10")
	// apns-expiration: 0 = drop if undeliverable (status
	// change is stale in 5 minutes; don't deliver a "is
	// down" push for a problem the user already saw in
	// the app).
	req.Header.Set("apns-expiration", "0")

	resp, err := s.client.Do(req)
	if err != nil {
		// Network errors are always transient.
		return fmt.Errorf("%w: %v", ErrTransient, err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	switch resp.StatusCode {
	case 200:
		return nil
	case 400, 410:
		// 400 = bad request, 410 = unregistered. Both mean
		// the token is dead. Tell the caller to clean up.
		return fmt.Errorf("%w: %s", ErrInvalidToken, string(respBody))
	default:
		// 5xx and 403 (rate limit) are transient.
		return fmt.Errorf("%w: status=%d body=%s", ErrTransient, resp.StatusCode, string(respBody))
	}
}

// bearerToken returns a cached JWT or signs a new one if the
// cached one is older than 50 minutes. Apple rejects tokens
// older than 60 minutes.
func (s *APNsSender) bearerToken() (string, error) {
	s.muJWT.Lock()
	defer s.muJWT.Unlock()

	if s.cachedJWT != "" && time.Since(s.cachedAt) < 50*time.Minute {
		return s.cachedJWT, nil
	}

	claims := jwt.MapClaims{
		"iss": s.cfg.TeamID,
		"iat": time.Now().Unix(),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	t.Header["kid"] = s.cfg.KeyID
	signed, err := t.SignedString(s.signKey)
	if err != nil {
		return "", err
	}
	s.cachedJWT = signed
	s.cachedAt = time.Now()
	return signed, nil
}

// apnsPayload is the JSON body. The shape is fixed by Apple;
// see APNs docs for the aps dictionary keys.
type apnsPayload struct {
	APS apnsAps `json:"aps"`
	// Custom keys go at the top level. These are read by the
	// app when it receives a foreground push.
	Server   string `json:"server,omitempty"`
	Monitor  string `json:"monitor,omitempty"`
	From     string `json:"from,omitempty"`
	To       string `json:"to,omitempty"`
	Critical bool   `json:"critical,omitempty"`
	Count    int    `json:"count,omitempty"`
}

type apnsAps struct {
	Alert apnsAlert `json:"alert"`
	Sound string    `json:"sound,omitempty"`
	Badge int       `json:"badge,omitempty"`
}

type apnsAlert struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

// --- unused import suppression for the placeholder oauth/option ---
// (kept here to make the build green in skeleton mode; remove
// when you wire up FCM via firebase.google.com/go)

var _ = oauth2.NoContext
var _ = option.WithCredentialsFile
