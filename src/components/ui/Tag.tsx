/**
 * Tag - a small colored label.
 *
 * Used to show monitor tags from Kuma (or local user tags).
 * Renders with a tinted background and a small leading dot
 * if a color is provided.
 *
 * Theme: sunken background, text in surface.text. The colored dot
 * uses the tag's own color (semantic) and is unaffected by theme.
 */

import { View, Text, StyleSheet } from 'react-native';
import { spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import type { Tag as TagType } from '@/domain/models';

interface TagProps {
  tag: TagType;
  size?: 'sm' | 'md';
  /** When true, shows the colored dot */
  showDot?: boolean;
}

export function Tag({ tag, size = 'sm', showDot = true }: TagProps) {
  const { surface } = useAppTheme();
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
          backgroundColor: surface.sunken,
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
          { fontSize, color: surface.text },
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
    alignSelf: 'flex-start',
    gap: 5,
  },
  dot: {},
  label: {
    ...typography.captionEmphasized,
  },
});
