/**
 * Monitor detail screen.
 *
 * Phase 0.2: Shows a monitor with all the components in context.
 * - Large status header
 * - Action buttons (re-check, pause, open in Kuma)
 * - Time range selector (24h / 7d / 30d)
 * - Response time chart
 * - Uptime bar
 * - Recent incidents (placeholder)
 */

import { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, RefreshCw, Pause, ExternalLink, AlertCircle, Clock } from 'lucide-react-native';

import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { Button, SegmentedControl, Tag } from '@/components/ui';
import { ResponseTimeChart, UptimeBar } from '@/components/chart';
import { HeartbeatPulse } from '@/components/status';
import { SAMPLE_MONITORS, generateResponseTimeData, generateUptimeData } from '@/lib/sample-data';
import { statusColor, statusLabel } from '@/domain/status';
import { formatResponseTime, formatUptime, formatCertExpiry, formatRelativeTime } from '@/domain/format';
import { colors, spacing, typography, semanticRadius } from '@/theme';

type Range = '24h' | '7d' | '30d';

export default function MonitorDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { monitorId } = useLocalSearchParams<{ monitorId: string }>();

  const monitor = useMemo(
    () => SAMPLE_MONITORS.find((m) => m.id === Number(monitorId)) ?? SAMPLE_MONITORS[0],
    [monitorId]
  );

  const [range, setRange] = useState<Range>('24h');

  const chartData = useMemo(() => {
    const count = range === '24h' ? 40 : range === '7d' ? 60 : 80;
    return generateResponseTimeData(count, 120, 40, monitor.id);
  }, [range, monitor.id]);

  const uptimeData = useMemo(() => {
    const count = range === '24h' ? 50 : range === '7d' ? 100 : 200;
    return generateUptimeData(count, 0.02, monitor.id);
  }, [range, monitor.id]);

  const color = statusColor(monitor.status);
  const isPaused = monitor.status === 'paused';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar
        title={monitor.name}
        left={
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <ArrowLeft size={24} color={colors.surface.light.text} strokeWidth={1.5} />
          </Pressable>
        }
        right={
          <Pressable onPress={() => {}} hitSlop={10}>
            <ExternalLink size={22} color={colors.surface.light.text} strokeWidth={1.5} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing[4],
          paddingBottom: insets.bottom + 100,
          gap: spacing[5],
        }}
        showsVerticalScrollIndicator={false}>
        {/* Status header */}
        <View style={styles.statusHeader}>
          <View style={styles.statusRow}>
            <HeartbeatPulse color={color} size={12} active={!isPaused} />
            <Text style={[typography.title, { color }]}>{statusLabel(monitor.status)}</Text>
          </View>
          <Text style={[typography.body, { color: colors.surface.light.textMuted }]}>
            Last check {formatRelativeTime(monitor.lastCheckAt)}
          </Text>
          {monitor.msg && (
            <View style={styles.messageBox}>
              <AlertCircle size={14} color={colors.status.down} strokeWidth={1.75} />
              <Text style={[typography.caption, { color: colors.status.down, flex: 1 }]}>
                {monitor.msg}
              </Text>
            </View>
          )}
        </View>

        {/* Tags */}
        {monitor.tags.length > 0 && (
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            {monitor.tags.map((tag) => (
              <Tag key={tag.id} tag={tag} />
            ))}
          </View>
        )}

        {/* Quick stats */}
        <View style={styles.statsGrid}>
          <StatTile
            label="Uptime 24h"
            value={formatUptime(monitor.uptime24h)}
            color={color}
          />
          <StatTile
            label="Response"
            value={formatResponseTime(monitor.responseTime)}
            color={colors.surface.light.text}
          />
          <StatTile
            label="Uptime 7d"
            value={formatUptime(monitor.uptime7d)}
            color={colors.surface.light.text}
          />
          <StatTile
            label="Uptime 30d"
            value={formatUptime(monitor.uptime30d)}
            color={colors.surface.light.text}
          />
        </View>

        {/* Actions */}
        <View style={[styles.row, { gap: spacing[2] }]}>
          <Button
            label="Re-check"
            variant="secondary"
            icon={<RefreshCw size={16} color={colors.brand[500]} strokeWidth={1.75} />}
            onPress={() => {}}
            fullWidth
          />
          <Button
            label={isPaused ? 'Resume' : 'Pause'}
            variant="secondary"
            icon={<Pause size={16} color={colors.brand[500]} strokeWidth={1.75} />}
            onPress={() => {}}
            fullWidth
          />
        </View>

        {/* Time range */}
        <SegmentedControl
          options={[
            { value: '24h', label: '24 hours' },
            { value: '7d', label: '7 days' },
            { value: '30d', label: '30 days' },
          ]}
          value={range}
          onChange={(v) => setRange(v as Range)}
        />

        {/* Response time chart */}
        <View>
          <Text style={[typography.heading, { color: colors.surface.light.text, marginBottom: spacing[2] }]}>
            Response time
          </Text>
          <View style={styles.chartCard}>
            <ResponseTimeChart data={chartData} width={width - spacing[4] * 2 - spacing[4] * 2} height={120} color={color} />
          </View>
        </View>

        {/* Uptime bar */}
        <View>
          <Text style={[typography.heading, { color: colors.surface.light.text, marginBottom: spacing[2] }]}>
            Uptime
          </Text>
          <View style={styles.chartCard}>
            <UptimeBar data={uptimeData} />
          </View>
        </View>

        {/* Cert info (only for HTTPS) */}
        {monitor.certExpiryDays !== undefined && (
          <View style={[styles.chartCard, { flexDirection: 'row', alignItems: 'center', gap: spacing[3] }]}>
            <Clock size={20} color={colors.status.pending} strokeWidth={1.75} />
            <View>
              <Text style={[typography.captionEmphasized, { color: colors.surface.light.text }]}>
                TLS certificate
              </Text>
              <Text style={[typography.caption, { color: colors.surface.light.textMuted }]}>
                {formatCertExpiry(monitor.certExpiryDays)}
              </Text>
            </View>
          </View>
        )}

        {/* Recent incidents placeholder */}
        <View>
          <Text style={[typography.heading, { color: colors.surface.light.text, marginBottom: spacing[2] }]}>
            Recent incidents
          </Text>
          <View style={styles.chartCard}>
            <Text style={[typography.body, { color: colors.surface.light.textMuted, textAlign: 'center', paddingVertical: spacing[4] }]}>
              No incidents in the last 24 hours.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={[typography.micro, { color: colors.surface.light.textMuted }]}>
        {label.toUpperCase()}
      </Text>
      <Text style={[typography.title, { color, marginTop: 4 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.light.background },
  statusHeader: {
    paddingTop: spacing[2],
    gap: spacing[2],
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    backgroundColor: `${colors.status.down}14`,
    borderRadius: semanticRadius.md,
    marginTop: spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  statTile: {
    flex: 1,
    minWidth: '47%',
    padding: spacing[3],
    backgroundColor: colors.surface.light.elevated,
    borderRadius: semanticRadius.md,
    borderWidth: 0.5,
    borderColor: colors.surface.light.border,
  },
  chartCard: {
    padding: spacing[4],
    backgroundColor: colors.surface.light.elevated,
    borderRadius: semanticRadius.card,
    borderWidth: 0.5,
    borderColor: colors.surface.light.border,
  },
});
