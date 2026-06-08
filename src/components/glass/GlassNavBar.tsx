/**
 * Glass nav bar - the top app bar with Liquid Glass.
 *
 * On iOS 26+ this is a true Liquid Glass bar (LargeTitleNav).
 * On older iOS it falls back to BlurView.
 * On Android it's a Material 3 top app bar.
 *
 * Phase 0: just renders a styled header bar with title and optional back/menu.
 *
 * Theme handling
 * --------------
 * - The Liquid Glass / BlurView tint auto-adapts to the system color
 *   scheme on iOS (iOS-native).
 * - The text color uses `PlatformColor('label')` on iOS so it follows
 *   the system tint behind the glass. On Android we read from
 *   `useAppTheme()` because PlatformColor isn't reliable there.
 * - The bar's background tint is a subtle brand-colored overlay in dark
 *   mode (so the glass reads against the very-dark page background).
 */

import { Platform, PlatformColor, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassSurface } from './GlassSurface';
import { typography, spacing, useAppTheme } from '@/theme';

interface GlassNavBarProps {
  title: string;
  subtitle?: string;
  large?: boolean;
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export function GlassNavBar({ title, subtitle, large = false, left, right }: GlassNavBarProps) {
  const insets = useSafeAreaInsets();
  const { surface, isDark, brandFill } = useAppTheme();

  // iOS gets the native auto-adapting label color; Android falls back
  // to our explicit theme tokens.
  const titleColor = Platform.select({
    ios: PlatformColor('label') as unknown as string,
    default: surface.text,
  });
  const subtitleColor = Platform.select({
    ios: PlatformColor('secondaryLabel') as unknown as string,
    default: surface.textMuted,
  });

  return (
    <GlassSurface
      variant="regular"
      tint="default"
      radius={0}
      style={{
        paddingTop: insets.top,
        paddingBottom: spacing[3],
        paddingHorizontal: spacing[4],
        // Subtle brand tint behind the glass in dark mode so the bar
        // doesn't read as a pure-black slab.
        ...(isDark && { backgroundColor: brandFill }),
      }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 44,
        }}>
        <View style={{ flex: 1, alignItems: 'flex-start' }}>{left}</View>

        <View style={{ flex: 3, alignItems: 'center' }}>
          {!large && (
            <Text
              numberOfLines={1}
              style={{
                ...typography.bodyEmphasized,
                color: titleColor,
              }}>
              {title}
            </Text>
          )}
        </View>

        <View style={{ flex: 1, alignItems: 'flex-end' }}>{right}</View>
      </View>

      {large && (
        <View style={{ marginTop: spacing[2] }}>
          <Text
            style={{
              ...typography.display,
              color: titleColor,
            }}>
            {title}
          </Text>
          {subtitle && (
            <Text
              style={{
                ...typography.body,
                color: subtitleColor,
                marginTop: spacing[1],
              }}>
              {subtitle}
            </Text>
          )}
        </View>
      )}
    </GlassSurface>
  );
}
