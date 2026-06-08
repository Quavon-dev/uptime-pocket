/**
 * ServerCard - displays a Kuma server connection.
 *
 * Shows:
 * - Server name + URL
 * - Connection status (with pulse animation when connected)
 * - Kuma version (if known)
 * - Number of monitors
 * - Notification mode
 * - Last connected time (relative)
 *
 * Used in:
 * - Servers tab list
 * - Server switcher
 * - Active server header
 *
 * Theme: card uses surface.elevated/border. Active variant uses
 * brand for border. Meta pills use surface.sunken.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Server, ServerOff, ChevronRight, Bell, BellRing, BellOff } from 'lucide-react-native';
import { colors, spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { HeartbeatPulse } from '@/components/status';
import type { Server as ServerType } from '@/domain/models';
import type { ConnectionStatus } from '@/data/store/monitors';
import { t, tn } from '@/i18n';
import { formatRelativeTime } from '@/domain/format';

interface ServerCardProps {
  server: ServerType;
  onPress?: () => void;
  /** Show the chevron (e.g. for navigation to detail) */
  showChevron?: boolean;
  /** Show the monitor count + notification mode summary */
  showDetails?: boolean;
  /** Highlight as the active server */
  isActive?: boolean;
  monitorCount?: number;
  /** Live connection status. Falls back to server.connected if not provided. */
  connectionStatus?: ConnectionStatus;
}

export function ServerCard({
  server,
  onPress,
  showChevron = false,
  showDetails = true,
  isActive = false,
  monitorCount = 0,
  connectionStatus,
}: ServerCardProps) {
  const { surface, brand, statusTints } = useAppTheme();

  // Map the live status to "is up". A server in `connecting` or
  // `reconnecting` is "in progress" — we still show a status icon
  // (pending color) so the user knows the app is trying.
  const isConnected = connectionStatus === 'connected' || server.connected;
  const isPending =
    connectionStatus === 'connecting' || connectionStatus === 'reconnecting';
  const StatusIcon = isConnected || isPending ? Server : ServerOff;
  const statusColor = isConnected
    ? colors.status.up
    : isPending
    ? colors.status.pending
    : colors.status.down;
  const statusBg = isConnected
    ? statusTints.up.bg
    : isPending
    ? statusTints.pending.bg
    : statusTints.down.bg;

  // The status text for the a11y label uses the same string the detail
  // screen renders so screen-reader users hear consistent wording.
  const statusKey = `servers.detail.status.${
    isConnected ? 'connected' : isPending ? 'connecting' : 'idle'
  }` as const;

  return (
    <Pressable
      onPress={onPress}
      // a11y: composite label so the screen reader gets the server
      // name + connection state + active flag in one read instead of
      // a stutter of separate <Text> nodes.
      accessibilityRole="button"
      accessibilityLabel={[server.name, t(statusKey), isActive && t('serverCard.active')]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={{ selected: isActive }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: surface.elevated,
          borderColor: isActive ? brand : surface.border,
          borderWidth: isActive ? 1.5 : 0.5,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <View style={styles.left}>
        <View style={[styles.iconBox, { backgroundColor: statusBg }]}>
          <StatusIcon size={18} color={statusColor} strokeWidth={1.75} />
        </View>
        {(isConnected || isPending) && (
          <View style={styles.pulseContainer}>
            <HeartbeatPulse color={statusColor} size={6} active={isConnected} />
          </View>
        )}
      </View>

      <View style={styles.middle}>
        <View style={styles.titleRow}>
          <Text style={[styles.name, { color: surface.text }]} numberOfLines={1}>
            {server.name}
          </Text>
          {isActive && (
            <View style={[styles.activeBadge, { backgroundColor: brand }]}>
              <Text style={styles.activeBadgeText}>{t('serverCard.active')}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.url, { color: surface.textMuted }]} numberOfLines={1}>
          {server.url}
        </Text>
        {showDetails && (
          <View style={styles.meta}>
            {server.kumaVersion && (
              <View style={[styles.metaItem, { backgroundColor: surface.sunken }]}>
                <Text style={[styles.metaText, { color: surface.textMuted }]}>
                  v{server.kumaVersion}
                </Text>
              </View>
            )}
            <View style={[styles.metaItem, { backgroundColor: surface.sunken }]}>
              <Text style={[styles.metaText, { color: surface.textMuted }]}>
                {monitorCount}{' '}
                {monitorCount === 1
                  ? t('serverCard.monitor')
                  : t('serverCard.monitors')}
              </Text>
            </View>
            <View style={[styles.metaItem, { backgroundColor: surface.sunken }]}>
              {server.notificationMode === 'relay' ? (
                <BellRing size={10} color={surface.textMuted} strokeWidth={2} />
              ) : server.notificationMode === 'direct' ? (
                <Bell size={10} color={surface.textMuted} strokeWidth={2} />
              ) : (
                <BellOff size={10} color={surface.textMuted} strokeWidth={2} />
              )}
              <Text style={[styles.metaText, { color: surface.textMuted }]}>
                {server.notificationMode === 'relay'
                  ? t('serverCard.modeRelay')
                  : server.notificationMode === 'direct'
                  ? t('serverCard.modeDirect')
                  : t('serverCard.modeNone')}
              </Text>
            </View>
            {/* Last-connected timestamp. Shown only when we have a
                recorded timestamp — for a fresh server with no
                successful connection yet we show "Never connected". */}
            <View style={[styles.metaItem, { backgroundColor: surface.sunken }]}>
              <Text style={[styles.metaText, { color: surface.textMuted }]}>
                {server.lastConnectedAt
                  ? tn('serverCard.lastConnected', {
                      when: formatRelativeTime(new Date(server.lastConnectedAt)),
                    })
                  : t('serverCard.neverConnected')}
              </Text>
            </View>
          </View>
        )}
      </View>

      {showChevron && (
        <ChevronRight size={20} color={surface.textMuted} strokeWidth={1.5} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    borderRadius: semanticRadius.card,
    gap: spacing[3],
  },
  left: {
    alignItems: 'center',
    gap: 4,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: semanticRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseContainer: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  name: {
    ...typography.bodyEmphasized,
    fontSize: 15,
    flexShrink: 1,
  },
  url: {
    ...typography.caption,
    fontSize: 12,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: semanticRadius.sm,
  },
  metaText: {
    ...typography.micro,
  },
  activeBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: semanticRadius.sm,
  },
  activeBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
