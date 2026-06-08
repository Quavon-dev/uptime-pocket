/**
 * Button - the workhorse primitive.
 *
 * Variants:
 * - primary: filled brand color, white text. The default CTA.
 * - secondary: outlined brand color, brand text. Secondary actions.
 * - ghost: no border, just text. For low-emphasis actions.
 * - destructive: filled red, white text. For dangerous actions.
 *
 * Sizes: sm, md, lg
 *
 * Press feedback:
 * - iOS: scale to 0.96 with spring back
 * - Android: subtle opacity change
 * - All: light haptic on press
 *
 * Loading state: shows ActivityIndicator and disables press.
 *
 * Theme handling: brand color and elevated surface come from
 * `useAppTheme()` so secondary buttons read correctly in dark mode
 * (elevated surface is dark, brand text is light, contrast AA).
 */

import { Pressable, Text, ActivityIndicator, StyleSheet, View, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { colors, spacing, typography, semanticRadius, useAppTheme } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  haptic?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  haptic = true,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const { surface, brand } = useAppTheme();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (Platform.OS === 'ios') {
      scale.value = withSpring(0.96, { damping: 18, stiffness: 320, mass: 0.8 });
    }
  };

  const handlePressOut = () => {
    if (Platform.OS === 'ios') {
      scale.value = withSpring(1, { damping: 18, stiffness: 320, mass: 0.8 });
    }
  };

  const handlePress = () => {
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress?.();
  };

  // Variant tokens. We compute them per-render so dark mode swaps
  // surfaces (secondary uses surface.elevated as bg) and brand color
  // (ghost/secondary use brand as text).
  const variantTokens = {
    primary: {
      bg: brand,
      text: 'white',
      border: 'transparent',
      borderWidth: 0,
    },
    secondary: {
      bg: surface.elevated,
      text: brand,
      border: brand,
      borderWidth: 0.5,
    },
    ghost: {
      bg: 'transparent',
      text: brand,
      border: 'transparent',
      borderWidth: 0,
    },
    destructive: {
      bg: colors.status.down,
      text: 'white',
      border: 'transparent',
      borderWidth: 0,
    },
  }[variant];

  const sizeStyles = SIZE_STYLES[size];

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      // a11y: the label IS the visible text, so we use it as the
      // accessibility label and role=button so VoiceOver / TalkBack
      // announce it correctly. Loading + disabled states are
      // explicit so the screen reader reports them.
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      // Make sure the tap target is at least 44pt high so the
      // component meets the iOS HIG / Android Material minimum
      // touch target. We do this via hitSlop rather than minHeight
      // so the visual size can still be compact for sm buttons.
      hitSlop={size === 'sm' ? { top: 8, bottom: 8 } : undefined}
      style={[
        styles.base,
        sizeStyles.container,
        {
          backgroundColor: variantTokens.bg,
          borderColor: variantTokens.border,
          borderWidth: variantTokens.borderWidth,
          opacity: disabled ? 0.5 : 1,
        },
        fullWidth && { alignSelf: 'stretch' },
        animatedStyle,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={variantTokens.text} />
      ) : (
        <View style={[styles.content, sizeStyles.content]}>
          {icon && iconPosition === 'left' && (
            <View style={sizeStyles.iconGap}>{icon}</View>
          )}
          <Text
            style={[
              styles.label,
              sizeStyles.text,
              { color: variantTokens.text },
            ]}
            numberOfLines={1}>
            {label}
          </Text>
          {icon && iconPosition === 'right' && (
            <View style={sizeStyles.iconGap}>{icon}</View>
          )}
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: semanticRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    ...typography.bodyEmphasized,
    textAlign: 'center',
  },
});

const SIZE_STYLES = {
  sm: StyleSheet.create({
    container: { paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
    content: { gap: spacing[1] },
    text: { fontSize: 13 },
    iconGap: { marginRight: 0 },
  }),
  md: StyleSheet.create({
    container: { paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
    content: { gap: spacing[2] },
    text: { fontSize: 15 },
    iconGap: { marginRight: 0 },
  }),
  lg: StyleSheet.create({
    container: { paddingHorizontal: spacing[5], paddingVertical: spacing[4] },
    content: { gap: spacing[2] },
    text: { fontSize: 17 },
    iconGap: { marginRight: 0 },
  }),
};
