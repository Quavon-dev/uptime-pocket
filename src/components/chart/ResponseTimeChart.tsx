/**
 * ResponseTimeChart - SVG line chart with Reanimated path-draw animation.
 *
 * Two render modes:
 *
 * 1. **Single series** (legacy, used by design-system preview):
 *    Pass `data: TimePoint[]`. One line is drawn. Average is shown as
 *    a dashed reference line, latest value as a corner label.
 *
 * 2. **Multi-series (Kuma-style ping chart)**: Pass `series: Series[]`
 *    where each series has a `kind` of 'min' | 'avg' | 'max' and its
 *    own color. Up to three lines are drawn on the same y-axis,
 *    themed like Uptime Kuma's web dashboard:
 *      - min: dark green
 *      - avg: light green (the same brand color as legacy single mode)
 *      - max: bright green
 *    An optional `status` overlay (red/blue/yellow segments along the
 *    bottom) can be drawn underneath the lines to mirror Kuma's bar
 *    chart overlay for down/maintenance/pending heartbeats.
 *
 * Theme: surface.sunken bg, surface.text for labels, surface.border
 * for grid/avg reference.
 */

import { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Path,
  Line,
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Rect,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, spacing, typography, useAppTheme } from '@/theme';
import type { TimePoint } from '@/domain/models';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export type SeriesKind = 'min' | 'avg' | 'max';

export interface Series {
  kind: SeriesKind;
  data: TimePoint[];
  color: string;
  label: string;
}

export interface StatusPoint {
  /** x position 0..1 of the chart width. */
  x: number;
  /** Status color (red/blue/yellow/green). */
  color: string;
}

interface ResponseTimeChartProps {
  // Single-series mode (legacy)
  data?: TimePoint[];
  // Multi-series mode (Kuma-style)
  series?: Series[];
  /** Optional status overlay segments drawn at the bottom of the chart. */
  statusOverlay?: StatusPoint[];
  width?: number;
  height?: number;
  /** Single-series color override (only used when `data` is passed, not `series`). */
  color?: string;
  /** Show a subtle grid line at the average (single-series only). */
  showAverage?: boolean;
  /** Show the latest value as a label (single-series only). */
  showLatestLabel?: boolean;
  /** Empty state message */
  emptyMessage?: string;
}

const padX = 4;
const padY = 8;
const overlayHeight = 6; // height of the status bar overlay at the bottom

