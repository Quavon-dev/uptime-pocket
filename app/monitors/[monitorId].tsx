/**
 * Monitor detail screen.
 *
 * Live data from the Kuma connection manager. Layout:
 * - Header: name, URL, status pill, type
 * - Quick stats: response time, last check
 * - Kuma-style 4-uptime-pill row: 7d / 24h / 30d / 1y (always shown,
 *   independent of the chart range selector)
 * - Kuma-style min/avg/max ping readout for the current chart range
 * - Action bar: re-check, pause/resume, open in Kuma
 * - Time range selector (Recent / 3h / 6h / 24h / 1w) — controls
 *   the chart only, not the uptime pills
 * - Response time chart (Kuma-style: min/avg/max lines + status bar
 *   overlay)
 * - Uptime bar (segmented)
 * - Recent incidents (live from useMonitors)
 *
 * All data flows from:
 * - `useMonitors` store for status + heartbeat events + uptime ratios
 *   (Kuma 2.3+ pushes the 4 uptime windows + 100-row heartbeatList
 *   on connect; the manager caches them)
 * - `manager.recheckMonitor()` / `pauseMonitor()` / `resumeMonitor()`
 *   for actions
 *
 * Theme: page bg = surface.background. Header card uses
 * surface.elevated/border. Stat tiles use surface.sunken. Incident
 * list uses surface.elevated.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  ResponseTimeChart,
  UptimeBar,
  kumaPingColors,
  type Series,
  type StatusPoint,
} from '@/components/chart';
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
import {
  formatResponseTime,
  formatUptime,
  formatRelativeTime,
} from '@/domain/format';
import type { TimePoint, UptimePoint, Incident, MonitorType } from '@/domain/models';
import type { NormalizedHeartbeatRow } from '@/data/socket/normalize';

type Range = 'recent' | '3h' | '6h' | '24h' | '1w';

// Map range → hours used to slice the cached heartbeat history.
// `recent` is "show all 100 heartbeats from the burst" (no time slice).
const RANGE_HOURS: Record<Range, number | 'recent'> = {
  recent: 'recent',
  '3h': 3,
  '6h': 6,
  '24h': 24,
  '1w': 24 * 7,
};

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

  const [range, setRange] = useState<Range>('recent');
  const [heartbeats, setHeartbeats] = useState<NormalizedHeartbeatRow[]>([]);
  // Server-aggregated chart data for the currently selected range.
  // Populated by `getMonitorChartData(monitorId, periodHours)`. `null`
  // = not yet fetched, `[]` = fetched but empty, `Array` = real data.
  // For the 'recent' range, this stays null and we fall back to the
  // local-cached heartbeat list (Path A in the protocol skill).
  const [chartData, setChartData] = useState<
    import('@/data/socket/normalize').NormalizedChartDatapoint[] | null
  >(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  // All four Kuma-pushed uptime windows. Kuma 2.3+ sends 24, 168 (7d),
  // 720 (30d), and "1y" — all real data, no fudging required.
  const [uptime, setUptime] = useState<{
    uptime24h: number | null;
    uptime7d: number | null;
    uptime30d: number | null;
    uptime1y: number | null;
  }>({ uptime24h: null, uptime7d: null, uptime30d: null, uptime1y: null });
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

  // --- Data shaping ------------------------------------------------------
  //
  // All hooks below must run unconditionally (no early return before
  // them). They depend only on the cached heartbeat rows + the range
  // selector; they do not need `found` or `server` to be resolved.
  // The early-return render guards (NotFoundView) come after.
  //
  // Translate the normalized heartbeats into chart-friendly shapes.
  // Slice by the selected range: 'recent' = all 100 heartbeats from
  // the burst (no time filter), anything else = the last N hours.
  const rangeHours = RANGE_HOURS[range];
  const slicedHeartbeats = useMemo(() => {
    if (rangeHours === 'recent') return heartbeats;
    if (heartbeats.length === 0) return heartbeats;
    const cutoff = Date.now() - rangeHours * 60 * 60 * 1000;
    return heartbeats.filter((h) => h.timestamp >= cutoff);
  }, [heartbeats, rangeHours]);

  const responseSeries: TimePoint[] = useMemo(
    () =>
      slicedHeartbeats.map((h) => ({
        timestamp: new Date(h.timestamp),
        value: h.responseTime,
      })),
    [slicedHeartbeats]
  );
  const uptimeSeries: UptimePoint[] = useMemo(
    () =>
      slicedHeartbeats.map((h) => ({
        timestamp: new Date(h.timestamp),
        up: h.status === 'up' || h.status === 'maintenance',
      })),
    [slicedHeartbeats]
  );

  // For Kuma's "min/avg/max" lines:
  //   - If we have server-aggregated chart data (the non-Recent ranges
  //     fetched from `getMonitorChartData`), use that directly. The
  //     server already returns per-bucket min/avg/max — no need to
  //     re-bucket client-side.
  //   - For 'recent' (or as a fallback if the server call failed),
  //     we bucket the local-cached heartbeat list ourselves, like
  //     before.
  const aggregatedSeries: Series[] = useMemo(() => {
    const palette = kumaPingColors(brand);

    if (chartData && chartData.length > 0) {
      // Server data path. Skip all-down buckets (avgPing=0 from server
      // means suppressed-during-outage; we don't want a "0ms" point).
      const minPts: TimePoint[] = [];
      const avgPts: TimePoint[] = [];
      const maxPts: TimePoint[] = [];
      for (const d of chartData) {
        if (d.up === 0) continue;
        const ts = new Date(d.timestamp * 1000); // server sends Unix seconds
        if (isFinite(d.minPing)) {
          minPts.push({ timestamp: ts, value: d.minPing });
        }
        if (d.avgPing > 0) {
          avgPts.push({ timestamp: ts, value: d.avgPing });
        }
        if (d.maxPing > 0) {
          maxPts.push({ timestamp: ts, value: d.maxPing });
        }
      }
      return [
        { kind: 'min', data: minPts, color: palette.min, label: t('monitors.detail.responseTimeStats.min') },
        { kind: 'avg', data: avgPts, color: palette.avg, label: t('monitors.detail.responseTimeStats.avg') },
        { kind: 'max', data: maxPts, color: palette.max, label: t('monitors.detail.responseTimeStats.max') },
      ];
    }

    // Fallback: local-cached heartbeats (Recent view, or server call failed).
    if (responseSeries.length === 0) return [];
    // Bucket size: 1 point for "recent", ~12 buckets for the long
    // windows, scale linearly in between.
    const targetBuckets =
      rangeHours === 'recent'
        ? Math.min(responseSeries.length, 100)
        : rangeHours <= 3
          ? Math.max(1, Math.floor(responseSeries.length / 4))
          : rangeHours <= 6
            ? Math.max(1, Math.floor(responseSeries.length / 6))
            : Math.max(1, Math.floor(responseSeries.length / 12));
    const bucketSize = Math.max(1, Math.ceil(responseSeries.length / targetBuckets));
    const minPts: TimePoint[] = [];
    const avgPts: TimePoint[] = [];
    const maxPts: TimePoint[] = [];
    for (let i = 0; i < responseSeries.length; i += bucketSize) {
      const slice = responseSeries.slice(i, i + bucketSize);
      if (slice.length === 0) continue;
      const values = slice.map((p) => p.value).filter((v) => v > 0);
      if (values.length === 0) continue;
      const ts = slice[Math.floor(slice.length / 2)].timestamp;
      minPts.push({ timestamp: ts, value: Math.min(...values) });
      maxPts.push({ timestamp: ts, value: Math.max(...values) });
      avgPts.push({
        timestamp: ts,
        value: values.reduce((a, b) => a + b, 0) / values.length,
      });
    }
    return [
      { kind: 'min', data: minPts, color: palette.min, label: t('monitors.detail.responseTimeStats.min') },
      { kind: 'avg', data: avgPts, color: palette.avg, label: t('monitors.detail.responseTimeStats.avg') },
      { kind: 'max', data: maxPts, color: palette.max, label: t('monitors.detail.responseTimeStats.max') },
    ];
    // We intentionally depend only on the values that matter; `brand`
    // and the i18n labels are stable across re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responseSeries, rangeHours, chartData, brand, t]);

  // Status overlay (Kuma-style) — prefer server data when available
  // (one segment per server bucket), fall back to one segment per
  // local heartbeat otherwise.
  const statusOverlay: StatusPoint[] | undefined = useMemo(() => {
    if (chartData && chartData.length > 0) {
      // Server data. Empty buckets (up=0 && down=0 && maintenance=0)
      // become gaps (no segment) — matches Kuma's web chart.
      return chartData
        .filter(
          (d) => d.up > 0 || d.down > 0 || d.maintenance > 0
        )
        .map((d, _i, arr) => ({
          x: arr.length === 1 ? 0 : chartData.indexOf(d) / (arr.length - 1),
          color:
            d.down > 0
              ? colors.status.down
              : d.maintenance > 0
                ? colors.status.maintenance
                : colors.status.up,
        }));
    }
    if (slicedHeartbeats.length === 0) return undefined;
    return slicedHeartbeats.map((h, i) => ({
      x: slicedHeartbeats.length === 1 ? 0 : i / (slicedHeartbeats.length - 1),
      color:
        h.status === 'down'
          ? colors.status.down
          : h.status === 'maintenance'
            ? colors.status.maintenance
            : h.status === 'pending'
              ? colors.status.pending
              : colors.status.up,
    }));
  }, [slicedHeartbeats, chartData]);

  // Header min/avg/max readout (Kuma-style: "Min 42 · Avg 87 · Max 312 ms").
  // When server chart data is available, use the global min/avg/max
  // across all server buckets (more accurate than client-side recompute
  // of the cached heartbeats). Otherwise fall back to the local data.
  const headerPingStats = useMemo(() => {
    if (chartData && chartData.length > 0) {
      // Build min/avg/max from non-empty (up>0) buckets only.
      const minVals: number[] = [];
      const avgVals: number[] = [];
      const maxVals: number[] = [];
      for (const d of chartData) {
        if (d.up === 0) continue;
        if (isFinite(d.minPing)) minVals.push(d.minPing);
        if (d.avgPing > 0) avgVals.push(d.avgPing);
        if (d.maxPing > 0) maxVals.push(d.maxPing);
      }
      if (avgVals.length === 0) return null;
      return {
        min: Math.min(...minVals),
        avg: avgVals.reduce((a, b) => a + b, 0) / avgVals.length,
        max: Math.max(...maxVals),
      };
    }
    if (responseSeries.length === 0) return null;
    const values = responseSeries.map((p) => p.value).filter((v) => v > 0);
    if (values.length === 0) return null;
    return {
      min: Math.min(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      max: Math.max(...values),
    };
  }, [responseSeries, chartData]);

  // --- Effects + action handlers -----------------------------------------
  //
  // These run unconditionally, even when `found` is null (the callbacks
  // early-return inside). Hooks before the render guards are required
  // by the rules of hooks.

  // Sync the store data into local component state so consumers
  // (chart + uptime pill) see stable references. The chart and pill
  // recompute when the range changes.
  useEffect(() => {
    setHeartbeats(cachedHeartbeats);
    setUptime({
      uptime24h:
        cachedUptime['24'] != null ? cachedUptime['24'] * 100 : null,
      uptime7d:
        cachedUptime['168'] != null ? cachedUptime['168'] * 100 : null,
      uptime30d:
        cachedUptime['720'] != null ? cachedUptime['720'] * 100 : null,
      uptime1y:
        cachedUptime['1y'] != null ? cachedUptime['1y'] * 100 : null,
    });
    setLoading(false);
  }, [cachedHeartbeats, cachedUptime]);

  // Fetch server-aggregated chart data when the user picks a
  // non-Recent range. The 'recent' range uses the local-cached
  // heartbeat list (Path A in the protocol skill), so we skip the
  // server call for it. For 3h/6h/24h/1w we call the public
  // `getMonitorChartData` event and use the server's pre-aggregated
  // min/avg/max buckets — same path the Kuma web SPA uses for its
  // chart, so a fresh install gets real 1w data on first open.
  useEffect(() => {
    if (rangeHours === 'recent') {
      // Clear the server data so the chart falls back to local
      // heartbeats immediately.
      setChartData(null);
      setChartError(null);
      setChartLoading(false);
      return;
    }
    if (!found) return;
    let cancelled = false;
    setChartLoading(true);
    setChartError(null);
    setChartData(null);
    manager
      .getMonitorChartData(found.serverId, monitorId, rangeHours)
      .then((points) => {
        if (cancelled) return;
        setChartData(points);
        setChartLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setChartError(
          err instanceof Error ? err.message : 'Failed to load chart data'
        );
        setChartData([]);
        setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // We intentionally only re-fetch when the range changes (or the
    // monitor/server changes). The 5-min auto-refresh from Kuma's
    // PingChart.vue pattern is not yet wired — easy to add later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeHours, found?.serverId, monitorId]);

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
              label="Last check"
              value={
                monitor.lastCheckAt
                  ? formatRelativeTime(monitor.lastCheckAt)
                  : '—'
              }
            />
          </View>

          {/* Kuma-style: 4 uptime pills (7d / 24h / 30d / 1y), always shown. */}
          <View style={styles.uptimePillsRow}>
            <UptimePill
              label={t('monitors.detail.uptimeWindows.7d')}
              value={uptime.uptime7d}
            />
            <UptimePill
              label={t('monitors.detail.uptimeWindows.24h')}
              value={uptime.uptime24h}
            />
            <UptimePill
              label={t('monitors.detail.uptimeWindows.30d')}
              value={uptime.uptime30d}
            />
            <UptimePill
              label={t('monitors.detail.uptimeWindows.1y')}
              value={uptime.uptime1y}
            />
          </View>

          {/* Min · Avg · Max readout for the currently selected range. */}
          {headerPingStats && (
            <View style={styles.pingStatsRow}>
              <PingStat
                label={t('monitors.detail.responseTimeStats.min')}
                value={formatResponseTime(headerPingStats.min)}
                color={kumaPingColors(brand).min}
              />
              <PingStat
                label={t('monitors.detail.responseTimeStats.avg')}
                value={formatResponseTime(headerPingStats.avg)}
                color={kumaPingColors(brand).avg}
              />
              <PingStat
                label={t('monitors.detail.responseTimeStats.max')}
                value={formatResponseTime(headerPingStats.max)}
                color={kumaPingColors(brand).max}
              />
            </View>
          )}
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

        {/* Time range — controls the chart only (not the uptime pills). */}
        <View style={{ paddingTop: spacing[4] }}>
          <SegmentedControl
            options={[
              { value: 'recent', label: t('monitors.detail.ranges.recent') },
              { value: '3h', label: t('monitors.detail.ranges.3h') },
              { value: '6h', label: t('monitors.detail.ranges.6h') },
              { value: '24h', label: t('monitors.detail.ranges.24h') },
              { value: '1w', label: t('monitors.detail.ranges.1w') },
            ]}
            value={range}
            onChange={(v) => setRange(v as Range)}
            size="sm"
          />
        </View>

        {/* Response time chart — Kuma-style with min/avg/max lines + status bar. */}
        <View style={styles.section}>
          <SectionLabel>{t('monitors.detail.responseTime')}</SectionLabel>
          {/* Show the spinner when EITHER the initial burst is loading
              OR a server chart call is in flight. The server call only
              happens for non-Recent ranges; Recent just uses the cache. */}
          {chartLoading ||
          (loading && slicedHeartbeats.length === 0 && rangeHours === 'recent') ? (
            <View style={[styles.chartPlaceholder, { backgroundColor: surface.sunken }]}>
              <ActivityIndicator size="small" color={brand} />
            </View>
          ) : chartError ? (
            <View style={[styles.chartPlaceholder, { backgroundColor: statusTints.down.bg }]}>
              <Text style={[typography.caption, { color: colors.status.down, textAlign: 'center' }]}>
                {chartError}
              </Text>
            </View>
          ) : (
            <>
              <ResponseTimeChart
                series={aggregatedSeries}
                statusOverlay={statusOverlay}
                height={140}
                emptyMessage="No data in this range"
              />
              {/* Range-data caption: distinguishes "X server buckets"
                  (non-Recent, fetched from Kuma) from "X heartbeats"
                  (Recent, from the local cache). */}
              {chartData && chartData.length > 0 ? (
                <Text
                  style={[
                    typography.micro,
                    {
                      color: surface.textMuted,
                      paddingHorizontal: spacing[2],
                      paddingTop: spacing[1],
                    },
                  ]}>
                  {tn('monitors.detail.chartRangeServer', {
                    count: chartData.length,
                    span: formatRelativeTime(
                      new Date(chartData[0].timestamp * 1000)
                    ),
                  })}
                </Text>
              ) : slicedHeartbeats.length > 0 ? (
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
                    count: slicedHeartbeats.length,
                    span: formatRelativeTime(
                      new Date(slicedHeartbeats[0].timestamp)
                    ),
                  })}
                </Text>
              ) : null}
              {/* Mini legend for the three lines + status colors. */}
              {aggregatedSeries.length > 1 && (
                <View style={styles.chartLegend}>
                  {aggregatedSeries.map((s) => (
                    <View key={s.kind} style={styles.legendItem}>
                      <View
                        style={[
                          styles.legendSwatch,
                          { backgroundColor: s.color },
                        ]}
                      />
                      <Text
                        style={[typography.micro, { color: surface.textMuted }]}>
                        {s.label}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.legendItem}>
                    <View
                      style={[
                        styles.legendSwatch,
                        { backgroundColor: colors.status.down, opacity: 0.55 },
                      ]}
                    />
                    <Text
                      style={[typography.micro, { color: surface.textMuted }]}>
                      status
                    </Text>
                  </View>
                </View>
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

/**
 * Kuma-style uptime pill: small box with a label and a percentage.
 * `value` is 0-100; null = no data yet.
 */
function UptimePill({ label, value }: { label: string; value: number | null }) {
  const { surface } = useAppTheme();
  const color =
    value == null
      ? surface.textMuted
      : value >= 99
        ? colors.status.up
        : value >= 95
          ? colors.status.pending
          : colors.status.down;
  return (
    <View style={[styles.uptimePill, { backgroundColor: surface.sunken }]}>
      <Text style={[typography.micro, { color: surface.textMuted }]}>
        {label}
      </Text>
      <Text style={[typography.callout, { color }]}>
        {value != null ? formatUptime(value) : '—'}
      </Text>
    </View>
  );
}

/**
 * Kuma-style min/avg/max stat: small box with a label, a colored
 * value, and a colored dot to associate it with the chart line.
 */
function PingStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  const { surface } = useAppTheme();
  return (
    <View style={[styles.pingStat, { backgroundColor: surface.sunken }]}>
      <View style={styles.pingStatHeader}>
        <View style={[styles.legendSwatch, { backgroundColor: color }]} />
        <Text style={[typography.micro, { color: surface.textMuted }]}>
          {label}
        </Text>
      </View>
      <Text style={[typography.callout, { color: surface.text }]}>
        {value}
      </Text>
    </View>
  );
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
  uptimePillsRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  uptimePill: {
    flex: 1,
    borderRadius: 12,
    padding: spacing[2],
    alignItems: 'center',
    gap: 2,
  },
  pingStatsRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  pingStat: {
    flex: 1,
    borderRadius: 12,
    padding: spacing[2],
    gap: 2,
  },
  pingStatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  chartLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
    paddingHorizontal: spacing[2],
    paddingTop: spacing[1],
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  legendSwatch: {
    width: 10,
    height: 3,
    borderRadius: 1.5,
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
