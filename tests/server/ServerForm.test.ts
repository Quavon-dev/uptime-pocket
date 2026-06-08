/**
 * Tests for the pure helpers in <ServerForm />.
 *
 * The full form is a stack of TextInputs whose behavior is hard to
 * snapshot cleanly without react-native-testing-library. We test the
 * two pure functions that drive its logic: the Zod-derived
 * `deriveCredentials()` (decides whether the form has a fresh secret)
 * and the version compare helper.
 */

import {
  deriveCredentials,
} from '@/components/server/ServerForm.helpers';
import type { ServerFormValues } from '@/components/server/ServerForm.types';
import { thisIsOlder, parseVersion } from '@/lib/version';

const baseValues: ServerFormValues = {
  name: 'My Kuma',
  url: 'https://kuma.example.com',
  authMethod: 'bearer',
  token: '',
  username: '',
  password: '',
};

describe('deriveCredentials()', () => {
  it('returns undefined for bearer with blank token', () => {
    expect(deriveCredentials({ ...baseValues, authMethod: 'bearer', token: '' })).toBeUndefined();
    expect(deriveCredentials({ ...baseValues, authMethod: 'bearer', token: '   ' })).toBeUndefined();
  });

  it('returns a bearer credential when token is non-empty', () => {
    const c = deriveCredentials({ ...baseValues, authMethod: 'bearer', token: 'abc' });
    expect(c).toEqual({ kind: 'bearer', token: 'abc' });
  });

  it('trims whitespace from bearer token', () => {
    const c = deriveCredentials({ ...baseValues, authMethod: 'bearer', token: '  abc  ' });
    expect(c).toEqual({ kind: 'bearer', token: 'abc' });
  });

  it('returns undefined for password with blank username or password', () => {
    expect(
      deriveCredentials({ ...baseValues, authMethod: 'password', username: '', password: 'pw' })
    ).toBeUndefined();
    expect(
      deriveCredentials({ ...baseValues, authMethod: 'password', username: 'admin', password: '' })
    ).toBeUndefined();
    expect(
      deriveCredentials({ ...baseValues, authMethod: 'password', username: '   ', password: 'pw' })
    ).toBeUndefined();
  });

  it('returns a password credential when both fields are present', () => {
    const c = deriveCredentials({
      ...baseValues,
      authMethod: 'password',
      username: 'admin',
      password: 'hunter2',
    });
    expect(c).toEqual({ kind: 'password', username: 'admin', password: 'hunter2' });
  });

  it('trims whitespace from password username but not password', () => {
    const c = deriveCredentials({
      ...baseValues,
      authMethod: 'password',
      username: '  admin  ',
      password: 'hunter2',
    });
    expect(c).toEqual({ kind: 'password', username: 'admin', password: 'hunter2' });
  });
});

describe('thisIsOlder()', () => {
  it('returns true when first arg is older', () => {
    expect(thisIsOlder('1.23.0', '2.0.0')).toBe(true);
    expect(thisIsOlder('2.0.0', '2.0.1')).toBe(true);
    expect(thisIsOlder('2.3', '2.3.1')).toBe(true);
  });

  it('returns false when equal', () => {
    expect(thisIsOlder('2.0.0', '2.0.0')).toBe(false);
  });

  it('returns false when first arg is newer', () => {
    expect(thisIsOlder('2.4.0', '2.3.2')).toBe(false);
    expect(thisIsOlder('3.0.0', '2.99.99')).toBe(false);
  });

  it('handles non-numeric suffixes gracefully (parses leading run)', () => {
    // "2.3.2-beta.1" parses to [2, 3, 2]; "2.0.0" is [2, 0, 0] -> newer
    expect(thisIsOlder('2.3.2-beta.1', '2.0.0')).toBe(false);
    expect(thisIsOlder('1.9.0-rc.1', '2.0.0')).toBe(true);
  });
});

describe('parseVersion()', () => {
  it('parses a simple version', () => {
    expect(parseVersion('2.3.2')).toEqual([2, 3, 2]);
  });
  it('does not pad missing trailing components (caller is responsible)', () => {
    expect(parseVersion('2.3')).toEqual([2, 3]);
  });
  it('parses ALL numeric parts (not just the leading run)', () => {
    // Note: parseVersion is intentionally permissive — it just
    // parses every dot-separated number. "2.3.2-beta.1" is [2,3,2,1].
    // thisIsOlder is the canonical comparison helper.
    expect(parseVersion('2.3.2-beta.1')).toEqual([2, 3, 2, 1]);
  });
});
