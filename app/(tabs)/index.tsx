/**
 * Monitors tab - the main screen of the app.
 *
 * Phase 2: live data from the Kuma connection manager via the
 * `useMonitors` store. We subscribe to the active server's monitor
 * list, filter chips, and route to a detail screen on tap.
 *
 * Layout:
 * - Glass nav bar with large title
 *   - Top row: [+ add] on the right (in the small nav bar)
 *   - Big row: "Monitors" left-aligned with [+ add] in the inline
 *     slot (next to the headline, same level). The user asked for
 *     this layout — the `+` sits on the same line as the big title
 *     so the nav reads as a single visual band.
 * - Connection status banner (only when not connected)
 * - Filter chips (All / Up / Down)
 * - Optional featured monitor card — ONLY when the user has
 *   long-pressed a monitor to pin it to the top. Default state
 *   has no featured card.
 * - List of monitor rows
 * - Empty state when there are no servers, no connection, or no monitors
 *
 * Pinning:
 * - The user long-presses any monitor (in the featured card OR
 *   in the list) to pin / unpin it for the active server.
 * - The pin is per-server (a JSON map keyed by serverId, persisted
 *   in the `settings` table as `pinned_monitor_by_server`).
 * - When a monitor is pinned, it moves to the featured slot; the
 *   previously-featured monitor (if any) goes back into the list
 *   in its alphabetical position. When the user unpins the
 *   featured one, it returns to the list and the featured slot
 *   disappears.
 *
 * Theme: page bg = surface.background. + button uses brand tint.
 * Banner uses status-tinted bg/border.
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
import { useSettings } from '@/data/store/settings';
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
  //
  // The featured monitor is the PINNED one for the active server
  // (if any), NOT just the first one in the alphabetical list. The
  // pin is stored as `serverId → monitorId` in the settings store;
  // we read it with a selector that depends on the active server
  // so re-renders only fire when the active server's pin changes.
  const pinnedId = useSettings((s) =>
    active ? s.pinnedMonitorByServer?.[active.id] ?? null : null
  );
  const setPinnedMonitor = useSettings((s) => s.setPinnedMonitor);

  // The featured monitor is the pinned one, if it still exists in
  // the filtered list. We validate `pinnedId` against
  // `filteredMonitors` on every render — if the pinned monitor was
  // deleted (Kuma side) we silently drop the pin so the user doesn't
  // see a phantom card. The `featured` is the pinned monitor when
  // it exists; otherwise `null` (and the featured slot is hidden).
  const featured = useMemo(() => {
    if (pinnedId == null) return null;
    return filteredMonitors.find((m) => m.id === pinnedId) ?? null;
  }, [pinnedId, filteredMonitors]);

  // The list is the filtered list MINUS the featured monitor.
  // When no monitor is pinned, the list is just the filtered list
  // (no featured slot). When a monitor IS pinned, it sits in the
  // featured card and the list is everyone else.
  const listMonitors = useMemo(() => {
    if (!featured) return filteredMonitors;
    return filteredMonitors.filter((m) => m.id !== featured.id);
  }, [featured, filteredMonitors]);

  const featuredAvgPing = useMonitors((s) =>
    active && featured ? selectAvgPing(s, active.id, featured.id) : null
  );

  // Pin / unpin a monitor. The gesture is the same on the featured
  // card and on the list rows: long-press to toggle. If the user
  // long-presses the currently-featured monitor, we unpin (back to
  // no featured slot). If they long-press a list monitor, we pin
  // it (it moves to the top, displacing the previously-featured
  // monitor back into the list).
  const handlePinToggle = useCallback(
    (monitorId: number) => {
      if (!active) return;
      // The a11y hint "Long-press to unpin" / "Long-press to pin to
      // top" surfaces in the long-press affordance, so the user
      // can hear the action before they trigger it. We don't show
      // a toast on the screen because the reorder is the primary
      // visual feedback.
      if (pinnedId === monitorId) {
        // Currently pinned → unpin
        setPinnedMonitor(active.id, null);
      } else {
        // Either nothing pinned, or a different monitor is pinned.
        // Either way, the new monitor becomes the featured one.
        setPinnedMonitor(active.id, monitorId);
      }
    },
    [active, pinnedId, setPinnedMonitor]
  );

  // The a11y hint text for the long-press action depends on whether
  // the monitor is currently pinned. We use two strings so the
  // screen reader announces the correct next action.
  const pinHint = t('monitors.pin.hint');
  const unpinHint = t('monitors.pin.actionUnpin');
  const longPressHintFor = useCallback(
    (monitorId: number) => (pinnedId === monitorId ? unpinHint : pinHint),
    [pinnedId, pinHint, unpinHint]
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
        // iOS large-title pattern, but with the `+` in the
        // `inline` slot (next to the big "Monitors" headline on
        // the same horizontal line). The user asked for this —
        // the headline + the add button read as a single visual
        // band at the top of the screen.
        //
        // The `inline` slot lives in the second row of the nav
        // bar (the row that holds the big title) — see
        // GlassNavBar's `inline` prop. We render a bare Plus
        // icon there, brand-tinted, matching the visual weight
        // of the headline. The top nav row is empty on both
        // sides (no small title needed when the big title is
        // already on screen).
        large
        inline={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.add')}
            onPress={() => router.push('/monitors/add')}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <Plus size={28} color={brand} strokeWidth={2} />
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

        {/* Featured: the PINNED monitor, rendered as a large
            card. This block is only present when the user has
            actually long-pressed a monitor to pin it — the
            default state is "no featured card, just the list".
            `serverId` enables the UPTIME bar (subscribes to this
            monitor's heartbeat history).
            Long-pressing the featured card unpins (back to the
            default no-featured state). */}
        {featured && active && (
          <View style={{ marginTop: spacing[3] }}>
            <MonitorCard
              monitor={featured}
              onPress={() => router.push(`/monitors/${featured.id}`)}
              onLongPress={() => handlePinToggle(featured.id)}
              longPressHint={longPressHintFor(featured.id)}
              avgPing24h={featuredAvgPing}
              serverId={active.id}
            />
          </View>
        )}

        {/* The list: every monitor in the filtered list that ISN'T
            the featured one. When no monitor is pinned, this is
            the entire filtered list. Each row subscribes to its
            own heartbeat history for the UPTIME bar (per-row
            subscription, so a single monitor's check event only
            re-renders that one row). Long-pressing a row pins
            it to the top. */}
        {active && (
          <View style={{ marginTop: spacing[4], gap: spacing[2] }}>
            {listMonitors.map((monitor) => (
              <MonitorRow
                key={monitor.id}
                monitor={monitor}
                onPress={() => router.push(`/monitors/${monitor.id}`)}
                onLongPress={() => handlePinToggle(monitor.id)}
                longPressHint={longPressHintFor(monitor.id)}
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
