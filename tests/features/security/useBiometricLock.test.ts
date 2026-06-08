/**
 * Tests for the pure status-machine helpers in useBiometricLock.
 *
 * The React hook itself is exercised manually in the simulator — we
 * test the state-transition rules here without rendering React.
 */

// Mock the expo-local-authentication module BEFORE importing the hook,
// so the import doesn't try to access native code.
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
}));

import {
  biometryLabel,
  probeLockStatus,
} from '@/features/security/useBiometricLock';

describe('biometryLabel()', () => {
  it('returns "Face ID" for facial recognition', () => {
    expect(biometryLabel(2 /* FACIAL_RECOGNITION */)).toBe('Face ID');
  });

  it('returns "Touch ID" for fingerprint', () => {
    expect(biometryLabel(1 /* FINGERPRINT */)).toBe('Touch ID');
  });

  it('returns "Iris" for iris', () => {
    expect(biometryLabel(3 /* IRIS */)).toBe('Iris');
  });

  it('returns null for unknown / null', () => {
    expect(biometryLabel(null)).toBeNull();
    expect(biometryLabel(99 as unknown as never)).toBeNull();
  });
});

describe('probeLockStatus()', () => {
  it('returns "disabled" when enabled=false, regardless of device', async () => {
    const result = await probeLockStatus(false, false, [], false);
    expect(result).toBe('disabled');
  });

  it('returns "unavailable" when no hardware', async () => {
    const result = await probeLockStatus(false, true, [1], true);
    expect(result).toBe('unavailable');
  });

  it('returns "unavailable" when no enrollment', async () => {
    const result = await probeLockStatus(true, false, [1], true);
    expect(result).toBe('unavailable');
  });

  it('returns "unavailable" when no supported types', async () => {
    const result = await probeLockStatus(true, true, [], true);
    expect(result).toBe('unavailable');
  });

  it('returns "locked" when everything checks out', async () => {
    const result = await probeLockStatus(true, true, [2], true);
    expect(result).toBe('locked');
  });
});
