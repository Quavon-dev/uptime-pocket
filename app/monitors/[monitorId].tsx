/**
 * Monitor detail screen.
 *
 * Phase 0.2 / Phase 1: Layout, all components, and chart placeholders.
 * Real data (status, heartbeats, response time series) will flow from the
 * Kuma connection manager in Phase 2.
 *
 * Sections:
 * - Status header
 * - Quick stats (uptime, response time)
 * - Action buttons (re-check, pause, open in Kuma)
 * - Time range selector
 * - Response time chart
 * - Uptime bar
 * - Recent incidents
 *
 * Until live data is wired, the screen shows an empty state when no monitor
 * id matches a real (live) monitor.
 */

import { useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ExternalLink, Server } from 'lucide-react-native';

import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { Button, SegmentedControl, EmptyState } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { t, tn } from '@/i18n';

type Range = '24h' | '7d' | '30d';

export default function MonitorDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { monitorId } = useLocalSearchParams<{ monitorId: string }>();

  const [range, setRange] = useState<Range>('24h');

  // TODO(phase-2): replace with the live monitor from the Kuma connection
  // manager: `useMonitor(monitorId)`. For now, we don't have live data, so we
  // show the empty state regardless of the route param.

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar
        title={tn('monitors.detail.title', { id: monitorId })}
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
        }}
        showsVerticalScrollIndicator={false}>
        {/* Time range (shown for layout continuity; the chart will render in Phase 2) */}
        <View style={{ paddingTop: spacing[2] }}>
          <SegmentedControl
            options={[
              { value: '24h', label: t('monitors.detail.ranges.24h') },
              { value: '7d', label: t('monitors.detail.ranges.7d') },
              { value: '30d', label: t('monitors.detail.ranges.30d') },
            ]}
            value={range}
            onChange={(v) => setRange(v as Range)}
            size="sm"
          />
        </View>

        {/* Empty state until the connection manager fills in */}
        <View style={[styles.placeholder, { paddingTop: spacing[8] }]}>
          <EmptyState
            icon={Server}
            title={t('monitors.detail.notFound.title')}
            body={t('monitors.detail.notFound.body')}
          />
        </View>

        {/* Placeholder action bar — disabled until the monitor is live */}
        <View style={[styles.row, { gap: spacing[2], marginTop: spacing[6] }]}>
          <Button
            label={t('monitors.detail.actions.recheck')}
            variant="secondary"
            onPress={() => {}}
            disabled
            fullWidth
          />
          <Button
            label={t('monitors.detail.actions.pause')}
            variant="secondary"
            onPress={() => {}}
            disabled
            fullWidth
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.light.background },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  placeholder: {
    alignItems: 'center',
  },
});
