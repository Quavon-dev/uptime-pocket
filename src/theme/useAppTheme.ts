/**
 * useAppTheme — the single source of truth for "what theme should the
 * app render right now".
 *
 * Combines the user's `theme` preference (System / Light / Dark) with
 * the system color scheme, then returns the active surface palette
 * plus a few helpers.
 *
 * Usage in a component:
 *
 *   const { surface, isDark, tokens } = useAppTheme();
 *   return <View style={{ backgroundColor: surface.background }} />;
 *
 * `tokens` is a small bag of "current theme" derived values (overlay
 * for modals, the right text/border/background pair for a sunken tile)
 * so callers don't have to hand-merge surface fields everywhere.
 *
 * Why a hook + not a Context: the underlying value is derived from
 * Zustand (`useSettings.theme`) + `useColorScheme()`. Both already
 * subscribe correctly, and a hook gives us a stable per-render value
 * without needing a Provider wrapper. The cost: every screen must
 * call this once at the top, which is what we want anyway.
 */

import { useColorScheme } from 'react-native';
import { useMemo } from 'react';

import { useSettings } from '@/data/store/settings';
import { colors } from './colors';

export type SurfacePalette = (typeof colors.surface)['light'] | (typeof colors.surface)['dark'];

export interface AppTheme {
  /** Active palette: colors.surface.light or colors.surface.dark */
  surface: SurfacePalette;
  /** Convenience: `true` when the active palette is dark */
  isDark: boolean;
  /** The raw preference (system / light / dark) */
  preference: 'system' | 'light' | 'dark';
  /** Brand color: lighter green in dark mode for AA contrast on dark surfaces */
  brand: string;
  /** Brand-50 translucent fill (icons boxes, etc.) */
  brandFill: string;
  /** Overlay color (modals, scrims) */
  overlay: string;
  /**
   * Convenience bag of pre-computed tints/overlays for common status
   * colors so callers can render tinted backgrounds/borders without
   * doing the `${color}1A` string-concat dance inline.
   */
  statusTints: {
    up: { bg: string; border: string };
    down: { bg: string; border: string };
    pending: { bg: string; border: string };
    maintenance: { bg: string; border: string };
    paused: { bg: string; border: string };
  };
}

export function useAppTheme(): AppTheme {
  const preference = useSettings((s) => s.theme);
  const systemScheme = useColorScheme();

  return useMemo(() => {
    const isDark =
      preference === 'dark' || (preference === 'system' && systemScheme === 'dark');

    const surface = isDark ? colors.surface.dark : colors.surface.light;
    const brand = isDark ? colors.brand[400] : colors.brand[500];
    const brandFill = isDark ? `${colors.brand[400]}1A` : `${colors.brand[500]}1A`;
    const overlay = isDark ? colors.overlay.dark : colors.overlay.light;

    // 1A = 10% alpha (for backgrounds), 40 = 25% alpha (for borders).
    // These are the tints we use across status banners + icon boxes.
    const tint = (c: string) => ({ bg: `${c}1A`, border: `${c}40` });

    return {
      surface,
      isDark,
      preference,
      brand,
      brandFill,
      overlay,
      statusTints: {
        up: tint(colors.status.up),
        down: tint(colors.status.down),
        pending: tint(colors.status.pending),
        maintenance: tint(colors.status.maintenance),
        paused: tint(colors.status.paused),
      },
    };
  }, [preference, systemScheme]);
}
