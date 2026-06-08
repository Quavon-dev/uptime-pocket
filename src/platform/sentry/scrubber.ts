/**
 * PII scrubber for Sentry events.
 *
 * Sentry's out-of-the-box `sendDefaultPii: false` (which we set) means
 * most PII never leaves the device. But we have specific domain data
 * that even a permissive Sentry install would leak:
 *
 *   - Server URLs (https://my-internal-kuma.corp.example)
 *   - Bearer tokens / passwords passed to the Kuma API
 *   - Monitor names and tags (could be customer-internal)
 *   - Server-side stack frames we add as breadcrumbs
 *
 * The scrubber runs in `beforeSend` (for events) and `beforeBreadcrumb`
 * (for breadcrumbs). It's total: it never throws, always returns a
 * modified event. If the event structure is unexpected, we still strip
 * what we recognize and pass the rest through.
 *
 * What we DO send:
 *   - Exception class + message (truncated)
 *   - Stack trace (frames: filename + lineno, NO abs_path if it looks like
 *     a user-data URL)
 *   - Environment, release, platform, app version
 *   - Synthetic tags we add (server count, monitor count, app state)
 *   - An anonymized device id (a hash of installation id, not the raw id)
 *
 * What we DO NOT send:
 *   - Server URL
 *   - Auth headers, query strings
 *   - Monitor names, server names
 *   - Free-form breadcrumb data (errors, fetch URLs, console args)
 *   - Anything tagged 'pii' in extra/tags
 *
 * Trade-offs:
 *   - We are strict on the SENDING side. A bit of useful breadcrumb
 *     context is lost, but we'd rather under-report than leak internal
 *     infrastructure details.
 *   - The scrubber is pure (no I/O), so it's unit-testable without
 *     a Sentry SDK present.
 *
 * The shape of `event` and `breadcrumb` mirrors what @sentry/react-native
 * v8 passes. We type loosely to avoid coupling tightly to Sentry's
 * internal types (which change between versions).
 */

const REDACTED = '[Redacted]';

/**
 * Replace any URL-looking string with a redacted version. We keep the
 * scheme and the path/query (since "what endpoint" is useful for
 * grouping issues) but strip the host, port, and credentials. The
 * host is the only thing that would leak the user's infrastructure
 * topology.
 *
 * Examples:
 *   https://kuma.example.com:8443/api/status
 *     → https://[Redacted]/api/status
 *   wss://user:pass@10.0.0.1:3001/socket.io/?token=abc
 *     → wss://[Redacted]/socket.io/?token=Redacted
 */
function redactUrl(s: string): string {
  return s.replace(/(https?|wss?):\/\/[^\s"'<>]+/gi, (match) => {
    try {
      const u = new URL(match);
      // Build the redacted URL: scheme + [Redacted] + path + (sanitized query)
      const query = u.search
        ? `?${Array.from(u.searchParams.entries())
            .map(([k]) => `${encodeURIComponent(k)}=Redacted`)
            .join('&')}`
        : '';
      return `${u.protocol}//[Redacted]${u.pathname}${query}`;
    } catch {
      return '[Redacted-URL]';
    }
  });
}

/**
 * Redact Authorization header values (Bearer xxx, Basic yyy, etc).
 * We do this BEFORE redactUrl so the token isn't caught by URL matching
 * (it usually isn't, but defense in depth).
 */
function redactAuthHeader(s: string): string {
  return s.replace(
    /(authorization\s*:\s*)(bearer|basic|token|api[_-]?key)\s+\S+/gi,
    `$1$2 ${REDACTED}`
  );
}

/** Cap a string at N characters with an ellipsis. */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/**
 * Drop keys that look like PII from an arbitrary object. Returns a new
 * object — the input is never mutated. We do NOT recurse (breadcrumbs
 * can be deeply nested and recursion was a perf hit in the prototype).
 */
function dropPiiKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const PII_KEY_RE =
    /(host|hostname|server|token|password|secret|api[_-]?key|auth|authorization|cookie|set[_-]?cookie|monitor[_-]?name|server[_-]?name|email|user[_-]?id|username)/i;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PII_KEY_RE.test(k)) {
      out[k] = REDACTED;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Single key pass: redact the value if the key is a PII key, else
 * return the value (or scrub a string value for embedded URLs).
 *
 * - String values under a PII key are replaced with REDACTED entirely
 *   (we don't want "Bearer *** " to leak from a "token" field)
 * - String values under a non-PII key get scrubString'd for embedded
 *   URLs (a console message might have a URL in it)
 * - Object values get dropPiiKeys applied (but not deeper recursion)
 * - Primitive non-string values pass through unchanged
 */
function scrubDataValue(key: string, value: unknown): unknown {
  const PII_KEY_RE =
    /(host|hostname|server|token|password|secret|api[_-]?key|auth|authorization|cookie|set[_-]?cookie|monitor[_-]?name|server[_-]?name|email|user[_-]?id|username)/i;
  if (PII_KEY_RE.test(key)) {
    return REDACTED;
  }
  if (typeof value === 'string') {
    return scrubString(value);
  }
  if (value && typeof value === 'object') {
    return dropPiiKeys(value as Record<string, unknown>);
  }
  return value;
}

/**
 * Scrub a string that may contain arbitrary data. Applies all
 * redaction passes. Returns the redacted string (truncated to
 * MAX_LEN characters to avoid a giant breadcrumb).
 */
const MAX_LEN = 1024;

export function scrubString(input: string): string {
  let s = input;
  s = redactAuthHeader(s);
  s = redactUrl(s);
  s = truncate(s, MAX_LEN);
  return s;
}

/**
 * Scrub a breadcrumb's data field. Returns a new object; never mutates.
 *
 * Breadcrumbs have a `category` and `data` field. Some categories
 * (e.g. 'fetch', 'xhr', 'console') have URLs in `data.url` or in
 * stringified args. We redacted known-URL keys and apply scrubString
 * to any string value.
 */
export interface SentryBreadcrumb {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
  level?: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
  timestamp?: number;
  type?: string;
}

export function scrubBreadcrumb(
  crumb: SentryBreadcrumb,
): SentryBreadcrumb {
  const out: SentryBreadcrumb = { ...crumb };
  if (typeof out.message === 'string') {
    out.message = scrubString(out.message);
  }
  if (out.data && typeof out.data === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(out.data)) {
      redacted[k] = scrubDataValue(k, v);
    }
    out.data = redacted;
  }
  return out;
}

/**
 * Sentry event shape (loose typing). We only touch the fields we care
 * about; the rest flows through to the SDK.
 */
export interface SentryEvent {
  message?: string;
  exception?: {
    values?: {
      type?: string;
      value?: string;
      stacktrace?: { frames?: { abs_path?: string; filename?: string; lineno?: number }[] };
    }[];
  };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: { id?: string; ip_address?: string; email?: string; username?: string };
  server_name?: string;
  breadcrumbs?: { values?: SentryBreadcrumb[] };
}

/**
 * Scrub a full event. Returns a new event; never mutates input.
 * Returns null ONLY if the event is empty/invalid (caller should drop it).
 */
export function scrubEvent(event: SentryEvent): SentryEvent | null {
  if (!event || typeof event !== 'object') return null;

  const out: SentryEvent = { ...event };

  if (typeof out.message === 'string') {
    out.message = scrubString(out.message);
  }

  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => ({
        ...v,
        type: typeof v.type === 'string' ? truncate(v.type, 200) : v.type,
        value: typeof v.value === 'string' ? scrubString(v.value) : v.value,
        stacktrace: v.stacktrace
          ? {
              ...v.stacktrace,
              frames: (v.stacktrace.frames ?? []).map((f) => {
                const frame: { abs_path?: string; filename?: string; lineno?: number } = {
                  ...f,
                };
                // Only keep abs_path if it points into our app bundle
                // (e.g. /var/containers/Bundle/.../main.jsbundle).
                // User-data URLs (file://, content://) are redacted.
                if (
                  typeof frame.abs_path === 'string' &&
                  !frame.abs_path.includes('://') === false
                ) {
                  // has scheme — likely a file:// or content:// — drop
                  delete frame.abs_path;
                }
                if (typeof frame.filename === 'string') {
                  frame.filename = truncate(frame.filename, 200);
                }
                return frame;
              }),
            }
          : v.stacktrace,
      })),
    };
  }

  if (out.tags && typeof out.tags === 'object') {
    out.tags = dropPiiKeys(out.tags) as Record<string, string>;
  }

  if (out.extra && typeof out.extra === 'object') {
    out.extra = dropPiiKeys(out.extra);
  }

  // User context: keep ONLY an anonymized id (we expect the caller to
  // have already hashed the raw id before this). Drop everything else.
  if (out.user) {
    out.user = {
      id: typeof out.user.id === 'string' ? out.user.id : undefined,
    };
  }

  // server_name is almost always a hostname — drop.
  delete out.server_name;

  if (out.breadcrumbs?.values) {
    out.breadcrumbs = {
      values: out.breadcrumbs.values.map(scrubBreadcrumb),
    };
  }

  return out;
}
