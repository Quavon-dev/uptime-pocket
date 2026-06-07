/**
 * ResponseTimeChart - SVG line chart with Reanimated path-draw animation.
 *
 * Renders a sparkline-style chart of response time over time.
 * Animates the path drawing on mount.
 *
 * Inputs: array of (timestamp, value) points.
 * Optional: y-axis max (auto if not provided), color, height.
 */

import { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, spacing, typography } from '@/theme';
import type { TimePoint } from '@/domain/models';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface ResponseTimeChartProps {
  data: TimePoint[];
  width?: number;
  height?: number;
  color?: string;
  /** Show a subtle grid line at the average */
  showAverage?: boolean;
  /** Show the latest value as a label */
  showLatestLabel?: boolean;
  /** Empty state message */
  emptyMessage?: string;
}

export function ResponseTimeChart({
  data,
  width = 320,
  height = 120,
  color = colors.brand[500],
  showAverage = true,
  showLatestLabel = true,
  emptyMessage = 'No data',
}: ResponseTimeChartProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [data, progress]);

  const { path, points, avg, max, min, latest } = useMemo(() => {
    if (data.length === 0) {
      return { path: '', points: [], avg: 0, max: 0, min: 0, latest: 0 };
    }

    const values = data.map((d) => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const avgVal = values.reduce((a, b) => a + b, 0) / values.length;
    const latestVal = values[values.length - 1];

    const range = maxVal - minVal || 1;
    const padX = 4;
    const padY = 8;
    const chartWidth = width - padX * 2;
    const chartHeight = height - padY * 2;

    const pts = data.map((d, i) => {
      const x = padX + (i / Math.max(1, data.length - 1)) * chartWidth;
      const y = padY + chartHeight - ((d.value - minVal) / range) * chartHeight;
      return { x, y, value: d.value };
    });

    // Build smooth path using a simple line (M, L, L, L...)
    // We could use cubic bezier for smoother curves, but for monitoring data
    // a straight line is more honest.
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${pts[i].x} ${pts[i].y}`;
    }

    return {
      path: d,
      points: pts,
      avg: avgVal,
      max: maxVal,
      min: minVal,
      latest: latestVal,
    };
  }, [data, width, height]);

  const animatedPathProps = useAnimatedProps(() => ({
    // Use stroke-dashoffset-style animation via opacity since
    // SVG stroke-dasharray in react-native-svg doesn't support animation yet.
    opacity: progress.value,
  }));

  if (data.length === 0) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={[typography.caption, { color: colors.surface.light.textMuted }]}>
          {emptyMessage}
        </Text>
      </View>
    );
  }

  const padX = 4;
  const padY = 8;
  const chartHeight = height - padY * 2;
  const avgY = padY + chartHeight - ((avg - min) / (max - min || 1)) * chartHeight;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {/* Average line */}
        {showAverage && (
          <Line
            x1={padX}
            y1={avgY}
            x2={width - padX}
            y2={avgY}
            stroke={colors.surface.light.border}
            strokeWidth={0.5}
            strokeDasharray="3,3"
          />
        )}

        {/* Main line */}
        <AnimatedPath
          d={path}
          stroke={color}
          strokeWidth={1.5}
          fill="none"
          animatedProps={animatedPathProps}
        />

        {/* Latest point dot */}
        {points.length > 0 && (
          <Circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r={3}
            fill={color}
          />
        )}
      </Svg>

      {showLatestLabel && (
        <View style={styles.label}>
          <Text style={[typography.caption, styles.labelText]}>
            {latest < 1000 ? `${Math.round(latest)}ms` : `${(latest / 1000).toFixed(2)}s`}
          </Text>
        </View>
      )}
    </View>
  );
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
    backgroundColor: colors.surface.light.sunken,
    borderRadius: 4,
  },
  labelText: {
    color: colors.surface.light.text,
    fontWeight: '600',
    fontSize: 10,
  },
});
