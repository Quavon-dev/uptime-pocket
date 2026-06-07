/**
 * ServerCard - displays a Kuma server connection.
 *
 * Shows:
 * - Server name + URL
 * - Connection status (with pulse animation when connected)
 * - Kuma version (if known)
 * - Number of monitors
 * - Notification mode
 *
 * Used in:
 * - Servers tab list
 * - Server switcher
 * - Active server header
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Server, ServerOff, ChevronRight, Bell, BellOff } from 'lucide-react-native';
import { colors, spacing, typography, semanticRadius } from '@/theme';
import { HeartbeatPulse } from '@/components/status';
import type { Server as ServerType } from '@/domain/models';

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
}

export function ServerCard({
  server,
  onPress,
  showChevron = false,
  showDetails = true,
  isActive = false,
  monitorCount = 0,
}: ServerCardProps) {
  const StatusIcon = server.connected ? Server : ServerOff;
  const color = server.connected ? colors.status.up : colors.status.down;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isActive && styles.cardActive,
        { opacity: pressed ? 0.85 : 1 },
      ]}>
      <View style={styles.left}>
        <View style={[styles.iconBox, { backgroundColor: `${color}14` }]}>
          <StatusIcon size={18} color={color} strokeWidth={1.75} />
        </View>
        {server.connected && (
          <View style={styles.pulseContainer}>
            <HeartbeatPulse color={color} size={6} active />
          </View>
        )}
      </View>

      <View style={styles.middle}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {server.name}
          </Text>
          {isActive && (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>Active</Text>
            </View>
          )}
        </View>
        <Text style={styles.url} numberOfLines={1}>
          {server.url}
        </Text>
        {showDetails && (
          <View style={styles.meta}>
            {server.kumaVersion && (
              <View style={styles.metaItem}>
                <Text style={styles.metaText}>v{server.kumaVersion}</Text>
              </View>
            )}
            <View style={styles.metaItem}>
              <Text style={styles.metaText}>
                {monitorCount} {monitorCount === 1 ? 'monitor' : 'monitors'}
              </Text>
            </View>
            <View style={styles.metaItem}>
              {server.notificationMode === 'relay' ? (
                <Bell size={10} color={colors.surface.light.textMuted} strokeWidth={2} />
              ) : server.notificationMode === 'direct' ? (
                <Bell size={10} color={colors.surface.light.textMuted} strokeWidth={2} />
              ) : (
                <BellOff size={10} color={colors.surface.light.textMuted} strokeWidth={2} />
              )}
              <Text style={styles.metaText}>
                {server.notificationMode === 'relay'
                  ? 'Push'
                  : server.notificationMode === 'direct'
                  ? 'Direct'
                  : 'Off'}
              </Text>
            </View>
          </View>
        )}
      </View>

      {showChevron && (
        <ChevronRight size={20} color={colors.surface.light.textMuted} strokeWidth={1.5} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    backgroundColor: colors.surface.light.elevated,
    borderRadius: semanticRadius.card,
    borderWidth: 0.5,
    borderColor: colors.surface.light.border,
    gap: spacing[3],
  },
  cardActive: {
    borderColor: colors.brand[500],
    borderWidth: 1.5,
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
    color: colors.surface.light.text,
    fontSize: 15,
    flexShrink: 1,
  },
  url: {
    ...typography.caption,
    color: colors.surface.light.textMuted,
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
    backgroundColor: colors.surface.light.sunken,
    borderRadius: semanticRadius.sm,
  },
  metaText: {
    ...typography.micro,
    color: colors.surface.light.textMuted,
  },
  activeBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    backgroundColor: colors.brand[500],
    borderRadius: semanticRadius.sm,
  },
  activeBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
