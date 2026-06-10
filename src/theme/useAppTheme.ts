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
 *   const { surface, isDark, brand } = useAppTheme();
 *   return <View style={{ backgroundColor: surface.background }} />;
 *
 * Why a hook + not a Context: the underlying value is derived from
 * Zustand (`useSettings`) + `useColorScheme()`. Both already
 * subscribe correctly, and a hook gives us a stable per-render value
 * without needing a Provider wrapper. The cost: every screen must
 * call this once at the top, which is what we want anyway.
 *
 * Accent color (status quo)
 * -------------------------
 * The user picks an accent in Settings (one of seven swatches in
 * `src/theme/swatches.ts`). We resolve it to a single hex and use
 * it as `brand` (buttons, links, focused state, chart avg line,
 * and the kuma-ping palette). The other brand stops (50..950) in
 * `colors.brand` are intentionally NOT recomputed per swatch —
 * they're a static design-system palette and only the primary
 * `brand` and its translucent fill react to the picker. The full
 * 11-stop palette stays on emerald for everything else.
 *
 * "Accent affects status" toggle
 * ------------------------------
 * The "up" status color can optionally follow the picked accent
 * (so a Rose accent turns the green "up" dot rose). The toggle
 * lives in the settings store as `accentAffectsStatus` (default
 * false). When on, `statusTints.up` and the `status.up` field
 * resolve to the active brand; the other four status colors
 * stay on their static semantic palette (down/pending/
 * maintenance/paused) regardless of the toggle — the accent is
 * for brand chrome, not for health signals.
 */

import { useColorScheme } from 'react-native';
import { useMemo } from 'react';

import { useSettings } from '@/data/store/settings';
import { colors } from './colors';
import { findSwatch } from './swatches';

export type SurfacePalette = (typeof colors.surface)['light'] | (typeof colors.surface)['dark'];

export interface AppTheme {
  /** Active palette: colors.surface.light or colors.surface.dark */
  surface: SurfacePalette;
  /** Convenience: `true` when the active palette is dark */
  isDark: boolean;
  /** The raw preference (system / light / dark) */
  preference: 'system' | 'light' | 'dark';
  /**
   * The active accent color (the user-picked swatch's brand hex,
   * or the static emerald fallback). This is the single value
   * that drives the "brand" surface: buttons, links, focused
   * state, chart avg line, and (when the
   * `accentAffectsStatus` toggle is on) the "up" status color.
   */
  brand: string;
  /** Brand-50 translucent fill (icons boxes, etc.) */
  brandFill: string;
  /**
   * The fully-resolved status colors for this render. When the
   * `accentAffectsStatus` toggle is on, `up` equals `brand`; when
   * off (the default), `up` equals the static `colors.status.up`.
   * The other four (down/pending/maintenance/paused) are
   * unaffected by the toggle — they stay on the static semantic
   * palette so "down" always reads as red.
   */
  status: {
    up: string;
    down: string;
    pending: string;
    maintenance: string;
    paused: string;
  };
  /** Overlay color (modals, scrims) */
  overlay: string;
  /**
   * Convenience bag of pre-computed tints/overlays for common status
   * colors so callers can render tinted backgrounds/borders without
   * doing the `${color}1A` string-concat dance inline. The `up`
   * tint follows the `accentAffectsStatus` toggle; the other four
   * stay on the static palette.
   */
  statusTints: {
    up: { bg: string; border: string };
    down: { bg: string; border: string };
    pending: { bg: string; border: string };
    maintenance: { bg: string; border: string };
    paused: { bg: string; border: string };
  };
}

/**
 * Resolve the user's accent pick into a single hex string.
 *
 * The settings store carries both `accentColor` (raw hex, the
 * canonical record of what's persisted) and `accentSwatchId` (the
 * stable id, used to look up name/fill in `ACCENT_SWATCHES`).
 * Either can be set, both can be null, or they can be inconsistent
 * (a stale swatch id pointing to a swatch that's been removed).
 *
 * Resolution order:
 *   1. If `accentColor` is a non-empty hex string, use it.
 *   2. Else if `accentSwatchId` matches a current swatch, use
 *      that swatch's `brand` hex.
 *   3. Else fall back to the default swatch's `brand` hex
 *      (currently emerald-500, #10B981).
 *
 * Extracted as a pure helper so the theme hook and the test
 * suite can call the same code path.
 */
export function resolveBrand(
  accentColor: string | null,
  accentSwatchId: string | null
): string {
  if (accentColor && accentColor.trim() !== '') {
    return accentColor;
  }
  return findSwatch(accentSwatchId).brand;
}

export function useAppTheme(): AppTheme {
  const preference = useSettings((s) => s.theme);
  const accentColor = useSettings((s) => s.accentColor);
  const accentSwatchId = useSettings((s) => s.accentSwatchId);
  const accentAffectsStatus = useSettings((s) => s.accentAffectsStatus);
  const systemScheme = useColorScheme();

  return useMemo(() => {
    const isDark =
      preference === 'dark' || (preference === 'system' && systemScheme === 'dark');

    const surface = isDark ? colors.surface.dark : colors.surface.light;

    // The accent the user picked. When the user has not picked
    // one (fresh install), this is the default emerald hex from
    // the default swatch.
    const pickedBrand = resolveBrand(accentColor, accentSwatchId);

    // The brand color used for chrome (buttons, links, focused
    // state, chart avg line). We use the picked hex on both
    // light and dark surfaces — the static emerald default
    // (#10B981) reads well in both modes (AA contrast on white,
    // AAA on near-black), and the user can pick any of seven
    // pre-vetted swatches whose hexes also read fine in both
    // modes. The dark-mode lightening trick the static palette
    // used (brand[400] in dark, brand[500] in light) is not
    // necessary here because we're using a single hex per swatch
    // — each swatch's hex was chosen to be readable on both
    // surfaces.
    const brand = pickedBrand;
    const brandFill = `${pickedBrand}1A`;
    const overlay = isDark ? colors.overlay.dark : colors.overlay.light;

    // Status palette. The "up" slot is the only one that
    // follows the accent toggle — the other four stay on the
    // static semantic palette regardless of the picker.
    const upColor = accentAffectsStatus ? pickedBrand : colors.status.up;
    const status = {
      up: upColor,
      down: colors.status.down,
      pending: colors.status.pending,
      maintenance: colors.status.maintenance,
      paused: colors.status.paused,
    };

    // 1A = 10% alpha (for backgrounds), 40 = 25% alpha (for borders).
    // These are the tints we use across status banners + icon boxes.
    const tint = (c: string) => ({ bg: `${c}1A`, border: `${c}40` });

    return {
      surface,
      isDark,
      preference,
      brand,
      brandFill,
      status,
      overlay,
      statusTints: {
        up: tint(upColor),
        down: tint(colors.status.down),
        pending: tint(colors.status.pending),
        maintenance: tint(colors.status.maintenance),
        paused: tint(colors.status.paused),
      },
    };
  }, [preference, systemScheme, accentColor, accentSwatchId, accentAffectsStatus]);
}
