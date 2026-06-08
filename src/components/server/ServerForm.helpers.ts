/**
 * Pure helpers for the server form, kept in a sidecar module so unit
 * tests can import them WITHOUT pulling in the React Native renderer
 * (reanimated, etc.) that the form component transitively imports.
 *
 * Re-exported from ServerForm for ergonomic use in the screens.
 */

import type { AuthStrategy } from '@/domain/models';
import type { ServerFormValues } from './ServerForm.types';

export type { ServerFormValues, ServerFormSubmit } from './ServerForm.types';

/**
 * Decide whether the form contains a new secret the user wants to save.
 *
 * Returns `undefined` when the secret field(s) for the chosen auth
 * method are blank — this signals to the parent screen that the
 * existing Keychain entry should be preserved.
 *
 * Trims whitespace from bearer tokens and password usernames, but
 * does NOT trim passwords (trailing whitespace is legal in some
 * passwords and we shouldn't be opinionated about it).
 */
export function deriveCredentials(
  values: ServerFormValues
): AuthStrategy | undefined {
  if (values.authMethod === 'bearer') {
    if (values.token.trim().length === 0) return undefined;
    return { kind: 'bearer', token: values.token.trim() };
  }
  // password
  if (values.username.trim().length === 0 || values.password.length === 0) {
    return undefined;
  }
  return {
    kind: 'password',
    username: values.username.trim(),
    password: values.password,
  };
}
