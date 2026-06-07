/**
 * Tag - a small colored label.
 *
 * Used to show monitor tags from Kuma (or local user tags).
 * Renders with a tinted background and a small leading dot
 * if a color is provided.
 */

import { View, Text, StyleSheet } from 'react-native';
import { spacing, typography, semanticRadius, colors } from '@/theme';
import type { Tag as TagType } from '@/domain/models';

interface TagProps {
  tag: TagType;
  size?: 'sm' | 'md';
  /** When true, shows the colored dot */
  showDot?: boolean;
}

export function Tag({ tag, size = 'sm', showDot = true }: TagProps) {
  const color = tag.color || '#6B7280';
  const fontSize = size === 'sm' ? 11 : 12;
  const padH = size === 'sm' ? spacing[2] : spacing[3];
  const padV = size === 'sm' ? 3 : 5;
  const dotSize = size === 'sm' ? 5 : 6;

  return (
    <View
      style={[
        styles.container,
        {
          paddingHorizontal: padH,
          paddingVertical: padV,
        },
      ]}>
      {showDot && (
        <View
          style={[
            styles.dot,
            { backgroundColor: color, width: dotSize, height: dotSize, borderRadius: dotSize / 2 },
          ]}
        />
      )}
      <Text
        style={[
          styles.label,
          { fontSize, color: colors.surface.light.text },
        ]}
        numberOfLines={1}>
        {tag.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: semanticRadius.pill,
    backgroundColor: colors.surface.light.sunken,
    alignSelf: 'flex-start',
    gap: 5,
  },
  dot: {},
  label: {
    ...typography.captionEmphasized,
  },
});
