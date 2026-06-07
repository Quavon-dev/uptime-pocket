/**
 * UptimeBar - segmented bar showing uptime over time.
 *
 * Each segment is a bar in the time window, colored by status.
 * Used in monitor detail view to show "what was happening" over a period.
 *
 * Inputs: array of (timestamp, up: boolean) points.
 * The bar is divided into N segments (default 50) and each segment's
 * color is the dominant status in that window.
 */

import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@/theme';
import type { UptimePoint } from '@/domain/models';
import { statusColor } from '@/domain/status';

interface UptimeBarProps {
  data: UptimePoint[];
  /** Number of segments to render (default 50) */
  segments?: number;
  height?: number;
  /** Show the percentage label */
  showLabel?: boolean;
}

export function UptimeBar({
  data,
  segments = 50,
  height = 32,
  showLabel = true,
}: UptimeBarProps) {
  const { bars, upPct } = useMemo(() => {
    if (data.length === 0) {
      return { bars: [] as { id: string; color: string; up: boolean }[], upPct: 0 };
    }

    // Bucket data into N segments
    const bucketSize = Math.max(1, Math.floor(data.length / segments));
    const bars: { id: string; color: string; up: boolean }[] = [];

    for (let i = 0; i < segments; i++) {
      const start = i * bucketSize;
      const end = Math.min(start + bucketSize, data.length);
      const slice = data.slice(start, end);

      if (slice.length === 0) {
        bars.push({ id: `seg-${i}`, color: colors.surface.light.sunken, up: true });
        continue;
      }

      const upCount = slice.filter((d) => d.up).length;
      const downCount = slice.length - upCount;
      const up = upCount > downCount;

      // Use status colors
      let color: string;
      if (upCount === slice.length) {
        color = statusColor('up');
      } else if (downCount === slice.length) {
        color = statusColor('down');
      } else if (up) {
        color = statusColor('pending');
      } else {
        color = statusColor('down');
      }

      // Use the bucket's first timestamp as a stable id — survives reorders
      bars.push({ id: `seg-${i}-${slice[0].timestamp.getTime()}`, color, up });
    }

    const upPct = data.length > 0
      ? (data.filter((d) => d.up).length / data.length) * 100
      : 0;

    return { bars, upPct };
  }, [data, segments]);

  return (
    <View style={styles.container}>
      <View style={[styles.bar, { height }]}>
        {bars.map((b) => (
          <View
            key={b.id}
            style={[
              styles.segment,
              { backgroundColor: b.color, flex: 1 },
            ]}
          />
        ))}
      </View>
      {showLabel && (
        <View style={styles.labelRow}>
          <Text style={[typography.caption, { color: colors.surface.light.textMuted, fontSize: 11 }]}>
            Uptime
          </Text>
          <Text
            style={[
              typography.captionEmphasized,
              { color: upPct >= 99 ? colors.status.up : upPct >= 95 ? colors.status.pending : colors.status.down, fontSize: 12 },
            ]}>
            {upPct.toFixed(2)}%
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[2],
  },
  bar: {
    flexDirection: 'row',
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.surface.light.sunken,
    gap: 1,
  },
  segment: {
    borderRadius: 1,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
