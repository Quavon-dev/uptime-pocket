/**
 * Type-only sidecar for <ServerForm />. Exists so that the pure
 * helper functions can be imported in tests without dragging in the
 * form component (which transitively imports reanimated and other
 * native-only modules).
 *
 * Keep this file 100% types — no runtime code, no React imports.
 */

import type { AuthStrategy } from '@/domain/models';

export interface ServerFormValues {
  name: string;
  url: string;
  username: string;
  password: string;
}

export interface ServerFormSubmit {
  values: ServerFormValues;
  /**
   * New credentials if the user typed any, else `undefined`. Parents
   * should call `updateServer(..., undefined)` to leave the existing
   * Keychain entry alone.
   */
  credentials: AuthStrategy | undefined;
}
