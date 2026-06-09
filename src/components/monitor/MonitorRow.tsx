/**
 * MonitorRow - dense list row for monitor lists.
 *
 * Optimized for showing many monitors at once.
 *
 * Layout (v0.8.5 — pill on the left, type icon next to the URL):
 *   ┌──────────────────────────────────────────────────┐
 *   │  [Up pill]   Name                       99.9%    │
 *   │              [globe] url                124 ms   │
 *   └──────────────────────────────────────────────────┘
 *
 * The status pill is now the leftmost element of every row, so a
 * user scrolling the list sees the state of every monitor in their
 * peripheral vision without having to read each row. The type icon
 * (globe for HTTP, etc.) moves to a small inline position next to
 * the URL — it conveys "what kind of monitor" but isn't the primary
 * signal. Stats stay on the right.
 *
 * Theme: row uses surface.elevated/border; text in surface.text
 * and surface.textMuted.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { StatusPill } from '@/components/status';
import { monitorTypeIcon } from '@/components/ui/icons';
import { t } from '@/i18n';
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
  const { surface } = useAppTheme();
  const TypeIcon = monitorTypeIcon(monitor.type);

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
      {/* Left: status pill — the primary signal. Replaces the
          type-icon box that used to live here. */}
      <View style={styles.left}>
        <StatusPill status={monitor.status} size="md" />
      </View>

      {/* Middle: name + url (with type icon as a small prefix) */}
      <View style={styles.middle}>
        <Text style={[styles.name, { color: surface.text }]} numberOfLines={1}>
          {monitor.name}
        </Text>
        {showUrl && (monitor.url || monitor.hostname) && (
          <View style={styles.subtitleRow}>
            <TypeIcon size={12} color={surface.textMuted} strokeWidth={1.75} />
            <Text
              style={[styles.subtitle, { color: surface.textMuted }]}
              numberOfLines={1}>
              {monitor.url || monitor.hostname}
            </Text>
          </View>
        )}
      </View>

      {/* Right: stats */}
      {showStats && (
        <View style={styles.right}>
          <Text style={[styles.stat, { color: surface.text }]}>
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
    alignItems: 'flex-start',
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
    flexShrink: 1,
  },
  // Inline row of [icon] [url] for the URL line. The icon prefixes
  // the URL like a favicon — small, muted, non-distracting.
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
