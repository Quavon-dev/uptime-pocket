/**
 * Monitors tab - the main screen of the app.
 *
 * Phase 2: live data from the Kuma connection manager via the
 * `useMonitors` store. We subscribe to the active server's monitor
 * list, filter chips, and route to a detail screen on tap.
 *
 * Layout:
 * - Glass nav bar: [empty] | [Monitors centered] | [+ add on right]
 *   (mirrors the Servers tab; no server picker, no large title)
 * - Connection status banner (only when not connected)
 * - Filter chips (All / Up / Down)
 * - Featured monitor card (the first one)
 * - List of monitor rows
 * - Empty state when there are no servers, no connection, or no monitors
 *
 * Theme: page bg = surface.background. Server chip + + button use
 * brand tints. Banner uses status-tinted bg/border.
 */

import { useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, RefreshControl } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Server, WifiOff, Loader, Plus, Search, X } from 'lucide-react-native';

import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { Chip, EmptyState, SafeScrollView, SegmentedControl } from '@/components/ui';
import { MonitorRow, MonitorCard } from '@/components/monitor';
import {
  OptInCard,
  useNotificationOptIn,
} from '@/features/notifications';
import {
  applyFilters,
  collectAllTags,
  toggleTag,
  type TagFilter,
} from '@/features/monitors/tagFilter';
import { useServers, getActiveServer } from '@/data/store/servers';
import { useMonitors, selectMonitorsForServer, selectAvgPing } from '@/data/store/monitors';
import { useKumaConnection } from '@/data/connection/manager';
import { colors, spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { t, tn } from '@/i18n';

type FilterMode = 'all' | 'up' | 'down';

export default function MonitorsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { surface, brand, statusTints } = useAppTheme();
  const servers = useServers((s) => s.servers);
  const activeId = useServers((s) => s.activeServerId);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [tagFilter, setTagFilter] = useState<TagFilter>({ selectedTagIds: [] });
  // Search query for the search field at the top of the list. We
  // do a case-insensitive substring match against monitor name, url,
  // and hostname. Empty string = no search.
  const [search, setSearch] = useState('');
  const { status: notifyStatus, setStatus: setNotifyStatus } = useNotificationOptIn();
  // The connection manager is the same instance the rest of the app
  // uses (root layout, background fetch). We use it here for the
  // pull-to-refresh handler: revalidateActiveServer() disconnects,
  // re-fetches the monitor list + heartbeats, and re-establishes
  // the socket. The connection-status banner updates from this same
  // call, so the user sees the spinner spin.
  const manager = useKumaConnection();
  const [refreshing, setRefreshing] = useState(false);
  // Ref-based debounce so rapid double-pulls don't race the in-flight
  // reconnect. The `refreshing` state alone is a stale closure for
  // back-to-back pulls because the state setter schedules a re-render
  // but doesn't synchronously flip the value the callback sees.
  const refreshingRef = useRef(false);
  const handleRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      // The promise resolves when revalidateActiveServer() returns.
      // That happens after the new socket is up; the monitor list
      // and heartbeats come in over the socket within a few hundred
      // ms after that. We hold the spinner for a minimum 400 ms so
      // it doesn't flash too fast to perceive on a fast network.
      await manager.revalidateActiveServer();
      await new Promise((r) => setTimeout(r, 400));
    } catch {
      // Error is already reflected in the connection-status banner;
      // nothing to do here.
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [manager]);

  // Live data from the active server.
  const active = getActiveServer(servers, activeId);
  const status = useMonitors((s) =>
    active ? s.statusByServer[active.id] ?? 'idle' : 'idle'
  );
  const error = useMonitors((s) => (active ? s.errorByServer[active.id] : null));
  const monitorsRaw = useMonitors(
    // `selectMonitorsForServer` sorts the list and returns a new
    // array on every call. `useShallow` (zustand/react/shallow)
    // deep-equal-compares the new array to the previous one, so
    // the snapshot is stable when the underlying data is unchanged.
    // Without this, the home screen would trip the same
    // "Maximum update depth exceeded" / "getSnapshot should be
    // cached" warning that the notification bridge hit. See commit
    // followup to c37741e.
    useShallow((s) =>
      active ? selectMonitorsForServer(s, active.id) : []
    )
  );

  // Filter+search the raw list. Derived from `monitorsRaw`, `filter`,
  // `tagFilter`, and `search`. Recomputed on each change.
  const filteredMonitors = useMemo(() => {
    const statusFiltered = applyFilters(monitorsRaw, filter, tagFilter);
    const q = search.trim().toLowerCase();
    if (!q) return statusFiltered;
    return statusFiltered.filter((m) => {
      // Match against any of the user-visible identifiers. We don't
      // match on the id (numeric) or the type code, since those are
      // never what the user is looking for.
      if (m.name.toLowerCase().includes(q)) return true;
      if (m.url && m.url.toLowerCase().includes(q)) return true;
      if (m.hostname && m.hostname.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [filter, monitorsRaw, tagFilter, search]);

  // 24h average ping for the featured monitor (Kuma's `avgPing` event).
  // Pulled separately so the card can show "24h avg: 124 ms" as a
  // subtitle on the Response stat. Cheap to re-subscribe (single
  // integer in the store).
  const featuredAvgPing = useMonitors((s) =>
    active && filteredMonitors[0]
      ? selectAvgPing(s, active.id, filteredMonitors[0].id)
      : null
  );

  // Available tags, derived from the active server's monitor list.
  // We re-derive on every render; the cost is O(monitors * tags) which
  // is fine even for very large Kuma instances.
  const availableTags = useMemo(
    () => collectAllTags(monitorsRaw),
    [monitorsRaw]
  );

  // No servers connected — show the onboarding empty state
  if (servers.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: surface.background }]}>
        <GlassNavBar
          title={t('tabTitle.monitors')}
          large
          subtitle={t('app.tagline')}
        />

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
        title={t('tabTitle.monitors')}
        // Standard 3-column row (no large title): [left empty] |
        // [Monitors centered] | [+ add on right]. Mirrors the
        // Servers tab's nav layout — both screens have the same
        // minimal nav shape with a single right-side action.
        //
        // The server picker used to live here; it's been removed.
        // The only place to choose the active server is now the
        // Servers tab (long-press a server to make it active).
        // The Monitors page reflects the active server's data
        // without exposing the picker — keeps the page focused.
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.add')}
            onPress={() => router.push('/monitors/add')}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <Plus size={26} color={brand} strokeWidth={2} />
          </Pressable>
        }
      />

      <SafeScrollView
        contentContainerStyle={{ paddingHorizontal: spacing[4] }}
        showsVerticalScrollIndicator={false}
        // Pull-to-refresh revalidates the active Kuma connection:
        // disconnect, reconnect, refetch monitor list + heartbeats.
        // The spinner is brand-tinted so it matches the nav bar.
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={brand}
            colors={[brand]}
            progressViewOffset={0}
            // iOS shows a small hint label under the spinner. We
            // surface a localized "Pull to refresh" so the gesture
            // is discoverable, and "Refreshing…" while in flight.
            title={refreshing ? t('refresh.refreshing') : t('refresh.title')}
            titleColor={surface.textMuted}
          />
        }>
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

        {/* Notification opt-in: shown the first time we have a real
            server connected. After Allow/Skip it's gone forever. */}
        {active && (
          <View style={{ marginTop: spacing[2] }}>
            <OptInCard status={notifyStatus} onChange={setNotifyStatus} />
          </View>
        )}

        {/* Search field. We render it as a single input that
            matches against name/url/hostname. The clear button (X)
            only shows when there's a query. */}
        <View
          style={[
            styles.searchRow,
            {
              backgroundColor: surface.sunken,
              borderColor: surface.border,
            },
          ]}>
          <Search size={16} color={surface.textMuted} strokeWidth={1.75} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('filter.search')}
            placeholderTextColor={surface.textSubtle}
            // a11y: the visible search icon already explains the
            // purpose, but screen readers need an explicit label.
            accessibilityLabel={t('filter.search')}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={[
              styles.searchInput,
              typography.body,
              { color: surface.text },
            ]}
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}>
              <X size={16} color={surface.textMuted} strokeWidth={1.75} />
            </Pressable>
          )}
        </View>

        {/* Status filter — a SegmentedControl (the same sliding
            indicator the detail screen uses for its time-range
            selector). Three options: All / Up / Down. The indicator
            is brand-tinted, like the rest of the controls. */}
        <View style={{ marginTop: spacing[3] }}>
          <SegmentedControl<FilterMode>
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('filter.all') },
              { value: 'up', label: t('filter.up') },
              { value: 'down', label: t('filter.down') },
            ]}
          />
        </View>

        {/* Per-tag chips. Renders only when at least one monitor
            has a tag. We keep the scroller so a long tag list can
            swipe horizontally without breaking the layout. Each
            chip uses the tag's own color (from Kuma) as the
            selected-color so the user can tell tags apart at a
            glance. */}
        {availableTags.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing[2], paddingVertical: spacing[2] }}>
            {availableTags.map((tag) => {
              const selected = tagFilter.selectedTagIds.includes(tag.id);
              return (
                <Chip
                  key={tag.id}
                  label={tag.name}
                  selected={selected}
                  onPress={() => setTagFilter((prev) => toggleTag(prev, tag.id))}
                  selectedColor={tag.color}
                />
              );
            })}
          </ScrollView>
        )}

        {/* Featured: the first monitor as a large card.
            `serverId` enables the UPTIME bar (subscribes to this
            monitor's heartbeat history). */}
        {filteredMonitors.length > 0 && active && (
          <View style={{ marginTop: spacing[3] }}>
            <MonitorCard
              monitor={filteredMonitors[0]}
              onPress={() => router.push(`/monitors/${filteredMonitors[0].id}`)}
              avgPing24h={featuredAvgPing}
              serverId={active.id}
            />
          </View>
        )}

        {/* The rest as dense rows. Each row subscribes to its own
            heartbeat history for the UPTIME bar (per-row
            subscription, so a single monitor's check event only
            re-renders that one row). */}
        {active && (
          <View style={{ marginTop: spacing[4], gap: spacing[2] }}>
            {filteredMonitors.slice(1).map((monitor) => (
              <MonitorRow
                key={monitor.id}
                monitor={monitor}
                onPress={() => router.push(`/monitors/${monitor.id}`)}
                serverId={active.id}
              />
            ))}
          </View>
        )}

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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: semanticRadius.button,
    borderWidth: 0.5,
    marginTop: spacing[2],
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0, // strip RN's default vertical padding
  },
  noResults: { paddingVertical: spacing[10] },
});
