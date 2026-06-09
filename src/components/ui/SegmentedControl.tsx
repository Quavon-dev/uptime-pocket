/**
 * SegmentedControl - a 2-5 option picker with sliding indicator.
 *
 * Used in:
 * - Time range (24h / 7d / 30d)
 * - Auth method (Bearer / Password)
 * - Theme (System / Light / Dark)
 * - Monitor list status filter (All / Up / Down)
 *
 * The indicator slides between options with a spring animation.
 *
 * Layout: the track is a fixed-height container (40px md / 32px sm)
 * with internal padding (3px / 2px). The indicator is absolutely
 * positioned with `top` / `bottom` set to the padding value, so it
 * always matches the track's content area regardless of font metrics.
 * Earlier revisions used a hardcoded indicator height, which on iOS
 * could render taller than the surrounding track (the label's
 * ascender / descender pushes the segment taller than the declared
 * `paddingVertical + lineHeight`).
 *
 * Theme: track uses surface.sunken, indicator uses surface.elevated,
 * text uses surface.text (active) or surface.textMuted (inactive).
 */

import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { typography, semanticRadius, useAppTheme } from '@/theme';
import * as Haptics from 'expo-haptics';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Optional: compact size for tight spaces */
  size?: 'sm' | 'md';
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: SegmentedControlProps<T>) {
  const { surface, isDark } = useAppTheme();
  // The track is a fixed-height row: 40px md / 32px sm. This decouples
  // the visual size of the segments from the height of the label text
  // (which on iOS can vary with the system font scale).
  const trackHeight = size === 'sm' ? 32 : 40;
  const trackPadding = size === 'sm' ? 2 : 3;
  const [width, setWidth] = useState(0);
  const segmentWidth = width / options.length;
  // Indicator inset = trackPadding on each side, so it lives inside
  // the track's content area (not on top of the rounded corners).
  const indicatorInset = trackPadding;
  const activeIndex = options.findIndex((o) => o.value === value);

  const indicatorX = useSharedValue(0);

  useEffect(() => {
    indicatorX.value = withSpring(activeIndex * segmentWidth, {
      damping: 22,
      stiffness: 320,
      mass: 0.8,
    });
  }, [activeIndex, segmentWidth, indicatorX]);

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  const handlePress = (newValue: T) => {
    if (newValue === value) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(newValue);
  };

  return (
    <View
      onLayout={onLayout}
      // a11y: wrap the segments in a radiogroup so VoiceOver / TalkBack
      // announces "X of Y" when the user steps through.
      accessibilityRole="radiogroup"
      style={[
        styles.container,
        {
          height: trackHeight,
          padding: trackPadding,
          borderRadius: size === 'sm' ? semanticRadius.md : semanticRadius.button,
          backgroundColor: surface.sunken,
        },
      ]}>
      {width > 0 && (
        <Animated.View
          // Position with top/bottom = trackPadding (instead of a
          // hardcoded height) so the indicator always matches the
          // track's content area, even when the system font scale
          // changes the segment's natural height.
          style={[
            styles.indicator,
            {
              top: indicatorInset,
              bottom: indicatorInset,
              left: indicatorInset,
              width: segmentWidth - 2 * indicatorInset,
              borderRadius: size === 'sm' ? semanticRadius.md - 2 : semanticRadius.button - 3,
              backgroundColor: surface.elevated,
              // Subtle shadow in light mode (gives the indicator depth
              // over the sunken track); more pronounced in dark mode
              // so the indicator reads against the near-black track.
              boxShadow: isDark
                ? '0 1px 3px rgba(0,0,0,0.6)'
                : '0 1px 2px rgba(0,0,0,0.1)',
            },
            indicatorStyle,
          ]}
        />
      )}
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => handlePress(option.value)}
            // a11y: a segmented control is a radio group, so each
            // segment is a radio button. VoiceOver / TalkBack will
            // announce the label and whether it's selected.
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: isActive }}
            // min tap target 44pt: small variants get a hitSlop bump.
            hitSlop={size === 'sm' ? { top: 8, bottom: 8 } : undefined}
            style={styles.segment}>
            <Text
              style={[
                styles.label,
                size === 'sm' && { fontSize: 12 },
                {
                  color: isActive ? surface.text : surface.textMuted,
                  fontWeight: isActive ? '600' : '500',
                },
              ]}
              numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.captionEmphasized,
  },
});
