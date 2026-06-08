/**
 * Monitors tab - the main screen of the app.
 *
 * Phase 2: live data from the Kuma connection manager via the
 * `useMonitors` store. We subscribe to the active server's monitor
 * list, filter chips, and route to a detail screen on tap.
 *
 * Layout:
 * - Glass nav bar with large title
 * - Server switcher chip in the corner
 * - Connection status banner (only when not connected)
 * - Filter chips (All / Up / Down)
 * - Featured monitor card (the first one)
 * - List of monitor rows
 * - Empty state when there are no servers, no connection, or no monitors
 *
 * Theme: page bg = surface.background. Server chip + + button use
 * brand tints. Banner uses status-tinted bg/border.
 */

import { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, Server, WifiOff, Loader, Plus } from 'lucide-react-native';

import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { Chip, EmptyState, SafeScrollView } from '@/components/ui';
import { MonitorRow, MonitorCard } from '@/components/monitor';
import { useServers, getActiveServer } from '@/data/store/servers';
import { useMonitors, selectMonitorsForServer } from '@/data/store/monitors';
import { colors, spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { t, tn } from '@/i18n';

type FilterMode = 'all' | 'up' | 'down';

export default function MonitorsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { surface, brand, brandFill, statusTints } = useAppTheme();
  const servers = useServers((s) => s.servers);
  const activeId = useServers((s) => s.activeServerId);
  const [filter, setFilter] = useState<FilterMode>('all');

  // Live data from the active server.
  const active = getActiveServer(servers, activeId);
  const status = useMonitors((s) =>
    active ? s.statusByServer[active.id] ?? 'idle' : 'idle'
  );
  const error = useMonitors((s) => (active ? s.errorByServer[active.id] : null));
  const monitorsRaw = useMonitors((s) =>
    active ? selectMonitorsForServer(s, active.id) : []
  );

  const filteredMonitors = useMemo(() => {
    if (filter === 'up') return monitorsRaw.filter((m) => m.status === 'up' || m.status === 'maintenance');
    if (filter === 'down') return monitorsRaw.filter((m) => m.status === 'down' || m.status === 'pending');
    return monitorsRaw;
  }, [filter, monitorsRaw]);

  // No servers connected — show the onboarding empty state
  if (servers.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: surface.background }]}>
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

  return (
    <View style={[styles.container, { backgroundColor: surface.background }]}>
      <GlassNavBar
        title="Monitors"
        large
        right={
          // flexShrink:1 on the chip so the + button is always
          // visible even with a long server name. The chip will
          // truncate its name rather than push the + off-screen.
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing[2],
              flexShrink: 1,
            }}>
            <Pressable
              onPress={() => router.push('/monitors/add')}
              style={({ pressed }) => [
                styles.addBtn,
                { backgroundColor: brand, opacity: pressed ? 0.7 : 1 },
              ]}
              hitSlop={6}>
              <Plus size={18} color="white" strokeWidth={2.5} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/servers/switch')}
              style={({ pressed }) => [
                styles.serverChip,
                { backgroundColor: brandFill, opacity: pressed ? 0.7 : 1 },
              ]}
              hitSlop={6}>
              <Server size={14} color={brand} strokeWidth={2} />
              <Text
                numberOfLines={1}
                style={[
                  typography.captionEmphasized,
                  { color: brand, maxWidth: 120 },
                ]}>
                {active?.name ?? 'Server'}
              </Text>
              <ChevronDown size={14} color={brand} strokeWidth={2} />
            </Pressable>
          </View>
        }
      />

      <SafeScrollView
        contentContainerStyle={{ paddingHorizontal: spacing[4] }}
        showsVerticalScrollIndicator={false}>
        {/* Connection status banner */}
        {(status === 'connecting' || status === 'reconnecting' || status === 'error') && (
          <View style={[styles.banner, bannerStyle(status, statusTints)]}>
            {status === 'error' ? (
              <WifiOff size={16} color={colors.status.down} strokeWidth={1.75} />
            ) : (
              <Loader size={16} color={colors.status.pending} strokeWidth={1.75} />
            )}
            <Text
              style={[
                typography.captionEmphasized,
                {
                  color:
                    status === 'error' ? colors.status.down : colors.status.pending,
                },
              ]}>
              {status === 'error' && error
                ? tn('monitors.errorBanner', { error })
                : t('monitors.connectingBanner')}
            </Text>
          </View>
        )}

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
            <Text style={[typography.body, { color: surface.textMuted, textAlign: 'center' }]}>
              {status === 'connected'
                ? t('monitors.empty.filtered')
                : t('monitors.empty.connecting')}
            </Text>
          </View>
        )}
      </SafeScrollView>
    </View>
  );
}

function bannerStyle(
  status: string,
  tints: ReturnType<typeof useAppTheme>['statusTints']
) {
  switch (status) {
    case 'error':
      return { backgroundColor: tints.down.bg, borderColor: tints.down.border };
    default:
      return { backgroundColor: tints.pending.bg, borderColor: tints.pending.border };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  serverChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: semanticRadius.pill,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: semanticRadius.button,
    borderWidth: 1,
    marginTop: spacing[2],
  },
  noResults: { paddingVertical: spacing[10] },
});
