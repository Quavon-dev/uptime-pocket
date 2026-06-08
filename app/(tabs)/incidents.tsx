/**
 * Incidents tab - history of monitor down/recovery events.
 *
 * Live data from `useMonitors.incidentsByServer`. The connection manager
 * pushes an `incident` event whenever a status change happens, and we
 * keep a rolling buffer of the most recent 50 per server.
 *
 * The list shows the active server's incidents, most-recent first.
 * Grouped by cause (down vs recovery) and tagged with the monitor name.
 *
 * Theme: page bg = surface.background; list uses surface.elevated
 * with surface.border for hairlines between rows.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { EmptyState, SafeScrollView } from '@/components/ui';
import { useServers, getActiveServer } from '@/data/store/servers';
import {
  useMonitors,
  selectIncidentsForServer,
} from '@/data/store/monitors';
import { colors, spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { useMonitorsStoreForMonitorName } from '@/features/incidents/useIncidentMonitorName';
import { formatRelativeTime } from '@/domain/format';
import { AlertTriangle, Server } from 'lucide-react-native';

export default function IncidentsScreen() {
  const router = useRouter();
  const { surface } = useAppTheme();
  const servers = useServers((s) => s.servers);
  const activeId = useServers((s) => s.activeServerId);
  const active = getActiveServer(servers, activeId);
  const incidents = useMonitors((s) =>
    active ? selectIncidentsForServer(s, active.id) : []
  );
  const monitorNameById = useMonitorsStoreForMonitorName(active?.id);

  // No servers at all → show the empty state with a CTA.
  if (servers.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: surface.background }]}>
        <GlassNavBar title="Incidents" />
        <EmptyState
          icon={Server}
          title="No incidents yet"
          body="Add a Kuma server to start monitoring. Incidents will appear here as status changes happen."
          action={{
            label: 'Add server',
            onPress: () => router.push('/servers/add'),
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: surface.background }]}>
      <GlassNavBar title="Incidents" />

      <SafeScrollView
        contentContainerStyle={{ padding: spacing[4] }}
        showsVerticalScrollIndicator={false}>
        {incidents.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="No incidents in this session"
            body={
              active
                ? `When a monitor on ${active.name} goes down or recovers, it'll show up here.`
                : 'Incidents will appear here as your monitors change status.'
            }
          />
        ) : (
          <View
            style={[
              styles.list,
              { backgroundColor: surface.elevated, borderColor: surface.border },
            ]}>
            {incidents.map((inc, idx) => (
              <Pressable
                key={inc.id}
                onPress={() => router.push(`/monitors/${inc.monitorId}`)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    // Last row: no bottom border. Otherwise hairline.
                    borderBottomColor: surface.border,
                    borderBottomWidth: idx === incidents.length - 1 ? 0 : 0.5,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        inc.cause === 'down' ? colors.status.down : colors.status.up,
                    },
                  ]}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={[
                      typography.bodyEmphasized,
                      { color: surface.text },
                    ]}
                    numberOfLines={1}>
                    {monitorNameById(inc.monitorId)}
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      { color: surface.textMuted },
                    ]}>
                    {inc.cause === 'down' ? 'Went down' : 'Recovered'} · {formatRelativeTime(inc.startedAt)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </SafeScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: {
    borderRadius: semanticRadius.card,
    borderWidth: 0.5,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
