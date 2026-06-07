/**
 * Chip - small filter / tag selection.
 *
 * Used in:
 * - Status filters (All / Up / Down)
 * - Tag filters
 * - Quick toggles
 *
 * States: unselected, selected, disabled
 */

import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, semanticRadius } from '@/theme';
import * as Haptics from 'expo-haptics';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /** Color override for selected state (default = brand) */
  selectedColor?: string;
}

export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
  selectedColor,
}: ChipProps) {
  const accent = selectedColor ?? colors.brand[500];

  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onPress?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: selected ? accent : colors.surface.light.elevated,
          borderColor: selected ? accent : colors.surface.light.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}>
      <Text
        style={[
          styles.label,
          { color: selected ? 'white' : colors.surface.light.text },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: semanticRadius.pill,
    borderWidth: 0.5,
    alignSelf: 'flex-start',
  },
  label: {
    ...typography.captionEmphasized,
  },
});
