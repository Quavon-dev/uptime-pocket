/**
 * Servers tab - manage Kuma server connections.
 *
 * Phase 2: real list of servers, persisted in SQLite. Each card shows
 * the connection state (live from useMonitors), a tap target to open
 * the server detail screen, and a swipe-less long-press → delete (we
 * use the detail screen's delete action instead for safety).
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { Plus, Server } from 'lucide-react-native';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { SafeScrollView, EmptyState } from '@/components/ui';
import { ServerCard } from '@/components/server';
import { useServers, getActiveServer } from '@/data/store/servers';
import { useMonitors } from '@/data/store/monitors';
import { colors, spacing, typography } from '@/theme';
import { t } from '@/i18n';

export default function ServersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const servers = useServers((s) => s.servers);
  const activeId = useServers((s) => s.activeServerId);
  const setActive = useServers((s) => s.setActive);
  const statusByServer = useMonitors((s) => s.statusByServer);
  const monitorsByServer = useMonitors((s) => s.monitorsByServer);

  const active = getActiveServer(servers, activeId);

  return (
    <View style={styles.container}>
      <GlassNavBar
        title={t('servers.list.title')}
        right={
          <Pressable
            onPress={() => router.push('/servers/add')}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <Plus size={26} color={colors.brand[500]} strokeWidth={2} />
          </Pressable>
        }
      />

      <SafeScrollView
        contentContainerStyle={{
          padding: spacing[4],
          paddingBottom: insets.bottom + 80,
        }}>
        {servers.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState
              icon={Server}
              title="No servers yet"
              body="Add your first Kuma instance to start monitoring."
              action={{
                label: t('servers.list.addServer'),
                onPress: () => router.push('/servers/add'),
              }}
            />
          </View>
        ) : (
          <View style={{ gap: spacing[2] }}>
            {servers.map((server) => {
              const status = statusByServer[server.id] ?? 'idle';
              const monitorCount = monitorsByServer[server.id]?.length ?? 0;
              return (
                <Pressable
                  key={server.id}
                  onPress={() => router.push(`/servers/${server.id}`)}
                  onLongPress={() => setActive(server.id)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
                  <ServerCard
                    server={server}
                    isActive={server.id === activeId}
                    monitorCount={monitorCount}
                    showChevron
                    connectionStatus={status}
                  />
                </Pressable>
              );
            })}

            {/* Server switcher hint when there's an active server */}
            {active && (
              <View style={styles.hint}>
                <SymbolView
                  name={{ ios: 'hand.tap', android: 'touch_app', web: 'touch_app' }}
                  tintColor={colors.gray[500]}
                  size={14}
                />
                <Text style={[typography.caption, { color: colors.surface.light.textMuted, flex: 1 }]}>
                  {t('servers.list.longPressHint')}
                </Text>
              </View>
            )}
          </View>
        )}
      </SafeScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.light.background },
  empty: { paddingTop: spacing[8] },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingTop: spacing[3],
  },
});
