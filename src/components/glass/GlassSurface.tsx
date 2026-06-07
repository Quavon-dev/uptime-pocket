/**
 * GlassSurface - a cross-platform wrapper that uses Liquid Glass on
 * iOS 26+ and BlurView as a fallback on older iOS / Android.
 *
 * The `expo-glass-effect` module is iOS 26+ only. On older platforms
 * we fall back to `expo-blur` with similar styling. On Android we
 * also use a subtle solid background that respects Material 3.
 *
 * Liquid Glass styles supported by expo-glass-effect:
 *   - 'clear'  — minimal frost
 *   - 'regular' — default glass
 *   - 'none'   — no glass effect (just a tinted view)
 *
 * We map our 'thin' / 'thick' / 'extraThick' to BlurView intensities.
 */

import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { colors } from '@/theme';

export type GlassVariant = 'thin' | 'regular' | 'thick' | 'extraThick' | 'clear';
export type GlassTint = 'default' | 'brand' | 'none';

interface GlassSurfaceProps extends ViewProps {
  /** Visual weight of the glass effect */
  variant?: GlassVariant;
  /** Optional tint color overlay */
  tint?: GlassTint;
  /** Border radius */
  radius?: number;
  /** Whether the surface is interactive (affects blur amount) */
  interactive?: boolean;
}

export function GlassSurface({
  variant = 'regular',
  tint = 'default',
  radius = 0,
  interactive = false,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  const tintColor =
    tint === 'brand'
      ? colors.brand[500]
      : tint === 'none'
      ? 'transparent'
      : undefined;

  // iOS 26+ with Liquid Glass
  // Note: Liquid Glass only supports 'clear' | 'regular' | 'none'.
  // We map our other variants to BlurView fallback even on iOS 26.
  if (Platform.OS === 'ios' && isLiquidGlassAvailable() && (variant === 'regular' || variant === 'clear')) {
    return (
      <View style={[style, { borderRadius: radius, overflow: 'hidden' }]} {...rest}>
        <GlassView
          style={StyleSheet.absoluteFill}
          glassEffectStyle={variant}
          tintColor={tintColor}
          isInteractive={interactive}
        />
        <View style={StyleSheet.absoluteFill}>{children}</View>
      </View>
    );
  }

  // Older iOS, or Liquid Glass unavailable, or heavy variant — BlurView fallback
  if (Platform.OS === 'ios') {
    const intensity =
      variant === 'thin' ? 30 :
      variant === 'thick' ? 80 :
      variant === 'extraThick' ? 100 :
      50;
    return (
      <View style={[style, { borderRadius: radius, overflow: 'hidden' }]} {...rest}>
        <BlurView
          style={StyleSheet.absoluteFill}
          intensity={intensity}
          tint={tint === 'brand' ? 'prominent' : 'systemUltraThinMaterial'}
        />
        {tintColor && (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: `${tintColor}33` }, // 20% tint
            ]}
          />
        )}
        <View style={StyleSheet.absoluteFill}>{children}</View>
      </View>
    );
  }

  // Android - subtle elevated surface (Material 3 expressive)
  return (
    <View
      style={[
        style,
        {
          borderRadius: radius,
          backgroundColor: tint === 'brand' ? `${colors.brand[500]}1A` : colors.surface.light.elevated,
          borderWidth: 0.5,
          borderColor: colors.surface.light.border,
        },
      ]}
      {...rest}>
      {children}
    </View>
  );
}
