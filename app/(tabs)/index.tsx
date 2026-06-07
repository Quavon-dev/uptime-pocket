/**
 * Monitors tab - the main screen of the app.
 *
 * Phase 0.2 / Phase 1: Layout is fully built with our design system components.
 * Real data from the Kuma connection manager will be wired in during Phase 2
 * (task 7: active server drives connection).
 *
 * Layout:
 * - Glass nav bar with large title
 * - Server switcher chip
 * - Filter chips (All / Up / Down)
 * - List of monitor rows
 * - Empty state when no servers
 *
 * Without a connected server, we show the onboarding empty state with a CTA
 * to add a server.
 */

import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, Server } from 'lucide-react-native';

import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { Chip } from '@/components/ui/Chip';
import { EmptyState, SafeScrollView } from '@/components/ui';
import { useServers } from '@/data/store/servers';
import { colors, spacing, typography, semanticRadius } from '@/theme';
import { t } from '@/i18n';

type FilterMode = 'all' | 'up' | 'down';

export default function MonitorsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const servers = useServers((s) => s.servers);
  const activeId = useServers((s) => s.activeServerId);
  const [filter, setFilter] = useState<FilterMode>('all');

  // TODO(phase-2): replace with live monitor data from the Kuma connection
  // manager. For now the list is empty and we show a single empty state
  // regardless of which filter is selected.

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

  // Server(s) connected, but no live monitor data yet
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

      <SafeScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing[4],
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

        {/* Empty list — the connection manager will populate this in Phase 2 */}
        <View style={styles.noResults}>
          <Text style={[typography.body, { color: colors.surface.light.textMuted, textAlign: 'center' }]}>
            No monitors in this state.
          </Text>
        </View>
      </SafeScrollView>
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
