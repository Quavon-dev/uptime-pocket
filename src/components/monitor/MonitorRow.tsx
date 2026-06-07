/**
 * MonitorRow - dense list row for monitor lists.
 *
 * Optimized for showing many monitors at once.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────┐
 *   │  [●]  Name                          [pill]       │
 *   │       type • url                                 │
 *   │                              99.9%    124ms      │
 *   └──────────────────────────────────────────────────┘
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, typography, semanticRadius } from '@/theme';
import { HeartbeatPulse } from '@/components/status';
import { monitorTypeIcon } from '@/components/ui/icons';
import { statusColor } from '@/domain/status';
import {
  formatResponseTime,
  formatUptime,
} from '@/domain/format';
import type { Monitor } from '@/domain/models';

interface MonitorRowProps {
  monitor: Monitor;
  onPress?: () => void;
  /** Show the URL/hostname */
  showUrl?: boolean;
  /** Show the stats on the right */
  showStats?: boolean;
}

export function MonitorRow({
  monitor,
  onPress,
  showUrl = true,
  showStats = true,
}: MonitorRowProps) {
  const TypeIcon = monitorTypeIcon(monitor.type);
  const color = statusColor(monitor.status);
  const isActive = monitor.status !== 'paused';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { opacity: pressed ? 0.85 : 1 },
      ]}>
      {/* Left: status dot / icon */}
      <View style={styles.left}>
        <View
          style={[
            styles.iconBox,
            { backgroundColor: `${color}14` },
          ]}>
          <TypeIcon size={16} color={color} strokeWidth={1.75} />
        </View>
        <HeartbeatPulse color={color} size={6} active={isActive} />
      </View>

      {/* Middle: name + url */}
      <View style={styles.middle}>
        <Text style={styles.name} numberOfLines={1}>
          {monitor.name}
        </Text>
        {showUrl && (monitor.url || monitor.hostname) && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {monitor.url || monitor.hostname}
          </Text>
        )}
      </View>

      {/* Right: stats */}
      {showStats && (
        <View style={styles.right}>
          <Text style={[styles.stat, { color }]}>
            {formatUptime(monitor.uptime24h)}
          </Text>
          <Text style={styles.statSecondary}>
            {formatResponseTime(monitor.responseTime)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.surface.light.elevated,
    borderRadius: semanticRadius.card,
    borderWidth: 0.5,
    borderColor: colors.surface.light.border,
    gap: spacing[3],
  },
  left: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: semanticRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.bodyEmphasized,
    color: colors.surface.light.text,
    fontSize: 14,
  },
  subtitle: {
    ...typography.caption,
    color: colors.surface.light.textMuted,
    fontSize: 11,
  },
  right: {
    alignItems: 'flex-end',
    gap: 2,
  },
  stat: {
    ...typography.bodyEmphasized,
    fontSize: 14,
  },
  statSecondary: {
    ...typography.caption,
    color: colors.surface.light.textMuted,
    fontSize: 11,
  },
});