export function ResponseTimeChart({
  data,
  series,
  statusOverlay,
  width = 320,
  height = 120,
  color: colorProp,
  showAverage = true,
  showLatestLabel = true,
  emptyMessage = 'No data',
}: ResponseTimeChartProps) {
  const { surface, brand } = useAppTheme();
  const progress = useSharedValue(0);

  // Normalize to series[] internally so both code paths share logic.
  const allSeries: Series[] = useMemo(() => {
    if (series && series.length > 0) return series;
    if (data && data.length > 0) {
      return [
        {
          kind: 'avg',
          data,
          color: colorProp ?? brand,
          label: 'avg',
        },
      ];
    }
    return [];
  }, [series, data, colorProp, brand]);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [allSeries, progress]);

  // Compute y-axis bounds across ALL series so they share a scale.
  const layout = useMemo(() => {
    const allPoints = allSeries.flatMap((s) => s.data);
    if (allPoints.length === 0) {
      return {
        paths: [] as { kind: SeriesKind; color: string; d: string; latest?: { x: number; y: number } }[],
        minVal: 0,
        maxVal: 0,
        avgVal: 0,
        latestVal: 0,
      };
    }
    const values = allPoints.map((p) => p.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const avgVal = values.reduce((a, b) => a + b, 0) / values.length;
    const latestVal = values[values.length - 1];

    const range = maxVal - minVal || 1;
    const chartWidth = width - padX * 2;
    const chartHeight = height - padY * 2 - (statusOverlay ? overlayHeight + 2 : 0);

    const paths = allSeries.map((s) => {
      const pts = s.data.map((d, i) => {
        const x = padX + (i / Math.max(1, s.data.length - 1)) * chartWidth;
        const y = padY + chartHeight - ((d.value - minVal) / range) * chartHeight;
        return { x, y };
      });
      if (pts.length === 0) {
        return { kind: s.kind, color: s.color, d: '' };
      }
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) {
        d += ` L ${pts[i].x} ${pts[i].y}`;
      }
      return {
        kind: s.kind,
        color: s.color,
        d,
        latest: pts[pts.length - 1],
      };
    });

    return { paths, minVal, maxVal, avgVal, latestVal };
  }, [allSeries, width, height, statusOverlay]);

  const animatedPathProps = useAnimatedProps(() => ({
    opacity: progress.value,
  }));

  if (allSeries.length === 0 || allSeries.every((s) => s.data.length === 0)) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={[typography.caption, { color: surface.textMuted }]}>
          {emptyMessage}
        </Text>
      </View>
    );
  }

  const chartHeight = height - padY * 2 - (statusOverlay ? overlayHeight + 2 : 0);
  const avgY = padY + chartHeight - ((layout.avgVal - layout.minVal) / (layout.maxVal - layout.minVal || 1)) * chartHeight;
  const isMulti = allSeries.length > 1;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={brand} stopOpacity={0.3} />
            <Stop offset="100%" stopColor={brand} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {/* Average reference line (only in single-series mode) */}
        {!isMulti && showAverage && (
          <Line
            x1={padX}
            y1={avgY}
            x2={width - padX}
            y2={avgY}
            stroke={surface.border}
            strokeWidth={0.5}
            strokeDasharray="3,3"
          />
        )}

        {/* Lines for each series */}
        {layout.paths.map((p) => (
          <AnimatedPath
            key={p.kind}
            d={p.d}
            stroke={p.color}
            strokeWidth={isMulti ? 1.25 : 1.5}
            fill="none"
            animatedProps={animatedPathProps}
          />
        ))}

        {/* Latest-point dot for single-series mode only */}
        {!isMulti && layout.paths[0]?.latest && (
          <Circle
            cx={layout.paths[0].latest.x}
            cy={layout.paths[0].latest.y}
            r={3}
            fill={layout.paths[0].color}
          />
        )}

        {/* Status bar overlay (Kuma-style) */}
        {statusOverlay && statusOverlay.length > 0 && (
          <StatusOverlay
            points={statusOverlay}
            x={padX}
            y={height - padY - overlayHeight}
            width={width - padX * 2}
            height={overlayHeight}
          />
        )}
      </Svg>

      {!isMulti && showLatestLabel && (
        <View style={[styles.label, { backgroundColor: surface.sunken }]}>
          <Text style={[typography.caption, styles.labelText, { color: surface.text }]}>
            {layout.latestVal < 1000
              ? `${Math.round(layout.latestVal)}ms`
              : `${(layout.latestVal / 1000).toFixed(2)}s`}
          </Text>
        </View>
      )}
    </View>
  );
}

// ---- Status overlay ----------------------------------------------------

/**
 * Status bar overlay drawn at the bottom of the chart.
 * Each point's x is in 0..1 (relative to width). The overlay paints
 * a thin colored segment at that x with the given width.
 */
function StatusOverlay({
  points,
  x,
  y,
  width,
  height,
}: {
  points: StatusPoint[];
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  // Merge adjacent same-color points into runs for cleaner rendering.
  const runs: { fromX: number; toX: number; color: string }[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const px = x + p.x * width;
    const last = runs[runs.length - 1];
    if (last && last.color === p.color && Math.abs(last.toX - px) < 0.5) {
      last.toX = px + 1;
    } else {
      runs.push({ fromX: px, toX: px + 1, color: p.color });
    }
  }
  return (
    <>
      {runs.map((r, i) => (
        <Rect
          key={i}
          x={r.fromX}
          y={y}
          width={Math.max(1, r.toX - r.fromX)}
          height={height}
          fill={r.color}
          opacity={0.55}
        />
      ))}
    </>
  );
}

// ---- Kuma-style palette helpers ----------------------------------------

/**
 * Pick the three greens Kuma uses for min/avg/max lines.
 * Centralized here so the call site doesn't need to know the palette.
 *
 * Kuma's source: `min` = #126331, `avg` = #5CDD8B, `max` = #21b55a.
 * We map "avg" to the brand color so it always reads on both themes.
 */
export function kumaPingColors(brandColor: string): {
  min: string;
  avg: string;
  max: string;
} {
  return {
    min: colors.brand?.[700] ?? '#047857',
    avg: brandColor,
    max: colors.brand?.[400] ?? '#34D399',
  };
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: 4,
  },
  labelText: {
    fontWeight: '600',
    fontSize: 10,
  },
});
