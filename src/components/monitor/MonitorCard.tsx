/**
 * MonitorCard - the workhorse card component for displaying a monitor.
 *
 * Used in:
 * - Featured / pinned monitors
 * - Monitor detail header
 * - Anywhere a single monitor needs a prominent display
 *
 * Layout (v0.8.5 — pill on the left):
 *   ┌──────────────────────────────────────┐
 *   │                                       │
 *   │  [● Up]   Name                        │
 *   │            [globe] url                │
 *   │            2m ago                     │
 *   │                                       │
 *   │  ┌──────┐ ┌──────┐ ┌──────┐         │
 *   │  │uptime│ │ resp │ │ type │         │
 *   │  └──────┘ └──────┘ └──────┘         │
 *   └──────────────────────────────────────┘
 *
 * The status pill is now the leftmost element of the card, replacing
 * the type-icon box. It's the primary visual signal — the user sees
 * the state of every monitor in their peripheral vision when
 * scrolling a list. The type icon (globe for HTTP, etc.) moves to a
 * small inline position next to the URL, and the last-check time
 * sits under the URL on its own line so the user can see how
 * recent the result is.
 *
 * Theme: card uses surface.elevated/border. Stat tiles use
 * surface.sunken. Stat values use surface.text (or status color for
 * the uptime one).
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { StatusPill } from '@/components/status';
import { monitorTypeIcon } from '@/components/ui/icons';
import { statusColor } from '@/domain/status';
import { t } from '@/i18n';
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
  /**
   * 24h average response time in ms (Kuma's `avgPing` event). When
   * provided, we show it as a small subtitle under the "Response"
   * stat so the user can tell the live ping from the daily average.
   */
  avgPing24h?: number | null;
}

export function MonitorCard({
  monitor,
  onPress,
  showUrl = true,
  showLastCheck = true,
  compact = false,
  avgPing24h = null,
}: MonitorCardProps) {
  const { surface } = useAppTheme();
  const TypeIcon = monitorTypeIcon(monitor.type);
  const pad = compact ? spacing[3] : spacing[4];
  const statSize = compact ? 14 : 16;
  const statLabelSize = compact ? 10 : 11;
  const s = statusColor(monitor.status);

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
      {/* Top row: hero pill on the left, name + url + last check
          on the right. The pill is the leftmost element so the
          status reads at a glance from the edge of the card. */}
      <View style={styles.header}>
        <View style={styles.pillColumn}>
          <StatusPill status={monitor.status} size={compact ? 'lg' : 'xl'} />
        </View>
        <View style={styles.titleCol}>
          <Text style={[styles.name, compact && { fontSize: 14 }, { color: surface.text }]} numberOfLines={1}>
            {monitor.name}
          </Text>
          {showUrl && (monitor.url || monitor.hostname) && (
            <View style={styles.subtitleRow}>
              <TypeIcon
                size={compact ? 12 : 13}
                color={surface.textMuted}
                strokeWidth={1.75}
              />
              <Text
                style={[styles.subtitle, compact && { fontSize: 11 }, { color: surface.textMuted }]}
                numberOfLines={1}>
                {monitor.url || monitor.hostname}
              </Text>
            </View>
          )}
          {showLastCheck && (
            <Text
              style={[
                styles.lastCheckInline,
                compact && { fontSize: 10 },
                { color: surface.textMuted },
              ]}
              numberOfLines={1}>
              {formatRelativeTime(monitor.lastCheckAt)}
            </Text>
          )}
        </View>
      </View>

      {/* Stats row: uptime, response time */}
      <View style={[styles.stats, { marginTop: compact ? spacing[3] : spacing[4] }]}>
        <Stat
          label={t('monitorCard.uptime')}
          value={formatUptime(monitor.uptime24h)}
          color={s}
          valueSize={statSize}
          labelSize={statLabelSize}
          labelColor={surface.textMuted}
          tileBg={surface.sunken}
        />
        <Stat
          label={t('monitorCard.response')}
          value={formatResponseTime(monitor.responseTime)}
          color={surface.text}
          valueSize={statSize}
          labelSize={statLabelSize}
          labelColor={surface.textMuted}
          tileBg={surface.sunken}
          // When the 24h average is available, show it as a small
          // muted subtitle under the live response time so the user
          // can see both the instant ping and the daily average.
          subtitle={
            avgPing24h != null
              ? `${t('monitors.detail.avgPing24h')} ${formatResponseTime(avgPing24h)}`
              : null
          }
        />
        <Stat
          label={t('monitorCard.type')}
          value={monitor.type}
          color={surface.textMuted}
          valueSize={statSize}
          labelSize={statLabelSize}
          labelColor={surface.textMuted}
          tileBg={surface.sunken}
        />
      </View>
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
  subtitle,
}: {
  label: string;
  value: string;
  color: string;
  valueSize: number;
  labelSize: number;
  labelColor: string;
  tileBg: string;
  /** Optional small muted line under the value. */
  subtitle?: string | null;
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
      {subtitle ? (
        <Text
          style={[
            typography.caption,
            { color: labelColor, fontSize: Math.max(9, labelSize - 1), marginTop: 1 },
          ]}
          numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: semanticRadius.card,
    borderWidth: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  // The pill column is sized to its content — the pill is its own
  // thing and shouldn't stretch. The title column takes the rest
  // (flex: 1) so the name/URL fill the available width.
  pillColumn: {
    alignItems: 'flex-start',
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
    flexShrink: 1,
  },
  // Inline row of [icon] [url] for the URL line. The icon prefixes
  // the URL like a favicon — small, muted, non-distracting.
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // Last-check time lives under the URL on its own line so the
  // user can see how recent the result is without having to look
  // at a separate footer.
  lastCheckInline: {
    ...typography.caption,
    fontSize: 11,
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
});
