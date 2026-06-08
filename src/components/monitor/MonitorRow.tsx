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
 *
 * Theme: row uses surface.elevated/border; text in surface.text
 * and surface.textMuted; icon box uses status-tinted bg.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { HeartbeatPulse } from '@/components/status';
import { monitorTypeIcon } from '@/components/ui/icons';
import { statusColor } from '@/domain/status';
import {
  formatResponseTime,
  formatUptime,
} from '@/domain/format';
import type { Monitor, MonitorStatus } from '@/domain/models';

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
  const { surface, statusTints } = useAppTheme();
  const TypeIcon = monitorTypeIcon(monitor.type);
  const s = statusColor(monitor.status);
  const isActive = monitor.status !== 'paused';
  const iconBg = tintForStatus(monitor.status, statusTints);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: surface.elevated,
          borderColor: surface.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      {/* Left: status dot / icon */}
      <View style={styles.left}>
        <View
          style={[
            styles.iconBox,
            { backgroundColor: iconBg },
          ]}>
          <TypeIcon size={16} color={s} strokeWidth={1.75} />
        </View>
        <HeartbeatPulse color={s} size={6} active={isActive} />
      </View>

      {/* Middle: name + url */}
      <View style={styles.middle}>
        <Text style={[styles.name, { color: surface.text }]} numberOfLines={1}>
          {monitor.name}
        </Text>
        {showUrl && (monitor.url || monitor.hostname) && (
          <Text style={[styles.subtitle, { color: surface.textMuted }]} numberOfLines={1}>
            {monitor.url || monitor.hostname}
          </Text>
        )}
      </View>

      {/* Right: stats */}
      {showStats && (
        <View style={styles.right}>
          <Text style={[styles.stat, { color: s }]}>
            {formatUptime(monitor.uptime24h)}
          </Text>
          <Text style={[styles.statSecondary, { color: surface.textMuted }]}>
            {formatResponseTime(monitor.responseTime)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function tintForStatus(
  status: MonitorStatus,
  tints: ReturnType<typeof useAppTheme>['statusTints']
): string {
  switch (status) {
    case 'up': return tints.up.bg;
    case 'down': return tints.down.bg;
    case 'pending': return tints.pending.bg;
    case 'maintenance': return tints.maintenance.bg;
    case 'paused': return tints.paused.bg;
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: semanticRadius.card,
    borderWidth: 0.5,
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
    fontSize: 14,
  },
  subtitle: {
    ...typography.caption,
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
    fontSize: 11,
  },
});
