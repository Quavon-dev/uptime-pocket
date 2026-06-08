/**
 * Config tests for the Sentry env-var reader.
 *
 * These tests cover the gate conditions: if the DSN isn't set, we
 * never call Sentry.init. The settings store and the opt-in flag
 * are tested separately.
 */

import {
  isSentryConfigured,
  getSentryDsn,
  getSentryEnvironment,
  getSentryTracesSampleRate,
  getSentryReplaysSampleRate,
} from '../config';

describe('isSentryConfigured', () => {
  it('returns false when EXPO_PUBLIC_SENTRY_DSN is unset', () => {
    const original = process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    expect(isSentryConfigured()).toBe(false);
    if (original !== undefined) process.env.EXPO_PUBLIC_SENTRY_DSN = original;
  });

  it('returns false when EXPO_PUBLIC_SENTRY_DSN is empty string', () => {
    const original = process.env.EXPO_PUBLIC_SENTRY_DSN;
    process.env.EXPO_PUBLIC_SENTRY_DSN = '';
    expect(isSentryConfigured()).toBe(false);
    if (original !== undefined) process.env.EXPO_PUBLIC_SENTRY_DSN = original;
  });

  it('returns true when EXPO_PUBLIC_SENTRY_DSN is set', () => {
    const original = process.env.EXPO_PUBLIC_SENTRY_DSN;
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://key@sentry.io/123';
    expect(isSentryConfigured()).toBe(true);
    if (original !== undefined) {
      process.env.EXPO_PUBLIC_SENTRY_DSN = original;
    } else {
      delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    }
  });
});

describe('getSentryDsn', () => {
  it('returns empty string when unset', () => {
    const original = process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    expect(getSentryDsn()).toBe('');
    if (original !== undefined) process.env.EXPO_PUBLIC_SENTRY_DSN = original;
  });

  it('returns the DSN when set', () => {
    const original = process.env.EXPO_PUBLIC_SENTRY_DSN;
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://abc@sentry.io/1';
    expect(getSentryDsn()).toBe('https://abc@sentry.io/1');
    if (original !== undefined) {
      process.env.EXPO_PUBLIC_SENTRY_DSN = original;
    } else {
      delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    }
  });
});

describe('getSentryEnvironment', () => {
  it('uses EXPO_PUBLIC_SENTRY_ENVIRONMENT when set', () => {
    const original = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT;
    process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT = 'staging';
    expect(getSentryEnvironment()).toBe('staging');
    if (original !== undefined) {
      process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT = original;
    } else {
      delete process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT;
    }
  });

  it('ignores empty EXPO_PUBLIC_SENTRY_ENVIRONMENT', () => {
    const original = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT;
    process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT = '';
    const result = getSentryEnvironment();
    // Either 'development' (in __DEV__) or 'production' (in release)
    expect(['development', 'production']).toContain(result);
    if (original !== undefined) {
      process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT = original;
    } else {
      delete process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT;
    }
  });
});

describe('sample rates', () => {
  it('traces sample rate is between 0 and 1', () => {
    const r = getSentryTracesSampleRate();
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('replays sample rate is 0 (no session replay in v1)', () => {
    expect(getSentryReplaysSampleRate()).toBe(0);
  });
});
