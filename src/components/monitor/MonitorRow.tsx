/**
 * MonitorRow - dense list row for monitor lists.
 *
 * Optimized for showing many monitors at once.
 *
 * Layout (v0.9.0 — pill on the left, compact UPTIME bar under the URL):
 *   ┌──────────────────────────────────────────────────┐
 *   │  [Up pill]   Name                       99.9%    │
 *   │              [globe] url                124 ms   │
 *   │  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮┘
 *   │  [Up pill]   Name                       99.9%    │
 *   │              [globe] url                124 ms   │
 *   │  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮  │  ← compact bar
 *   └──────────────────────────────────────────────────┘
 *
 * The status pill is the leftmost element (the primary signal). The
 * type icon (globe for HTTP, etc.) is a small inline prefix next to
 * the URL. The UPTIME bar is rendered below as a thin full-width
 * history strip — it gives the user a glanceable "is this monitor
 * healthy lately" answer without drilling into the detail screen.
 * Stats (uptime %, response time) stay on the right for quick
 * comparison when scanning.
 *
 * The bar is only rendered when `serverId` is provided (so the
 * design-system showcase, which has no Provider, still works).
 *
 * Theme: row uses surface.elevated/border; text in surface.text
 * and surface.textMuted.
 */

import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { StatusPill } from '@/components/status';
import { UptimeBar } from '@/components/chart';
import { monitorTypeIcon } from '@/components/ui/icons';
import { useMonitors, selectHeartbeatHistory } from '@/data/store/monitors';
import { t } from '@/i18n';
import {
  formatResponseTime,
  formatUptime,
} from '@/domain/format';
import type { Monitor, UptimePoint } from '@/domain/models';

interface MonitorRowProps {
  monitor: Monitor;
  onPress?: () => void;
  /**
   * Long-press handler. When provided, the row is press-and-hold
   * tappable (e.g. for the "pin to top" gesture on the Monitors
   * tab). We surface a subtle haptic on long-press so the user
   * gets feedback that the gesture registered. See MonitorCard
   * for the same pattern; the two components intentionally have
   * matching onLongPress semantics.
   */
  onLongPress?: () => void;
  /**
   * Accessibility hint for the long-press action. Only used when
   * `onLongPress` is provided.
   */
  longPressHint?: string;
  /** Show the URL/hostname */
  showUrl?: boolean;
  /** Show the stats on the right */
  showStats?: boolean;
  /**
   * The server id that owns this monitor. When provided, the row
   * subscribes to the monitor's cached heartbeat history and renders
   * the compact UPTIME bar. When omitted (e.g. the design-system
   * showcase, which has no Provider), the bar is hidden.
   */
  serverId?: string;
}

export function MonitorRow({
  monitor,
  onPress,
  onLongPress,
  longPressHint,
  showUrl = true,
  showStats = true,
  serverId,
}: MonitorRowProps) {
  const { surface } = useAppTheme();
  const TypeIcon = monitorTypeIcon(monitor.type);

  // Per-monitor subscription: this row only re-renders when its own
  // heartbeats change, not on every other monitor's heartbeat.
  const heartbeats = useMonitors((st) =>
    serverId ? selectHeartbeatHistory(st, serverId, monitor.id) : []
  );
  const uptimePoints: UptimePoint[] = useMemo(
    () =>
      heartbeats.map((h) => ({
        timestamp: new Date(h.timestamp),
        up: h.status === 'up' || h.status === 'maintenance',
      })),
    [heartbeats]
  );

  return (
    <Pressable
      onPress={onPress}
      // Long-press: see MonitorCard for the same pattern. We
      // fire a `Medium` impact haptic when the gesture registers
      // so the user has a clear physical signal. The handler is
      // `undefined` when the parent doesn't pass one, which
      // disables long-press detection entirely (Pressable
      // respects this — no spurious callbacks).
      onLongPress={onLongPress ? () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onLongPress();
      } : undefined}
      // a11y: see MonitorCard — composite label, role=button.
      accessibilityRole="button"
      accessibilityLabel={[monitor.name, t(`status.${monitor.status}`)]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={longPressHint}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: surface.elevated,
          borderColor: surface.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      {/* Top row: pill (left) + name/url (middle) + stats (right) */}
      <View style={styles.topRow}>
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
      </View>

      {/* Compact UPTIME bar — full width below the name/url line.
          Hidden in the design-system showcase (no serverId) and on
          monitors that don't have any heartbeat data yet (the bar
          would just be a sunken-color empty block, which is a worse
          signal than no bar at all). */}
      {serverId && heartbeats.length > 0 && (
        <View style={styles.barRow}>
          <UptimeBar data={uptimePoints} variant="compact" height={16} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: semanticRadius.card,
    borderWidth: 0.5,
    gap: spacing[2],
  },
  // Top row keeps the existing layout (pill | name/url | stats).
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  // The compact bar sits below the top row, full width. No left
  // padding because UptimeBar's segments are edge-to-edge inside
  // its own container.
  barRow: {
    marginTop: spacing[1],
  },
});
