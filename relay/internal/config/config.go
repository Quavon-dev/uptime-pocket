// Package config loads the relay's runtime configuration from
// environment variables. The defaults are designed to fail safe —
// a misconfigured relay won't accidentally send pushes, but
// will log loud and start the HTTP listener so you can diagnose.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds the resolved relay configuration. All fields are
// validated in Load(); if Load returns a non-nil error, do not
// start the relay.
type Config struct {
	// HTTP listener
	HTTPAddr string // ":8080" by default

	// Storage
	DBPath string // "relay.db" by default

	// API authentication
	APIKey string // required — devices send it as Bearer

	// Push transports. Both can be partially configured; a relay
	// running on a self-host without iOS push credentials still
	// works for Android, and vice versa. The relay refuses to
	// register a device whose platform has no transport configured.
	APNs   APNsConfig
	FCM    FCMConfig

	// Behavior
	CoalesceWindow time.Duration // "3+ down in N" -> single alert
	MinCoalesceN   int           // threshold for the coalesce rule

	// Logging
	LogLevel string // "debug" | "info" | "warn" | "error"
}

// APNsConfig is the iOS push transport configuration.
//
// We use token-based authentication (not certificate-based) because
// it's simpler to provision and rotate. You'll need:
//   - APNsKeyID: 10-character identifier from developer.apple.com
//   - APNsTeamID: 10-character team identifier
//   - APNsKeyPath: path to the .p8 file you downloaded
//   - APNsBundleID: your iOS bundle identifier
//   - APNsEnvironment: "production" or "sandbox"
type APNsConfig struct {
	Enabled      bool
	KeyID        string
	TeamID       string
	KeyPath      string
	BundleID     string
	Environment  string // "production" or "sandbox"
}

// FCMConfig is the Android push transport configuration.
//
// FCM HTTP v1 requires a service account (JSON file). The relay
// loads it once at startup and refreshes the OAuth2 access token
// on a schedule.
//
//   - ServiceAccountPath: path to the JSON key file
//   - ProjectID: your Firebase project ID
type FCMConfig struct {
	Enabled           bool
	ServiceAccountPath string
	ProjectID         string
}

// Load reads the config from the environment. It returns a
// validated Config or an error explaining what to fix.
func Load() (*Config, error) {
	c := &Config{
		HTTPAddr: getEnv("RELAY_HTTP_ADDR", ":8080"),
		DBPath:   getEnv("RELAY_DB_PATH", "relay.db"),
		APIKey:   os.Getenv("RELAY_API_KEY"),

		APNs: APNsConfig{
			KeyID:       os.Getenv("APNS_KEY_ID"),
			TeamID:      os.Getenv("APNS_TEAM_ID"),
			KeyPath:     os.Getenv("APNS_KEY_PATH"),
			BundleID:    os.Getenv("APNS_BUNDLE_ID"),
			Environment: getEnv("APNS_ENVIRONMENT", "production"),
		},
		FCM: FCMConfig{
			ServiceAccountPath: os.Getenv("FCM_SERVICE_ACCOUNT_PATH"),
			ProjectID:          os.Getenv("FCM_PROJECT_ID"),
		},

		CoalesceWindow: getDuration("RELAY_COALESCE_WINDOW", 30*time.Second),
		MinCoalesceN:   getInt("RELAY_COALESCE_MIN", 3),
		LogLevel:       getEnv("RELAY_LOG_LEVEL", "info"),
	}

	// APNs is "enabled" only if all four required fields are set.
	// We don't error if it's incomplete — that lets you run a
	// relay for Android-only users without an Apple Developer
	// account.
	c.APNs.Enabled = c.APNs.KeyID != "" &&
		c.APNs.TeamID != "" &&
		c.APNs.KeyPath != "" &&
		c.APNs.BundleID != ""

	// Same for FCM.
	c.FCM.Enabled = c.FCM.ServiceAccountPath != "" &&
		c.FCM.ProjectID != ""

	if err := c.validate(); err != nil {
		return nil, err
	}
	return c, nil
}

func (c *Config) validate() error {
	if c.APIKey == "" {
		return errors.New("RELAY_API_KEY is required (any random 32+ char string)")
	}
	if len(c.APIKey) < 16 {
		return errors.New("RELAY_API_KEY must be at least 16 characters")
	}
	if c.HTTPAddr == "" {
		return errors.New("RELAY_HTTP_ADDR cannot be empty")
	}
	if c.CoalesceWindow < 0 {
		return errors.New("RELAY_COALESCE_WINDOW cannot be negative")
	}
	if c.MinCoalesceN < 1 {
		return errors.New("RELAY_COALESCE_MIN must be at least 1")
	}
	if c.APNs.Enabled {
		if c.APNs.Environment != "production" && c.APNs.Environment != "sandbox" {
			return fmt.Errorf("APNS_ENVIRONMENT must be 'production' or 'sandbox', got %q", c.APNs.Environment)
		}
		if _, err := os.Stat(c.APNs.KeyPath); err != nil {
			return fmt.Errorf("APNS_KEY_PATH %q is not readable: %w", c.APNs.KeyPath, err)
		}
	}
	if c.FCM.Enabled {
		if _, err := os.Stat(c.FCM.ServiceAccountPath); err != nil {
			return fmt.Errorf("FCM_SERVICE_ACCOUNT_PATH %q is not readable: %w", c.FCM.ServiceAccountPath, err)
		}
	}
	if !c.APNs.Enabled && !c.FCM.Enabled {
		// Not fatal: a relay can be started for development /
		// debugging without push credentials. We'll log a warning
		// at startup so the operator notices.
	}
	switch strings.ToLower(c.LogLevel) {
	case "debug", "info", "warn", "error":
		// ok
	default:
		return fmt.Errorf("RELAY_LOG_LEVEL must be one of debug/info/warn/error, got %q", c.LogLevel)
	}
	return nil
}

// HasAnyTransport returns true if at least one push transport
// is configured. The relay is useless without one, but we
// don't enforce that here — let the caller decide whether to
// log a warning and continue, or refuse to start.
func (c *Config) HasAnyTransport() bool {
	return c.APNs.Enabled || c.FCM.Enabled
}

// Summary is the part of the config that the /v1/health endpoint
// returns. We deliberately omit the secrets (API key, key paths).
type Summary struct {
	APNsEnabled        bool   `json:"apnsEnabled"`
	APNsEnvironment    string `json:"apnsEnvironment,omitempty"`
	FCMEnabled         bool   `json:"fcmEnabled"`
	CoalesceWindowMs   int64  `json:"coalesceWindowMs"`
	CoalesceMinN       int    `json:"coalesceMinN"`
}

// Summary returns a public, secret-free view of the config.
func (c *Config) Summary() Summary {
	s := Summary{
		APNsEnabled:      c.APNs.Enabled,
		APNsEnvironment:  c.APNs.Environment,
		FCMEnabled:       c.FCM.Enabled,
		CoalesceWindowMs: c.CoalesceWindow.Milliseconds(),
		CoalesceMinN:     c.MinCoalesceN,
	}
	return s
}

func getEnv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func getInt(k string, def int) int {
	v := os.Getenv(k)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func getDuration(k string, def time.Duration) time.Duration {
	v := os.Getenv(k)
	if v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return def
	}
	return d
}

func getFloat(k string, def float64) float64 {
	v := os.Getenv(k)
	if v == "" {
		return def
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return def
	}
	return f
}
