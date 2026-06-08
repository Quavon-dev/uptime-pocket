/**
 * Status pill - colored dot + label.
 *
 * Used everywhere to indicate monitor health. This is the most
 * repeated component in the app, so it's worth getting right.
 *
 * - The dot's color is the SEMANTIC status color (never decorative)
 * - The label is optional and configurable
 * - The pill itself is rounded-full with a subtle background
 */

import { View, Text } from 'react-native';
import { statusColor, statusLabel } from '@/domain/status';
import { typography, semanticRadius } from '@/theme';
import type { MonitorStatus } from '@/domain/models';

interface StatusPillProps {
  status: MonitorStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function StatusPill({ status, size = 'md', showLabel = true }: StatusPillProps) {
  const color = statusColor(status);
  const dotSize = size === 'sm' ? 6 : size === 'lg' ? 10 : 8;
  const fontSize = size === 'sm' ? 11 : size === 'lg' ? 14 : 12;

  return (
    <View
      // a11y: the pill is a passive display element. We expose the
      // status as the label so the screen reader reads "Up" / "Down"
      // / etc. The dot alone is decorative (it has no text).
      accessible={!showLabel}
      accessibilityLabel={!showLabel ? statusLabel(status) : undefined}
      accessibilityRole="text"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: size === 'sm' ? 8 : 10,
        paddingVertical: size === 'sm' ? 3 : 5,
        borderRadius: semanticRadius.pill,
        backgroundColor: `${color}1A`, // 10% opacity tint
        gap: 6,
      }}>
      <View
        // a11y: the dot is purely decorative; the text label carries
        // the meaning. Hide it from the a11y tree.
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: color,
        }}
      />
      {showLabel && (
        <Text
          style={{
            ...typography.captionEmphasized,
            fontSize,
            color,
            lineHeight: fontSize + 2,
          }}>
          {statusLabel(status)}
        </Text>
      )}
    </View>
  );
}
