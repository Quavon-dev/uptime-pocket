/**
 * Settings store.
 *
 * App-level settings that aren't tied to a specific server:
 * - theme: light | dark | system
 * - accentColor: brand color override
 * - biometricLock: require Face ID / fingerprint
 * - quietHours: { enabled, startMinute, endMinute }
 *
 * NOTE: Phase 0 keeps settings in-memory. Persistence to
 * expo-secure-store / expo-sqlite will be added in Phase 2
 * when we need to persist server credentials anyway.
 */

import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface QuietHours {
  enabled: boolean;
  startMinute: number; // 0-1439
  endMinute: number;
}

interface SettingsState {
  theme: ThemeMode;
  accentColor: string | null; // null = use brand
  biometricLock: boolean;
  quietHours: QuietHours;
  hasOnboarded: boolean;

  setTheme: (t: ThemeMode) => void;
  setAccentColor: (c: string | null) => void;
  setBiometricLock: (enabled: boolean) => void;
  setQuietHours: (q: QuietHours) => void;
  setOnboarded: (v: boolean) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  theme: 'system',
  accentColor: null,
  biometricLock: false,
  quietHours: { enabled: false, startMinute: 22 * 60, endMinute: 7 * 60 },
  hasOnboarded: false,

  setTheme: (theme) => set({ theme }),
  setAccentColor: (accentColor) => set({ accentColor }),
  setBiometricLock: (biometricLock) => set({ biometricLock }),
  setQuietHours: (quietHours) => set({ quietHours }),
  setOnboarded: (hasOnboarded) => set({ hasOnboarded }),
}));
