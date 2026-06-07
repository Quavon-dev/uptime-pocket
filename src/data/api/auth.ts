/**
 * Auth strategies for Kuma.
 *
 * Two strategies are supported:
 * - bearer: a long-lived API token (Kuma 2.0+) - preferred
 * - password: username + password (Kuma 1.x or user preference)
 *
 * Each strategy produces a session that knows how to authenticate
 * REST requests and socket.io handshakes.
 */

import type { AuthStrategy } from '@/domain/models';

export interface AuthSession {
  /** Apply auth headers to a fetch request */
  applyHeaders(headers: Headers): void;

  /** Apply auth payload to a socket.io connection */
  applySocketAuth(payload: Record<string, unknown>): Record<string, unknown>;

  /** Whether the session has expired and needs refresh */
  isExpired(): boolean;

  /** Refresh the session if possible (only password-based) */
  refresh?(): Promise<void>;

  /** Strategy kind for debugging */
  readonly kind: 'bearer' | 'password';
}

export class BearerSession implements AuthSession {
  readonly kind = 'bearer' as const;
  constructor(private token: string) {}

  applyHeaders(headers: Headers): void {
    headers.set('Authorization', `Bearer ${this.token}`);
  }

  applySocketAuth(payload: Record<string, unknown>): Record<string, unknown> {
    return { ...payload, auth: { token: this.token } };
  }

  isExpired(): boolean {
    return false; // Bearer tokens are valid until revoked
  }
}

export class PasswordSession implements AuthSession {
  readonly kind = 'password' as const;
  private token: string | null = null;
  private tokenExpiresAt: number | null = null;

  constructor(
    private username: string,
    private password: string,
    private baseUrl: string
  ) {}

  async refresh(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: this.username,
        password: this.password,
      }),
    });

    if (!res.ok) {
      throw new Error(`Login failed: ${res.status}`);
    }

    const data = await res.json();
    if (!data.token) {
      throw new Error('Login response missing token');
    }

    this.token = data.token;
    // Kuma tokens are JWTs with exp claim; we trust the server's expiry
    // (default 1 hour). Decode and store expiry.
    this.tokenExpiresAt = this.decodeJwtExpiry(data.token);
  }

  applyHeaders(headers: Headers): void {
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
  }

  applySocketAuth(payload: Record<string, unknown>): Record<string, unknown> {
    if (this.token) {
      return { ...payload, auth: { token: this.token } };
    }
    return payload;
  }

  isExpired(): boolean {
    if (!this.tokenExpiresAt) return true;
    return Date.now() > this.tokenExpiresAt - 30_000; // refresh 30s early
  }

  private decodeJwtExpiry(token: string): number | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
      );
      if (typeof payload.exp === 'number') {
        return payload.exp * 1000;
      }
    } catch {
      return null;
    }
    return null;
  }
}

export function createSession(
  strategy: AuthStrategy,
  baseUrl: string
): AuthSession {
  switch (strategy.kind) {
    case 'bearer':
      return new BearerSession(strategy.token);
    case 'password':
      return new PasswordSession(strategy.username, strategy.password, baseUrl);
  }
}
