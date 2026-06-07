/**
 * MonitorCard - the workhorse card component for displaying a monitor.
 *
 * Used in:
 * - Featured / pinned monitors
 * - Monitor detail header
 * - Anywhere a single monitor needs a prominent display
 *
 * Layout:
 *   ┌──────────────────────────────────────┐
 *   │  [icon]  Name                  [pill] │
 *   │          type • url                   │
 *   │                                       │
 *   │  ┌──────┐ ┌──────┐ ┌──────┐         │
 *   │  │ Up   │ │ 99.9 │ │ 124  │         │
 *   │  │ time │ │ %    │ │ ms   │         │
 *   │  └──────┘ └──────┘ └──────┘         │
 *   │                                       │
 *   │  Last check 2m ago                    │
 *   └──────────────────────────────────────┘
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, typography, semanticRadius } from '@/theme';
import { StatusPill, HeartbeatPulse } from '@/components/status';
import { monitorTypeIcon } from '@/components/ui/icons';
import { statusColor } from '@/domain/status';
import {
  formatResponseTime,
  formatUptime,
  formatRelativeTime,
} from '@/domain/format';
import type { Monitor } from '@/domain/models';

interface MonitorCardProps {
  monitor: Monitor;
  onPress?: () => void;
  /** Show the URL/hostname in the subtitle line */
  showUrl?: boolean;
  /** Show the last check line */
  showLastCheck?: boolean;
  /** Use compact layout (less padding, smaller text) */
  compact?: boolean;
}

export function MonitorCard({
  monitor,
  onPress,
  showUrl = true,
  showLastCheck = true,
  compact = false,
}: MonitorCardProps) {
  const TypeIcon = monitorTypeIcon(monitor.type);
  const pad = compact ? spacing[3] : spacing[4];
  const statSize = compact ? 14 : 16;
  const statLabelSize = compact ? 10 : 11;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          padding: pad,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      {/* Header row: icon + name + status pill */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View
            style={[
              styles.iconBox,
              {
                backgroundColor: `${statusColor(monitor.status)}14`,
                width: compact ? 32 : 36,
                height: compact ? 32 : 36,
              },
            ]}>
            <TypeIcon
              size={compact ? 16 : 18}
              color={statusColor(monitor.status)}
              strokeWidth={1.75}
            />
          </View>
          <View style={styles.titleCol}>
            <Text style={[styles.name, compact && { fontSize: 14 }]} numberOfLines={1}>
              {monitor.name}
            </Text>
            {showUrl && (monitor.url || monitor.hostname) && (
              <Text style={[styles.subtitle, compact && { fontSize: 11 }]} numberOfLines={1}>
                {monitor.url || monitor.hostname}
              </Text>
            )}
          </View>
        </View>
        <StatusPill status={monitor.status} size={compact ? 'sm' : 'md'} showLabel={!compact} />
      </View>

      {/* Stats row: uptime, response time */}
      <View style={[styles.stats, { marginTop: compact ? spacing[3] : spacing[4] }]}>
        <Stat
          label="Uptime"
          value={formatUptime(monitor.uptime24h)}
          color={statusColor(monitor.status)}
          valueSize={statSize}
          labelSize={statLabelSize}
        />
        <Stat
          label="Response"
          value={formatResponseTime(monitor.responseTime)}
          color={colors.surface.light.text}
          valueSize={statSize}
          labelSize={statLabelSize}
        />
        <Stat
          label="Type"
          value={monitor.type}
          color={colors.surface.light.textMuted}
          valueSize={statSize}
          labelSize={statLabelSize}
        />
      </View>

      {/* Footer: last check + heartbeat pulse */}
      {showLastCheck && (
        <View style={styles.footer}>
          <HeartbeatPulse
            color={statusColor(monitor.status)}
            size={compact ? 6 : 8}
            active={monitor.status !== 'paused'}
          />
          <Text style={[styles.lastCheck, compact && { fontSize: 11 }]}>
            {formatRelativeTime(monitor.lastCheckAt)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function Stat({
  label,
  value,
  color,
  valueSize,
  labelSize,
}: {
  label: string;
  value: string;
  color: string;
  valueSize: number;
  labelSize: number;
}) {
  return (
    <View style={styles.stat}>
      <Text
        style={[
          typography.caption,
          { color: colors.surface.light.textMuted, fontSize: labelSize, textTransform: 'uppercase', letterSpacing: 0.4 },
        ]}>
        {label}
      </Text>
      <Text
        style={[
          typography.bodyEmphasized,
          { color, fontSize: valueSize, marginTop: 2 },
        ]}
        numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// Local import to avoid a circular dep with status.ts

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface.light.elevated,
    borderRadius: semanticRadius.card,
    borderWidth: 0.5,
    borderColor: colors.surface.light.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  iconBox: {
    borderRadius: semanticRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.bodyEmphasized,
    color: colors.surface.light.text,
    fontSize: 15,
  },
  subtitle: {
    ...typography.caption,
    color: colors.surface.light.textMuted,
    fontSize: 12,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface.light.sunken,
    padding: spacing[3],
    borderRadius: semanticRadius.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[3],
  },
  lastCheck: {
    ...typography.caption,
    color: colors.surface.light.textMuted,
    fontSize: 12,
  },
});
