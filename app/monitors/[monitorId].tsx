/**
 * Monitor detail screen.
 *
 * Live data from the Kuma connection manager. Layout:
 * - Header: name, URL, status pill, type
 * - Quick stats: response time, uptime 24h/7d/30d, last check
 * - Action bar: re-check, pause/resume, open in Kuma
 * - Time range selector (24h / 7d / 30d)
 * - Response time chart (line)
 * - Uptime bar (segmented)
 * - Recent incidents (live from useMonitors)
 *
 * All data flows from:
 * - `useMonitors` store for status + heartbeat events
 * - `manager.fetchHeartbeats()` for chart history
 * - `manager.fetchUptime()` for 24h/7d/30d ratios
 * - `manager.recheckMonitor()` / `pauseMonitor()` / `resumeMonitor()` for actions
 *
 * Theme: page bg = surface.background. Header card uses
 * surface.elevated/border. Stat tiles use surface.sunken. Incident
 * list uses surface.elevated.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Linking,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import {
  ArrowLeft,
  ExternalLink,
  RotateCw,
  Pause,
  Play,
  Pencil,
} from 'lucide-react-native';

import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { Button, SegmentedControl, SafeScrollView } from '@/components/ui';
import { StatusPill } from '@/components/status';
import { ResponseTimeChart, UptimeBar } from '@/components/chart';
import { monitorTypeIcon } from '@/components/ui/icons';
import { colors, spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { t, tn } from '@/i18n';
import { useServers } from '@/data/store/servers';
import {
  useMonitors,
  selectMonitorByIdAnyServer,
  selectIncidentsForMonitor,
  selectHeartbeatHistory,
  selectUptimeRatios,
} from '@/data/store/monitors';
import { useKumaConnection } from '@/data/connection/manager';
import { statusColor } from '@/domain/status';
import {
  formatResponseTime,
  formatUptime,
  formatRelativeTime,
} from '@/domain/format';
import type { TimePoint, UptimePoint, Incident, MonitorType } from '@/domain/models';
import type { NormalizedHeartbeatRow } from '@/data/socket/normalize';

type Range = '24h' | '7d' | '30d';

export default function MonitorDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ monitorId: string }>();
  const monitorId = Number(params.monitorId);
  const { surface, brand, statusTints } = useAppTheme();

  // Find the live monitor across all servers the app knows about.
  const found = useMonitors((s) =>
    Number.isFinite(monitorId) ? selectMonitorByIdAnyServer(s, monitorId) : null
  );
  const server = useServers((s) =>
    found ? s.servers.find((srv) => srv.id === found.serverId) : undefined
  );

  // Recent incidents scoped to this monitor + server.
  const incidents = useMonitors((s) =>
    found
      ? selectIncidentsForMonitor(s, found.serverId, monitorId)
      : ([] as Incident[])
  );

  const [range, setRange] = useState<Range>('24h');
  const [heartbeats, setHeartbeats] = useState<NormalizedHeartbeatRow[]>([]);
  const [uptime, setUptime] = useState<{
    uptime24h: number | null;
    uptime7d: number | null;
    uptime30d: number | null;
  }>({ uptime24h: null, uptime7d: null, uptime30d: null });
  const [loading, setLoading] = useState(false);
  const [actionPending, setActionPending] = useState<
    null | 'recheck' | 'pause' | 'resume'
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Read cached heartbeat history + uptime ratios from the store.
  // Kuma 2.3+ pushes these via socket events on connect; the manager
  // caches them in `useMonitors`. The detail screen simply subscribes.
  const cachedHeartbeats = useMonitors((s) =>
    found ? selectHeartbeatHistory(s, found.serverId, monitorId) : []
  );
  const cachedUptime = useMonitors((s) =>
    found ? selectUptimeRatios(s, found.serverId, monitorId) : {}
  );

  // Manager is used by the action handlers (recheck / pause / resume).
  const manager = useKumaConnection();

  // Sync the store data into local component state so consumers
  // (chart + uptime pill) see stable references. The chart and pill
  // recompute when the range changes.
  useEffect(() => {
    setHeartbeats(cachedHeartbeats);
    setUptime({
      uptime24h:
        cachedUptime['24'] != null ? cachedUptime['24'] * 100 : null,
      // Kuma 2.3+ does not push a 7d ratio. We fall back to 30d so
      // the chart still has SOMETHING to show.
      uptime7d: cachedUptime['720'] != null ? cachedUptime['720'] * 100 : null,
      uptime30d:
        cachedUptime['720'] != null ? cachedUptime['720'] * 100 : null,
    });
    setLoading(false);
  }, [cachedHeartbeats, cachedUptime]);

  // --- Actions ------------------------------------------------------------

  const handleRecheck = useCallback(() => {
    if (!found) return;
    setActionError(null);
    setActionPending('recheck');
    try {
      manager.recheckMonitor(found.serverId, monitorId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      // The UI update is driven by the next heartbeat event. We clear
      // the pending flag after a short delay so the user sees feedback.
      setTimeout(() => setActionPending(null), 1500);
    }
  }, [found, monitorId, manager]);

  const handleTogglePause = useCallback(() => {
    if (!found) return;
    setActionError(null);
    if (found.monitor.status === 'paused') {
      setActionPending('resume');
      try {
        manager.resumeMonitor(found.serverId, monitorId);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setTimeout(() => setActionPending(null), 1500);
      }
    } else {
      setActionPending('pause');
      try {
        manager.pauseMonitor(found.serverId, monitorId);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setTimeout(() => setActionPending(null), 1500);
      }
    }
  }, [found, monitorId, manager]);

  const handleOpenInKuma = useCallback(() => {
    if (!server) return;
    void Linking.openURL(server.url);
  }, [server]);

  const handleEdit = useCallback(() => {
    router.push(`/monitors/${monitorId}/edit`);
  }, [router, monitorId]);

  // --- Render guards ------------------------------------------------------

  if (!Number.isFinite(monitorId)) {
    return <NotFoundView router={router} />;
  }
  if (!found || !server) {
    return <NotFoundView router={router} />;
  }
  const { monitor } = found;

  // Translate the normalized heartbeats into chart-friendly shapes.
  const responseSeries: TimePoint[] = heartbeats.map((h) => ({
    timestamp: new Date(h.timestamp),
    value: h.responseTime,
  }));
  const uptimeSeries: UptimePoint[] = heartbeats.map((h) => ({
    timestamp: new Date(h.timestamp),
    up: h.status === 'up' || h.status === 'maintenance',
  }));
  const upPctForRange = uptime[`uptime${rangeKey(range)}`] ?? null;

  return (
    <View style={[styles.container, { backgroundColor: surface.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar
        title={monitor.name}
        left={
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <ArrowLeft size={24} color={surface.text} strokeWidth={1.5} />
          </Pressable>
        }
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <Pressable onPress={handleEdit} hitSlop={10}>
              <Pencil size={22} color={surface.text} strokeWidth={1.5} />
            </Pressable>
            <Pressable onPress={handleOpenInKuma} hitSlop={10}>
              <ExternalLink size={22} color={surface.text} strokeWidth={1.5} />
            </Pressable>
          </View>
        }
      />

      <SafeScrollView
        contentContainerStyle={{ paddingHorizontal: spacing[4] }}
        showsVerticalScrollIndicator={false}>
        {/* Header card */}
        <View
          style={[
            styles.headerCard,
            { backgroundColor: surface.elevated, borderColor: surface.border },
          ]}>
          <View style={styles.headerRow}>
            {renderTypeIcon(monitor.type, brand)}
            <View style={{ flex: 1, gap: spacing[1] }}>
              <Text style={[typography.heading, { color: surface.text }]}>
                {monitor.name}
              </Text>
              {monitor.url ? (
                <Text
                  style={[typography.caption, { color: surface.textMuted }]}
                  numberOfLines={1}>
                  {monitor.url}
                </Text>
              ) : null}
            </View>
            <StatusPill status={monitor.status} />
          </View>

          <View style={styles.statsRow}>
            <Stat
              label={t('monitors.detail.responseTime')}
              value={
                monitor.responseTime != null
                  ? formatResponseTime(monitor.responseTime)
                  : '—'
              }
            />
            <Stat
              label={t('monitors.detail.uptime')}
              value={upPctForRange != null ? formatUptime(upPctForRange) : '—'}
            />
            <Stat
              label="Last check"
              value={
                monitor.lastCheckAt
                  ? formatRelativeTime(monitor.lastCheckAt)
                  : '—'
              }
            />
          </View>
        </View>

        {/* Action bar */}
        <View style={[styles.actionBar, { gap: spacing[2] }]}>
          <Button
            label={t('monitors.detail.actions.recheck')}
            variant="primary"
            onPress={handleRecheck}
            disabled={actionPending !== null}
            icon={
              actionPending === 'recheck' ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <RotateCw size={16} color="white" strokeWidth={1.75} />
              )
            }
            fullWidth
          />
          <Button
            label={
              monitor.status === 'paused'
                ? t('monitors.detail.actions.resume')
                : t('monitors.detail.actions.pause')
            }
            variant="secondary"
            onPress={handleTogglePause}
            disabled={actionPending !== null}
            icon={
              actionPending === 'pause' || actionPending === 'resume' ? (
                <ActivityIndicator size="small" color={brand} />
              ) : monitor.status === 'paused' ? (
                <Play size={16} color={brand} strokeWidth={1.75} />
              ) : (
                <Pause size={16} color={brand} strokeWidth={1.75} />
              )
            }
            fullWidth
          />
        </View>

        {actionError && (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: statusTints.down.bg },
            ]}>
            <Text style={[typography.callout, { color: colors.status.down }]}>
              {actionError}
            </Text>
          </View>
        )}

        {/* Time range */}
        <View style={{ paddingTop: spacing[4] }}>
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

        {/* Response time chart */}
        <View style={styles.section}>
          <SectionLabel>{t('monitors.detail.responseTime')}</SectionLabel>
          {loading && heartbeats.length === 0 ? (
            <View style={[styles.chartPlaceholder, { backgroundColor: surface.sunken }]}>
              <ActivityIndicator size="small" color={brand} />
            </View>
          ) : (
            <>
              <ResponseTimeChart
                data={responseSeries}
                color={statusColor(monitor.status)}
                emptyMessage="No heartbeats in this range"
              />
              {responseSeries.length > 0 && (
                <Text
                  style={[
                    typography.micro,
                    {
                      color: surface.textMuted,
                      paddingHorizontal: spacing[2],
                      paddingTop: spacing[1],
                    },
                  ]}>
                  {tn('monitors.detail.chartRange', {
                    count: responseSeries.length,
                    span: formatRelativeTime(
                      new Date(responseSeries[0].timestamp)
                    ),
                  })}
                </Text>
              )}
            </>
          )}
        </View>

        {/* Uptime bar */}
        <View style={styles.section}>
          <SectionLabel>{t('monitors.detail.uptime')}</SectionLabel>
          {loading && heartbeats.length === 0 ? (
            <View style={[styles.chartPlaceholder, { backgroundColor: surface.sunken }]}>
              <ActivityIndicator size="small" color={brand} />
            </View>
          ) : (
            <UptimeBar data={uptimeSeries} />
          )}
        </View>

        {/* Recent incidents */}
        <View style={styles.section}>
          <SectionLabel>{t('monitors.detail.incidents')}</SectionLabel>
          {incidents.length === 0 ? (
            <Text
              style={[
                typography.body,
                { color: surface.textMuted, textAlign: 'center', paddingVertical: spacing[3] },
              ]}>
              No incidents in this session.
            </Text>
          ) : (
            <View
              style={[
                styles.incidentList,
                { backgroundColor: surface.elevated, borderColor: surface.border },
              ]}>
              {incidents.slice(0, 10).map((inc, idx) => (
                <View
                  key={inc.id}
                  style={[
                    styles.incidentRow,
                    {
                      borderBottomColor: surface.border,
                      borderBottomWidth: idx === Math.min(incidents.length, 10) - 1 ? 0 : 0.5,
                    },
                  ]}>
                  <View
                    style={[
                      styles.incidentDot,
                      {
                        backgroundColor:
                          inc.cause === 'down' ? colors.status.down : colors.status.up,
                      },
                    ]}
                  />
                  <Text
                    style={[typography.callout, { color: surface.text, flex: 1 }]}>
                    {inc.cause === 'down' ? 'Down' : 'Recovered'}
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      { color: surface.textMuted },
                    ]}>
                    {formatRelativeTime(inc.startedAt)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </SafeScrollView>
    </View>
  );
}

// ---- Small sub-components ----------------------------------------------

function NotFoundView({ router }: { router: ReturnType<typeof useRouter> }) {
  const { surface } = useAppTheme();
  return (
    <View style={[styles.container, { backgroundColor: surface.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar
        title={t('monitors.detail.notFound.title')}
        left={
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <ArrowLeft size={24} color={surface.text} strokeWidth={1.5} />
          </Pressable>
        }
      />
      <SafeScrollView contentContainerStyle={{ padding: spacing[4] }}>
        <View style={styles.notFoundBody}>
          <Text style={[typography.body, { color: surface.textMuted }]}>
            {t('monitors.detail.notFound.body')}
          </Text>
        </View>
      </SafeScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { surface } = useAppTheme();
  return (
    <View style={[styles.stat, { backgroundColor: surface.sunken }]}>
      <Text style={[typography.micro, { color: surface.textMuted }]}>
        {label.toUpperCase()}
      </Text>
      <Text style={[typography.title, { color: surface.text }]}>
        {value}
      </Text>
    </View>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const { surface } = useAppTheme();
  return (
    <Text
      style={[
        typography.micro,
        { color: surface.textMuted, paddingHorizontal: spacing[2] },
      ]}>
      {String(children).toUpperCase()}
    </Text>
  );
}

function renderTypeIcon(type: string, brand: string) {
  const Icon = monitorTypeIcon(type as MonitorType);
  return <Icon size={20} color={brand} strokeWidth={1.75} />;
}

function rangeKey(range: Range): '24h' | '7d' | '30d' {
  return range;
}

// ---- Styles ------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerCard: {
    borderRadius: semanticRadius.card,
    borderWidth: 0.5,
    padding: spacing[4],
    gap: spacing[4],
    marginTop: spacing[3],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  stat: {
    flex: 1,
    borderRadius: 12,
    padding: spacing[3],
    gap: spacing[1],
  },
  actionBar: {
    flexDirection: 'row',
    marginTop: spacing[4],
  },
  errorBox: {
    marginTop: spacing[2],
    padding: spacing[3],
    borderRadius: 12,
  },
  section: {
    marginTop: spacing[5],
    gap: spacing[2],
  },
  chartPlaceholder: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  incidentList: {
    borderRadius: semanticRadius.card,
    borderWidth: 0.5,
    overflow: 'hidden',
  },
  incidentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  incidentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  notFoundBody: {
    paddingTop: spacing[8],
  },
});
