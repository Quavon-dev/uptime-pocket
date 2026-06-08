/**
 * Sentry integration.
 *
 * This is the only public entrypoint for the rest of the app. The
 * pattern is:
 *
 *   1. Call `initSentry({ userOptIn })` exactly once at app start, BEFORE
 *      importing Sentry-touching code. If the user has not opted in or
 *      no DSN is set, this is a no-op (no SDK loaded).
 *
 *   2. Wrap the root with `wrapWithSentry(<App />)`. If Sentry is off,
 *      this is identity (returns the same element).
 *
 *   3. Use `captureException(err, { tags })` for caught errors. If
 *      Sentry is off, this is `console.warn` and a no-op.
 *
 * The SDK is loaded lazily on first init — we don't pay the bundle
 * cost if the user never opts in.
 *
 * Why not always load the SDK and gate at the Sentry level?
 *   - The SDK adds ~150 KB of JS to the bundle even if we never call
 *     any Sentry.* method. For a privacy-focused app, we'd rather
 *     not even download the SDK on opted-out installs.
 *   - Lazy import means the Sentry dependency is tree-shaken from
 *     bundles that have `EXPO_PUBLIC_SENTRY_DSN` unset.
 */

import type { ComponentType } from 'react';
import type * as SentryTypes from '@sentry/react-native';
import type { Event as CoreEvent, Breadcrumb as CoreBreadcrumb, EventHint as CoreEventHint } from '@sentry/core';
import { scrubEvent, scrubBreadcrumb, type SentryEvent, type SentryBreadcrumb } from './scrubber';
import {
  isSentryConfigured,
  getSentryDsn,
  getSentryEnvironment,
  getSentryRelease,
  getSentryTracesSampleRate,
  getSentryReplaysSampleRate,
} from './config';

let sentryInitialized = false;
let sentrySdk: typeof SentryTypes | null = null;

/**
 * Lightweight status, queryable from the UI to show "Sentry is on/off"
 * in settings.
 */
export function isSentryActive(): boolean {
  return sentryInitialized;
}

/**
 * Initialize the Sentry SDK. Safe to call multiple times; subsequent
 * calls are no-ops.
 *
 * @param opts.userOptIn - whether the user has explicitly enabled
 *   crash reporting in settings. We require an explicit opt-in: if
 *   this is false (or omitted), we do NOT init even if the DSN is
 *   set. The DSN only allows the app to talk to Sentry; the opt-in
 *   decides whether we DO talk to Sentry.
 */
export interface SentryInitOptions {
  userOptIn?: boolean;
}

export function initSentry(opts: SentryInitOptions = {}): void {
  if (sentryInitialized) return;

  if (!isSentryConfigured()) {
    if (__DEV__) {
      console.log('[sentry] DSN not set, skipping init');
    }
    return;
  }

  if (!opts.userOptIn) {
    if (__DEV__) {
      console.log('[sentry] user has not opted in, skipping init');
    }
    return;
  }

  // Lazy import so the SDK is not bundled when not used.
  // (We do not catch the import error here — if Sentry is missing,
  // that's a build problem, not a runtime concern.)
  const Sentry = require('@sentry/react-native') as typeof SentryTypes;
  sentrySdk = Sentry;

  Sentry.init({
    dsn: getSentryDsn(),
    environment: getSentryEnvironment(),
    release: getSentryRelease(),
    // PII disabled at the SDK level. We additionally scrub in beforeSend.
    sendDefaultPii: false,
    // Sample rates
    tracesSampleRate: getSentryTracesSampleRate(),
    replaysSessionSampleRate: getSentryReplaysSampleRate(),
    replaysOnErrorSampleRate: 0,
    // PII scrubbers. Sentry's types for beforeSend are strict, so we
    // narrow via a cast here; the runtime behavior matches.
    beforeSend: ((event: CoreEvent, _hint: CoreEventHint) => {
      return scrubEvent(event as unknown as SentryEvent) as unknown as CoreEvent | null;
    }) as SentryTypes.ReactNativeOptions['beforeSend'],
    beforeBreadcrumb: ((crumb: CoreBreadcrumb, _hint?: unknown) => {
      return scrubBreadcrumb(crumb as unknown as SentryBreadcrumb) as unknown as CoreBreadcrumb | null;
    }) as SentryTypes.ReactNativeOptions['beforeBreadcrumb'],
  });

  sentryInitialized = true;
  if (__DEV__) {
    console.log('[sentry] initialized');
  }
}

/**
 * Capture an exception. Always safe to call; no-op if Sentry is off.
 * Returns undefined; the v8 SDK's captureException returns void.
 */
export function captureException(
  err: unknown,
  context?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  if (!sentrySdk || !sentryInitialized) {
    // We still log in dev so the developer sees the error.
    if (__DEV__) {
      console.warn('[sentry:off] would capture:', err);
    }
    return;
  }
  const Sentry = sentrySdk;
  if (context?.tags || context?.extra) {
    Sentry.withScope((scope) => {
      if (context.tags) {
        for (const [k, v] of Object.entries(context.tags)) {
          scope.setTag(k, v);
        }
      }
      if (context.extra) {
        scope.setExtras(context.extra);
      }
      Sentry.captureException(err);
    });
  } else {
    Sentry.captureException(err);
  }
}

/**
 * Wrap a component tree with Sentry's error boundary. Returns the
 * input unchanged if Sentry is not active, so this can be called
 * unconditionally at the root.
 */
export function wrapWithSentry<P extends object>(
  Component: ComponentType<P>,
): ComponentType<P> {
  if (!sentrySdk || !sentryInitialized) return Component;
  // Sentry.wrap() returns a component with a wider prop type (P &
  // additional Sentry props). The caller doesn't need those, so we
  // cast. This is a small type-widening, not a behavior change.
  return sentrySdk.wrap(Component as ComponentType<Record<string, unknown>>) as unknown as ComponentType<P>;
}

/**
 * Add a breadcrumb. No-op if Sentry is not active.
 */
export function addBreadcrumb(crumb: {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
  level?: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
}): void {
  if (!sentrySdk || !sentryInitialized) return;
  sentrySdk.addBreadcrumb(crumb);
}

/**
 * Convenience for React error boundaries. Sets a tag + captures
 * the error. Use in componentDidCatch.
 */
export function captureComponentError(
  err: Error,
  componentStack: string,
  componentName?: string,
): void {
  captureException(err, {
    tags: {
      boundary: componentName ?? 'unknown',
      kind: 'react',
    },
    extra: {
      componentStack: componentStack.slice(0, 1024),
    },
  });
}

export { scrubEvent, scrubBreadcrumb } from './scrubber';
export { isSentryConfigured } from './config';
export type { SentryEvent, SentryBreadcrumb } from './scrubber';
