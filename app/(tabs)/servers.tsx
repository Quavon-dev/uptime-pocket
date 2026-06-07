/**
 * Servers tab - manage Kuma server connections.
 * Phase 0: list with "Add server" CTA, no persistence yet.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { colors, spacing, typography, semanticRadius } from '@/theme';
import { useServers } from '@/data/store/servers';

export default function ServersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const servers = useServers((s) => s.servers);

  return (
    <View style={styles.container}>
      <GlassNavBar
        title="Servers"
        right={
          <Pressable
            onPress={() => router.push('/servers/add')}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <SymbolView
              name={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add' }}
              tintColor={colors.brand[500]}
              size={28}
            />
          </Pressable>
        }
      />

      <View style={[styles.content, { paddingBottom: insets.bottom + 80 }]}>
        {servers.length === 0 ? (
          <View style={styles.empty}>
            <SymbolView
              name={{ ios: 'server.rack', android: 'storage', web: 'storage' }}
              tintColor={colors.gray[400]}
              size={48}
            />
            <Text style={[typography.body, { color: colors.gray[500], marginTop: spacing[3] }]}>
              No servers yet. Tap + to add your first Kuma instance.
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing[2] }}>
            {servers.map((server) => (
              <View key={server.id} style={styles.serverCard}>
                <Text style={typography.bodyEmphasized}>{server.name}</Text>
                <Text style={[typography.caption, { color: colors.gray[500] }]}>
                  {server.url}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.light.background },
  content: {
    flex: 1,
    padding: spacing[4],
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serverCard: {
    padding: spacing[4],
    backgroundColor: colors.surface.light.elevated,
    borderRadius: semanticRadius.card,
    borderWidth: 0.5,
    borderColor: colors.surface.light.border,
  },
});
