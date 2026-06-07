/**
 * Glass nav bar - the top app bar with Liquid Glass.
 *
 * On iOS 26+ this is a true Liquid Glass bar (LargeTitleNav).
 * On older iOS it falls back to BlurView.
 * On Android it's a Material 3 top app bar.
 *
 * Phase 0: just renders a styled header bar with title and optional back/menu.
 */

import { View, Text, PlatformColor } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassSurface } from './GlassSurface';
import { typography, spacing } from '@/theme';

interface GlassNavBarProps {
  title: string;
  subtitle?: string;
  large?: boolean;
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export function GlassNavBar({ title, subtitle, large = false, left, right }: GlassNavBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <GlassSurface
      variant="regular"
      tint="default"
      radius={0}
      style={{
        paddingTop: insets.top,
        paddingBottom: spacing[3],
        paddingHorizontal: spacing[4],
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
              // PlatformColor('label') auto-adapts to iOS light/dark
              // mode and is the recommended iOS-native way to pick
              // the "primary text on a background" color. Falls back
              // to a static value on Android.
              style={{
                ...typography.bodyEmphasized,
                color: PlatformColor('label'),
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
              color: PlatformColor('label'),
            }}>
            {title}
          </Text>
          {subtitle && (
            <Text
              style={{
                ...typography.body,
                color: PlatformColor('secondaryLabel'),
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
