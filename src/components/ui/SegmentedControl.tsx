/**
 * SegmentedControl - a 2-5 option picker with sliding indicator.
 *
 * Used in:
 * - Time range (24h / 7d / 30d)
 * - Auth method (Bearer / Password)
 * - Theme (System / Light / Dark)
 *
 * The indicator slides between options with a spring animation.
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
import { spacing, typography, semanticRadius, useAppTheme } from '@/theme';
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
  const [width, setWidth] = useState(0);
  const segmentWidth = width / options.length;
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
          padding: size === 'sm' ? 2 : 3,
          borderRadius: size === 'sm' ? semanticRadius.md : semanticRadius.button,
          backgroundColor: surface.sunken,
        },
      ]}>
      {width > 0 && (
        <Animated.View
          style={[
            styles.indicator,
            {
              width: segmentWidth - (size === 'sm' ? 4 : 6),
              height: size === 'sm' ? 28 : 32,
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
            style={[
              styles.segment,
              { paddingVertical: size === 'sm' ? spacing[1] : spacing[2] },
            ]}>
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
    top: 3,
    left: 3,
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
