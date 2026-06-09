/**
 * MonitorRow - dense list row for monitor lists.
 *
 * Optimized for showing many monitors at once.
 *
 * Layout (v0.8.4 — pill under the URL):
 *   ┌──────────────────────────────────────────────────┐
 *   │  [●]  Name                          [pill]       │
 *   │       url                                         │
 *   │                                  99.9%    124ms   │
 *   └──────────────────────────────────────────────────┘
 *
 * The status pill moved out of the corner and into a row of its
 * own under the URL, so a user scrolling the list can read each
 * monitor's state at a glance. The numeric stats stay on the
 * right; the pill is the primary signal.
 *
 * Theme: row uses surface.elevated/border; text in surface.text
 * and surface.textMuted; icon box uses status-tinted bg.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { StatusPill, HeartbeatPulse } from '@/components/status';
import { monitorTypeIcon } from '@/components/ui/icons';
import { statusColor } from '@/domain/status';
import { t } from '@/i18n';
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
      // a11y: see MonitorCard — composite label, role=button.
      accessibilityRole="button"
      accessibilityLabel={[monitor.name, t(`status.${monitor.status}`)]
        .filter(Boolean)
        .join(', ')}
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

      {/* Middle: name + url + pill */}
      <View style={styles.middle}>
        <Text style={[styles.name, { color: surface.text }]} numberOfLines={1}>
          {monitor.name}
        </Text>
        {showUrl && (monitor.url || monitor.hostname) && (
          <Text style={[styles.subtitle, { color: surface.textMuted }]} numberOfLines={1}>
            {monitor.url || monitor.hostname}
          </Text>
        )}
        {/* Status pill — small/compact for the row, but the
            primary status signal nonetheless. Positioned under the
            URL so the user can scan a list and read state at a
            glance. */}
        <View style={styles.pillRow}>
          <StatusPill status={monitor.status} size="sm" />
        </View>
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
  pillRow: {
    marginTop: 4,
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
