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
 *
 * Theme: page bg = surface.background. Status banner uses
 * statusTints.{up,pending,down}. Section cards use surface.elevated
 * with surface.border.
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
import { ArrowLeft, Trash2, ExternalLink, AlertTriangle, CircleDot, Pencil } from 'lucide-react-native';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { SafeScrollView } from '@/components/ui';
import { useServers } from '@/data/store/servers';
import { useMonitors, selectServerInfo } from '@/data/store/monitors';
import { colors, spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { t, tn } from '@/i18n';
import { formatTimezoneOffset } from '@/lib/timezoneOffset';

const MIN_KUMA_VERSION = '2.0.0';

type Status = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export default function ServerDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { surface, brand, statusTints } = useAppTheme();

  const server = useServers((s) => s.servers.find((srv) => srv.id === id));
  const removeServer = useServers((s) => s.removeServer);
  const status: Status = useMonitors((s) => (id ? s.statusByServer[id] : 'idle') ?? 'idle') as Status;
  const error = useMonitors((s) => (id ? s.errorByServer[id] : null) ?? null);
  const monitorList = useMonitors((s) => (id ? s.monitorsByServer[id] : undefined));
  // Server-reported info (version, timezone, etc.) — comes from Kuma's
  // `info` socket event on connect. We display the timezone alongside
  // the version, so the user can see at a glance whether their phone's
  // clock and Kuma's clock are in sync.
  const info = useMonitors((s) => (id ? selectServerInfo(s, id) : null));
  const monitorCount = monitorList?.length ?? 0;
  const upCount = monitorList?.filter((m) => m.status === 'up').length ?? 0;
  const downCount = monitorList?.filter((m) => m.status === 'down').length ?? 0;

  const [deleting, setDeleting] = useState(false);

  if (!server) {
    return (
      <View style={[styles.container, { backgroundColor: surface.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <GlassNavBar
          title={t('servers.detail.notFound.title')}
          left={
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <ArrowLeft size={24} color={surface.text} strokeWidth={1.5} />
            </Pressable>
          }
        />
        <SafeScrollView contentContainerStyle={{ padding: spacing[4] }}>
          <Text style={[typography.body, { color: surface.textMuted }]}>
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
    <View style={[styles.container, { backgroundColor: surface.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar
        title={server.name}
        left={
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <ArrowLeft size={24} color={surface.text} strokeWidth={1.5} />
          </Pressable>
        }
        right={
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <Pressable
              onPress={() => router.push(`/servers/${server.id}/edit`)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('common.edit')}>
              <Pencil size={20} color={brand} strokeWidth={1.5} />
            </Pressable>
            <Pressable onPress={handleDelete} hitSlop={10} disabled={deleting}>
              <Trash2
                size={22}
                color={deleting ? surface.textMuted : colors.status.down}
                strokeWidth={1.5}
              />
            </Pressable>
          </View>
        }
      />

      <SafeScrollView
        contentContainerStyle={{
          padding: spacing[4],
          gap: spacing[4],
        }}>
        {/* Status banner */}
        <View style={[styles.banner, bannerStyle(status, statusTints)]}>
          <CircleDot
            size={14}
            color={statusColor(status)}
            fill={statusColor(status)}
            strokeWidth={0}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.bodyEmphasized, { color: surface.text }]}>
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
          <View
            style={[
              styles.warningBox,
              {
                backgroundColor: statusTints.pending.bg,
                borderColor: statusTints.pending.border,
              },
            ]}>
            <AlertTriangle size={18} color={colors.status.pending} strokeWidth={1.75} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.bodyEmphasized, { color: surface.text }]}>
                {t('servers.detail.outdated.title')}
              </Text>
              <Text style={[typography.caption, { color: surface.textMuted }]}>
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
          {info?.serverTimezone && (
            <Row
              label={t('servers.detail.connection.timezone')}
              value={tn('servers.detail.connection.timezoneValue', {
                tz: info.serverTimezone,
                offset: formatTimezoneOffset(info.serverTimezoneOffsetMinutes),
              })}
            />
          )}
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
          style={({ pressed }) => [
            styles.openBtn,
            { borderColor: brand, opacity: pressed ? 0.85 : 1 },
          ]}>
          <ExternalLink size={18} color={brand} strokeWidth={1.75} />
          <Text style={[typography.bodyEmphasized, { color: brand }]}>
            {t('servers.detail.openInKuma')}
          </Text>
        </Pressable>
      </SafeScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { surface } = useAppTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      <Text
        style={[
          typography.micro,
          { color: surface.textMuted, paddingHorizontal: spacing[2] },
        ]}>
        {title.toUpperCase()}
      </Text>
      <View
        style={{
          backgroundColor: surface.elevated,
          borderRadius: semanticRadius.card,
          borderWidth: 0.5,
          borderColor: surface.border,
          overflow: 'hidden',
        }}>
        {children}
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { surface } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing[4],
        paddingVertical: spacing[3],
        borderBottomWidth: 0.5,
        borderBottomColor: surface.border,
      }}>
      <Text style={[typography.body, { color: surface.textMuted }]}>
        {label}
      </Text>
      <Text
        style={[typography.callout, { color: surface.text, maxWidth: '60%' }]}
        numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function bannerStyle(
  status: Status,
  tints: ReturnType<typeof useAppTheme>['statusTints']
) {
  switch (status) {
    case 'connected':
      return { borderColor: tints.up.border, backgroundColor: tints.up.bg };
    case 'reconnecting':
    case 'connecting':
      return { borderColor: tints.pending.border, backgroundColor: tints.pending.bg };
    case 'error':
      return { borderColor: tints.down.border, backgroundColor: tints.down.bg };
    default:
      return { borderColor: tints.paused.border, backgroundColor: 'transparent' };
  }
}

function statusColor(status: Status): string {
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

/**
 * Format a Kuma `serverTimezoneOffset` (minutes east of UTC) as the
 * short string we display, e.g. `+02:00` or `-05:30`. Implemented in
 * `@/lib/timezoneOffset` so the unit test can target it directly.
 */

const styles = StyleSheet.create({
  container: { flex: 1 },
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
    borderWidth: 1,
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    borderRadius: semanticRadius.button,
    borderWidth: 1,
  },
});
