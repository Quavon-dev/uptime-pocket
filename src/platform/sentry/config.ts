/**
 * Sentry configuration.
 *
 * The two env vars that gate the entire Sentry integration are:
 *
 *   EXPO_PUBLIC_SENTRY_DSN         — required for anything to be sent
 *                                    (Sentry project DSN from sentry.io or
 *                                    a self-hosted instance). If this is
 *                                    empty/undefined, the rest of the
 *                                    module is a no-op: initSentry() does
 *                                    nothing, captureException() is a
 *                                    no-op, wrapWithSentry() is identity.
 *
 *   EXPO_PUBLIC_SENTRY_ENVIRONMENT  — optional, defaults to 'production'
 *                                    in release builds and 'development'
 *                                    in __DEV__.
 *
 *   EXPO_PUBLIC_SENTRY_RELEASE     — optional, sentry will set this from
 *                                    expo-constants if not provided.
 *
 * The opt-in/opt-out toggle is a USER setting, not an env var, and lives
 * in the settings store (see setSentryEnabled). The user must explicitly
 * enable crash reporting. We do NOT default it on.
 *
 * Why env-gated, not always-on:
 *   - Sentry SDK adds ~150 KB to bundle size
 *   - Debug builds would spam Sentry with noise
 *   - The user must opt-in for privacy (GDPR, etc)
 */

import Constants from 'expo-constants';

/** True iff Sentry is configured via env vars. User opt-in is a separate flag. */
export function isSentryConfigured(): boolean {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  return typeof dsn === 'string' && dsn.length > 0;
}

/** Return the DSN, or empty string if not configured. */
export function getSentryDsn(): string {
  return process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
}

/**
 * Determine the environment string sent with each event.
 *
 * - In __DEV__ we tag 'development' so Sentry's release filtering can
 *   separate prod issues from local dev.
 * - In release builds, we tag 'production' unless the user set
 *   EXPO_PUBLIC_SENTRY_ENVIRONMENT.
 * - For EAS preview builds (e.g. 'preview', 'staging'), the build
 *   profile name flows through EXPO_PUBLIC_SENTRY_ENVIRONMENT so issues
 *   can be filtered to a profile.
 */
export function getSentryEnvironment(): string {
  const fromEnv = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return __DEV__ ? 'development' : 'production';
}

/**
 * Return the release identifier. Sentry uses this to group issues
 * across versions. We prefer the EAS-style `{bundleId}@{runtimeVersion}`
 * shape so crashes in the same code version are grouped regardless of
 * device OS.
 */
export function getSentryRelease(): string | undefined {
  const fromEnv = process.env.EXPO_PUBLIC_SENTRY_RELEASE;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const { manifest } = Constants;
  if (!manifest) return undefined;
  const { version, iosBundleIdentifier, androidPackage } = manifest as {
    version?: string;
    iosBundleIdentifier?: string;
    androidPackage?: string;
  };
  const id = iosBundleIdentifier ?? androidPackage;
  if (typeof id === 'string' && typeof version === 'string') {
    return `${id}@${version}`;
  }
  return undefined;
}

/**
 * Sample rate for transactions. Lower than 1.0 in production to keep
 * volume reasonable; 1.0 in dev so we see everything.
 */
export function getSentryTracesSampleRate(): number {
  return __DEV__ ? 1.0 : 0.1;
}

/**
 * Sample rate for replays. 0 = no replays (we don't use session replay
 * for v1). Keep the value documented here in case we add it later.
 */
export function getSentryReplaysSampleRate(): number {
  return 0;
}
