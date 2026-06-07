/**
 * Server detail screen.
 *
 * Shows:
 * - Server name + url
 * - Connection status (live from the monitors store)
 * - Detected Kuma version + outdated warning if < 2.0.0
 * - Auth method (with a note that the secret lives in the Keychain)
 * - Notification mode
 * - Created/connected timestamps
 *
 * Actions:
 * - Edit → re-uses the add form in "edit" mode (future)
 * - Delete → confirm dialog → removes metadata + credentials
 */

import { useState } from 'react';
import {
  View,
  Text,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { ArrowLeft, Trash2, ExternalLink, AlertTriangle, CircleDot } from 'lucide-react-native';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { SafeScrollView } from '@/components/ui';
import { useServers } from '@/data/store/servers';
import { useMonitors } from '@/data/store/monitors';
import { colors, spacing, typography, semanticRadius } from '@/theme';
import { t, tn } from '@/i18n';

const MIN_KUMA_VERSION = '2.0.0';

export default function ServerDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const server = useServers((s) => s.servers.find((srv) => srv.id === id));
  const removeServer = useServers((s) => s.removeServer);
  const status = useMonitors((s) => (id ? s.statusByServer[id] : 'idle') ?? 'idle');
  const error = useMonitors((s) => (id ? s.errorByServer[id] : null) ?? null);
  const monitorList = useMonitors((s) => (id ? s.monitorsByServer[id] : undefined));
  const monitorCount = monitorList?.length ?? 0;
  const upCount = monitorList?.filter((m) => m.status === 'up').length ?? 0;
  const downCount = monitorList?.filter((m) => m.status === 'down').length ?? 0;

  const [deleting, setDeleting] = useState(false);

  if (!server) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <GlassNavBar
          title={t('servers.detail.notFound.title')}
          left={
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <ArrowLeft size={24} color={colors.surface.light.text} strokeWidth={1.5} />
            </Pressable>
          }
        />
        <SafeScrollView contentContainerStyle={{ padding: spacing[4] }}>
          <Text style={[typography.body, { color: colors.surface.light.textMuted }]}>
            {t('servers.detail.notFound.body')}
          </Text>
        </SafeScrollView>
      </View>
    );
  }

  const isOutdated =
    server.kumaVersion && isOlderVersion(server.kumaVersion, MIN_KUMA_VERSION);

  const handleDelete = () => {
    Alert.alert(
      t('servers.detail.deleteConfirm.title'),
      tn('servers.detail.deleteConfirm.body', { name: server.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await removeServer(server.id);
              router.back();
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar
        title={server.name}
        left={
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <ArrowLeft size={24} color={colors.surface.light.text} strokeWidth={1.5} />
          </Pressable>
        }
        right={
          <Pressable onPress={handleDelete} hitSlop={10} disabled={deleting}>
            <Trash2
              size={22}
              color={deleting ? colors.surface.light.textMuted : colors.status.down}
              strokeWidth={1.5}
            />
          </Pressable>
        }
      />

      <SafeScrollView
        contentContainerStyle={{
          padding: spacing[4],
          gap: spacing[4],
        }}>
        {/* Status banner */}
        <View style={[styles.banner, bannerStyle(status)]}>
          <CircleDot
            size={14}
            color={statusColor(status)}
            fill={statusColor(status)}
            strokeWidth={0}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.bodyEmphasized, { color: colors.surface.light.text }]}>
              {t(`servers.detail.status.${status}`)}
            </Text>
            {error && status === 'error' && (
              <Text style={[typography.caption, { color: colors.status.down }]}>
                {error}
              </Text>
            )}
          </View>
        </View>

        {/* Outdated Kuma warning */}
        {isOutdated && (
          <View style={styles.warningBox}>
            <AlertTriangle size={18} color={colors.status.pending} strokeWidth={1.75} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.bodyEmphasized, { color: colors.surface.light.text }]}>
                {t('servers.detail.outdated.title')}
              </Text>
              <Text style={[typography.caption, { color: colors.surface.light.textMuted }]}>
                {tn('servers.detail.outdated.body', {
                  version: server.kumaVersion ?? '',
                  min: MIN_KUMA_VERSION,
                })}
              </Text>
            </View>
          </View>
        )}

        {/* Details */}
        <Section title={t('servers.detail.connection.title')}>
          <Row label={t('servers.detail.connection.url')} value={server.url} />
          <Row
            label={t('servers.detail.connection.auth')}
            value={
              server.authKind === 'bearer'
                ? t('servers.detail.connection.bearerToken')
                : t('servers.detail.connection.password')
            }
          />
          <Row
            label={t('servers.detail.connection.version')}
            value={server.kumaVersion ?? t('servers.detail.connection.unknown')}
          />
          {server.lastConnectedAt && (
            <Row
              label={t('servers.detail.connection.lastConnected')}
              value={new Date(server.lastConnectedAt).toLocaleString()}
            />
          )}
          <Row
            label={t('servers.detail.connection.added')}
            value={new Date(server.createdAt).toLocaleString()}
          />
        </Section>

        <Section title={t('servers.detail.notifications.title')}>
          <Row
            label={t('servers.detail.notifications.mode')}
            value={t(`servers.detail.notifications.${server.notificationMode}`)}
          />
        </Section>

        {/* Live monitor summary */}
        {monitorCount > 0 && (
          <Section title={t('servers.detail.monitors.title')}>
            <Row
              label={t('servers.detail.monitors.total')}
              value={tn('servers.detail.monitors.totalCount', { count: monitorCount })}
            />
            <Row
              label={t('servers.detail.monitors.up')}
              value={String(upCount)}
            />
            <Row
              label={t('servers.detail.monitors.down')}
              value={String(downCount)}
            />
          </Section>
        )}

        {/* Open in Kuma button */}
        <Pressable
          onPress={() => {
            void Linking.openURL(server.url);
          }}
          style={({ pressed }) => [styles.openBtn, { opacity: pressed ? 0.85 : 1 }]}>
          <ExternalLink size={18} color={colors.brand[500]} strokeWidth={1.75} />
          <Text style={[typography.bodyEmphasized, { color: colors.brand[500] }]}>
            {t('servers.detail.openInKuma')}
          </Text>
        </Pressable>
      </SafeScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing[2] }}>
      <Text
        style={[
          typography.micro,
          { color: colors.surface.light.textMuted, paddingHorizontal: spacing[2] },
        ]}>
        {title.toUpperCase()}
      </Text>
      <View
        style={{
          backgroundColor: colors.surface.light.elevated,
          borderRadius: semanticRadius.card,
          borderWidth: 0.5,
          borderColor: colors.surface.light.border,
          overflow: 'hidden',
        }}>
        {children}
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing[4],
        paddingVertical: spacing[3],
        borderBottomWidth: 0.5,
        borderBottomColor: colors.surface.light.border,
      }}>
      <Text style={[typography.body, { color: colors.surface.light.textMuted }]}>
        {label}
      </Text>
      <Text
        style={[typography.callout, { color: colors.surface.light.text, maxWidth: '60%' }]}
        numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function bannerStyle(status: string) {
  switch (status) {
    case 'connected':
      return { borderColor: `${colors.status.up}40`, backgroundColor: `${colors.status.up}14` };
    case 'reconnecting':
    case 'connecting':
      return { borderColor: `${colors.status.pending}40`, backgroundColor: `${colors.status.pending}14` };
    case 'error':
      return { borderColor: `${colors.status.down}40`, backgroundColor: `${colors.status.down}14` };
    default:
      return { borderColor: colors.surface.light.border, backgroundColor: colors.surface.light.elevated };
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'connected':
      return colors.status.up;
    case 'reconnecting':
    case 'connecting':
      return colors.status.pending;
    case 'error':
      return colors.status.down;
    default:
      return colors.gray[500];
  }
}

function isOlderVersion(version: string, min: string): boolean {
  const v = version.split('.').map(Number);
  const m = min.split('.').map(Number);
  for (let i = 0; i < Math.max(v.length, m.length); i++) {
    const a = v[i] ?? 0;
    const b = m[i] ?? 0;
    if (a < b) return true;
    if (a > b) return false;
  }
  return false;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.light.background },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: semanticRadius.card,
    borderWidth: 1,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: semanticRadius.card,
    backgroundColor: `${colors.status.pending}1A`,
    borderWidth: 1,
    borderColor: `${colors.status.pending}40`,
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    borderRadius: semanticRadius.button,
    borderWidth: 1,
    borderColor: colors.brand[500],
  },
});
