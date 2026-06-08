/**
 * ServerSwitcher - bottom sheet for choosing the active server.
 *
 * Phase 0: A modal screen. In Phase 1, this will become a real
 * native iOS bottom sheet via expo-router.
 *
 * Lists all configured servers, allows the user to:
 * - See each server's status
 * - Mark one as active
 * - Navigate to a server's detail/settings
 *
 * Theme: page background is surface.background. The "add" CTA uses
 * brand as text and border.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, Plus, X } from 'lucide-react-native';
import { spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { SafeScrollView } from '@/components/ui';
import { ServerCard } from './ServerCard';
import { useServers } from '@/data/store/servers';

interface ServerSwitcherProps {
  onClose?: () => void;
}

export function ServerSwitcher({ onClose }: ServerSwitcherProps) {
  const router = useRouter();
  const servers = useServers((s) => s.servers);
  const activeId = useServers((s) => s.activeServerId);
  const setActive = useServers((s) => s.setActive);
  const { surface, brand } = useAppTheme();

  const handleSelect = (id: string) => {
    setActive(id);
    onClose?.();
  };

  return (
    <View style={[styles.container, { backgroundColor: surface.background }]}>
      <GlassNavBar
        title="Switch server"
        right={
          onClose ? (
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={24} color={surface.text} strokeWidth={1.5} />
            </Pressable>
          ) : undefined
        }
      />

      <SafeScrollView
        contentContainerStyle={{
          padding: spacing[4],
          gap: spacing[2],
        }}>
        {servers.length === 0 ? (
          <View style={styles.empty}>
            <Text
              style={[
                typography.body,
                { color: surface.textMuted, textAlign: 'center' },
              ]}>
              No servers configured. Add one to get started.
            </Text>
          </View>
        ) : (
          servers.map((server) => (
            <Pressable
              key={server.id}
              onPress={() => handleSelect(server.id)}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
              <View style={styles.serverWrapper}>
                <ServerCard
                  server={server}
                  isActive={server.id === activeId}
                  monitorCount={0}
                />
                {server.id === activeId && (
                  <View style={[styles.checkBadge, { backgroundColor: brand }]}>
                    <Check size={14} color="white" strokeWidth={3} />
                  </View>
                )}
              </View>
            </Pressable>
          ))
        )}

        <Pressable
          onPress={() => {
            onClose?.();
            router.push('/servers/add');
          }}
          style={({ pressed }) => [
            styles.addCard,
            {
              borderColor: brand,
              opacity: pressed ? 0.85 : 1,
            },
          ]}>
          <Plus size={20} color={brand} strokeWidth={2} />
          <Text style={[typography.bodyEmphasized, { color: brand }]}>
            Add new server
          </Text>
        </Pressable>
      </SafeScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  empty: {
    paddingVertical: spacing[10],
  },
  serverWrapper: {
    position: 'relative',
  },
  checkBadge: {
    position: 'absolute',
    top: spacing[3],
    right: spacing[3],
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[4],
    borderRadius: semanticRadius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: spacing[2],
  },
});
