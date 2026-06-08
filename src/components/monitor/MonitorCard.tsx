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
 *
 * Theme: card uses surface.elevated/border. Stat tiles use
 * surface.sunken. Stat values use surface.text (or status color for
 * the uptime one).
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
  formatRelativeTime,
} from '@/domain/format';
import type { Monitor, MonitorStatus } from '@/domain/models';

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
  const { surface, statusTints } = useAppTheme();
  const TypeIcon = monitorTypeIcon(monitor.type);
  const pad = compact ? spacing[3] : spacing[4];
  const statSize = compact ? 14 : 16;
  const statLabelSize = compact ? 10 : 11;
  const s = statusColor(monitor.status);
  const iconBg = tintForStatus(monitor.status, statusTints);

  return (
    <Pressable
      onPress={onPress}
      // a11y: a single composite label tells the screen reader user
      // what this monitor is, what its status is, and the key stats
      // they care about. Without this, VoiceOver / TalkBack would
      // read each <Text> node separately.
      accessibilityRole="button"
      accessibilityLabel={[
        monitor.name,
        showUrl && (monitor.url || monitor.hostname),
        t(`status.${monitor.status}`),
        monitor.uptime24h != null &&
          `${t('monitorDetail.stats.uptime24h')} ${(monitor.uptime24h * 100).toFixed(2)}%`,
        monitor.responseTime != null &&
          `${t('monitorDetail.stats.response')} ${monitor.responseTime} ms`,
      ]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => [
        styles.card,
        {
          padding: pad,
          backgroundColor: surface.elevated,
          borderColor: surface.border,
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
                backgroundColor: iconBg,
                width: compact ? 32 : 36,
                height: compact ? 32 : 36,
              },
            ]}>
            <TypeIcon
              size={compact ? 16 : 18}
              color={s}
              strokeWidth={1.75}
            />
          </View>
          <View style={styles.titleCol}>
            <Text style={[styles.name, compact && { fontSize: 14 }, { color: surface.text }]} numberOfLines={1}>
              {monitor.name}
            </Text>
            {showUrl && (monitor.url || monitor.hostname) && (
              <Text style={[styles.subtitle, compact && { fontSize: 11 }, { color: surface.textMuted }]} numberOfLines={1}>
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
          color={s}
          valueSize={statSize}
          labelSize={statLabelSize}
          labelColor={surface.textMuted}
          tileBg={surface.sunken}
        />
        <Stat
          label="Response"
          value={formatResponseTime(monitor.responseTime)}
          color={surface.text}
          valueSize={statSize}
          labelSize={statLabelSize}
          labelColor={surface.textMuted}
          tileBg={surface.sunken}
        />
        <Stat
          label="Type"
          value={monitor.type}
          color={surface.textMuted}
          valueSize={statSize}
          labelSize={statLabelSize}
          labelColor={surface.textMuted}
          tileBg={surface.sunken}
        />
      </View>

      {/* Footer: last check + heartbeat pulse */}
      {showLastCheck && (
        <View style={styles.footer}>
          <HeartbeatPulse
            color={s}
            size={compact ? 6 : 8}
            active={monitor.status !== 'paused'}
          />
          <Text style={[styles.lastCheck, compact && { fontSize: 11 }, { color: surface.textMuted }]}>
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
  labelColor,
  tileBg,
}: {
  label: string;
  value: string;
  color: string;
  valueSize: number;
  labelSize: number;
  labelColor: string;
  tileBg: string;
}) {
  return (
    <View style={[styles.stat, { backgroundColor: tileBg }]}>
      <Text
        style={[
          typography.caption,
          { color: labelColor, fontSize: labelSize, textTransform: 'uppercase', letterSpacing: 0.4 },
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
  card: {
    borderRadius: semanticRadius.card,
    borderWidth: 0.5,
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
    fontSize: 15,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 12,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  stat: {
    flex: 1,
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
    fontSize: 12,
  },
});
