/**
 * UptimeBar - segmented bar showing uptime over time.
 *
 * Each segment is a bar in the time window, colored by status.
 * Used in monitor detail view to show "what was happening" over a period,
 * and in the monitor list (Card + Row) to give a glanceable history of
 * the last ~100 heartbeats.
 *
 * Inputs: array of (timestamp, up: boolean) points.
 * The bar is divided into N segments (default 50) and each segment's
 * color is the dominant status in that window.
 *
 * Variants:
 *  - `full` (default) — top "UPTIME" label + bar + bottom "Uptime / XX.XX%"
 *    footer. Matches the Kuma-style block in the screenshot.
 *  - `compact` — bar only, no labels. Used in dense list rows where
 *    vertical space is at a premium.
 *
 * Theme: empty-segments use surface.sunken; labels use surface.textMuted.
 */

import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, useAppTheme } from '@/theme';
import type { UptimePoint } from '@/domain/models';
import { statusColor } from '@/domain/status';
import { t } from '@/i18n';

interface UptimeBarProps {
  data: UptimePoint[];
  /** Number of segments to render (default 50) */
  segments?: number;
  height?: number;
  /** 'full' = top label + bar + bottom label+percentage. 'compact' = bar only. */
  variant?: 'full' | 'compact';
  /** @deprecated use `variant="compact"` instead. Kept for backward compat. */
  showLabel?: boolean;
}

export interface UptimeBarSegment {
  id: string;
  color: string;
  up: boolean;
}

/**
 * Pure bucketing logic: turn an N-point time series into M segments,
 * each colored by the dominant status in that window.
 *
 * Extracted from the component so it can be unit-tested without
 * rendering. `getColor` is injected so tests can assert on the
 * "all up" / "all down" / "mixed" / "empty" branches without
 * depending on the theme palette.
 */
export function bucketUptimePoints(
  data: UptimePoint[],
  segments: number,
  getColor: (status: 'up' | 'down' | 'pending' | 'empty') => string
): { bars: UptimeBarSegment[]; upPct: number } {
  if (data.length === 0) {
    return { bars: [], upPct: 0 };
  }

  // Bucket data into N segments
  const bucketSize = Math.max(1, Math.floor(data.length / segments));
  const bars: UptimeBarSegment[] = [];

  for (let i = 0; i < segments; i++) {
    const start = i * bucketSize;
    const end = Math.min(start + bucketSize, data.length);
    const slice = data.slice(start, end);

    if (slice.length === 0) {
      bars.push({ id: `seg-${i}`, color: getColor('empty'), up: true });
      continue;
    }

    const upCount = slice.filter((d) => d.up).length;
    const downCount = slice.length - upCount;
    const up = upCount > downCount;

    let color: string;
    if (upCount === slice.length) {
      color = getColor('up');
    } else if (downCount === slice.length) {
      color = getColor('down');
    } else if (up) {
      color = getColor('pending');
    } else {
      color = getColor('down');
    }

    // Use the bucket's first timestamp as a stable id — survives reorders
    bars.push({ id: `seg-${i}-${slice[0].timestamp.getTime()}`, color, up });
  }

  const upPct =
    data.length > 0 ? (data.filter((d) => d.up).length / data.length) * 100 : 0;

  return { bars, upPct };
}

export function UptimeBar({
  data,
  segments = 50,
  height = 32,
  variant,
  showLabel = true,
}: UptimeBarProps) {
  const { surface } = useAppTheme();
  // Backward-compat: if `showLabel` is false, behave as compact.
  const effectiveVariant: 'full' | 'compact' = variant
    ? variant
    : showLabel
      ? 'full'
      : 'compact';

  const { bars, upPct } = useMemo(
    () =>
      bucketUptimePoints(data, segments, (status) =>
        status === 'empty' ? surface.sunken : statusColor(status)
      ),
    [data, segments, surface.sunken]
  );

  // The percentage color follows the same threshold as the rest of the
  // app: green ≥99%, amber ≥95%, red below. Mirrors the Kuma web SPA
  // treatment and the existing 24h-stat tile in MonitorCard.
  const pctColor =
    upPct >= 99
      ? colors.status.up
      : upPct >= 95
        ? colors.status.pending
        : colors.status.down;

  return (
    <View style={styles.container}>
      {effectiveVariant === 'full' && (
        <Text
          style={[
            typography.micro,
            { color: surface.textMuted },
          ]}>
          {t('monitors.bar.label')}
        </Text>
      )}
      <View style={[styles.bar, { height, backgroundColor: surface.sunken }]}>
        {bars.map((b) => (
          <View
            key={b.id}
            // Each segment is a colored stripe; reading "75 of 100
            // segments are green" to a screen-reader user would be
            // noise. The percentage in the footer + the parent
            // card/row's status pill are what convey the state.
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.segment,
              { backgroundColor: b.color, flex: 1 },
            ]}
          />
        ))}
      </View>
      {effectiveVariant === 'full' && (
        <View style={styles.labelRow}>
          <Text
            style={[
              typography.caption,
              { color: surface.textMuted, fontSize: 11 },
            ]}>
            {t('monitors.bar.caption')}
          </Text>
          <Text
            style={[
              typography.captionEmphasized,
              { color: pctColor, fontSize: 12 },
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
