/**
 * Monitors tab - the main screen of the app.
 *
 * Phase 0.2: Now shows a list of sample monitors using the new design
 * system components. When real Kuma servers are connected, we'll swap
 * the sample data for live socket.io data.
 *
 * Layout:
 * - Glass nav bar with large title
 * - Server switcher chip
 * - Filter chips (All / Up / Down)
 * - List of monitor rows
 * - Empty state when no servers
 */

import { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, Server } from 'lucide-react-native';

import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui';
import { MonitorRow, MonitorCard } from '@/components/monitor';
import { SAMPLE_MONITORS } from '@/lib/sample-data';
import { colors, spacing, typography, semanticRadius } from '@/theme';
import { useServers } from '@/data/store/servers';
import { t } from '@/i18n';

type FilterMode = 'all' | 'up' | 'down';

export default function MonitorsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const servers = useServers((s) => s.servers);
  const activeId = useServers((s) => s.activeServerId);
  const [filter, setFilter] = useState<FilterMode>('all');

  const filteredMonitors = useMemo(() => {
    if (filter === 'up') return SAMPLE_MONITORS.filter((m) => m.status === 'up' || m.status === 'maintenance');
    if (filter === 'down') return SAMPLE_MONITORS.filter((m) => m.status === 'down' || m.status === 'pending');
    return SAMPLE_MONITORS;
  }, [filter]);

  // No servers connected — show the onboarding empty state
  if (servers.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface.light.background }]}>
        <GlassNavBar title="Monitors" large subtitle={t('app.tagline')} />

        <View style={[styles.content, { paddingBottom: insets.bottom + 80 }]}>
          <EmptyState
            icon={Server}
            title={t('monitors.empty.title')}
            body={t('monitors.empty.body')}
            action={{
              label: t('monitors.empty.action'),
              onPress: () => router.push('/servers/add'),
            }}
          />
        </View>
      </View>
    );
  }

  // Real servers connected — show monitor list
  return (
    <View style={[styles.container, { backgroundColor: colors.surface.light.background }]}>
      <GlassNavBar
        title="Monitors"
        large
        right={
          <Pressable
            onPress={() => router.push('/servers/switch')}
            style={({ pressed }) => [
              styles.serverChip,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            hitSlop={6}>
            <Server size={14} color={colors.brand[500]} strokeWidth={2} />
            <Text style={[typography.captionEmphasized, { color: colors.brand[500] }]}>
              {servers.find((s) => s.id === activeId)?.name ?? 'Server'}
            </Text>
            <ChevronDown size={14} color={colors.brand[500]} strokeWidth={2} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing[4],
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}>
        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing[2], paddingVertical: spacing[2] }}>
          <Chip
            label="All"
            selected={filter === 'all'}
            onPress={() => setFilter('all')}
          />
          <Chip
            label="Up"
            selected={filter === 'up'}
            onPress={() => setFilter('up')}
            selectedColor={colors.status.up}
          />
          <Chip
            label="Down"
            selected={filter === 'down'}
            onPress={() => setFilter('down')}
            selectedColor={colors.status.down}
          />
          <Chip label="Pending" onPress={() => {}} />
          <Chip label="Maintenance" onPress={() => {}} />
        </ScrollView>

        {/* Featured: the first monitor as a large card */}
        {filteredMonitors.length > 0 && (
          <View style={{ marginTop: spacing[3] }}>
            <MonitorCard
              monitor={filteredMonitors[0]}
              onPress={() => router.push(`/monitors/${filteredMonitors[0].id}`)}
            />
          </View>
        )}

        {/* The rest as dense rows */}
        <View style={{ marginTop: spacing[4], gap: spacing[2] }}>
          {filteredMonitors.slice(1).map((monitor) => (
            <MonitorRow
              key={monitor.id}
              monitor={monitor}
              onPress={() => router.push(`/monitors/${monitor.id}`)}
            />
          ))}
        </View>

        {filteredMonitors.length === 0 && (
          <View style={styles.noResults}>
            <Text style={[typography.body, { color: colors.surface.light.textMuted, textAlign: 'center' }]}>
              No monitors in this state.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
  },
  serverChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: semanticRadius.pill,
    backgroundColor: `${colors.brand[500]}14`,
  },
  noResults: {
    paddingVertical: spacing[10],
  },
});
