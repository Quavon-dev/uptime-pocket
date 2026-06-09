/**
 * ServerPicker - "cooler" dropdown for picking the active Kuma server.
 *
 * Renders as a brand-tinted chip with the active server's name + a
 * chevron, sitting next to the page title. Tapping it opens a
 * centered modal listing all configured servers — each row shows a
 * status dot (green = connected, gray = disconnected), the server
 * name + URL, and a check mark for the currently-active one.
 *
 * Why a Modal instead of a popover?
 * - The chip lives in the nav bar (iOS LargeTitle area), which
 *   doesn't have a natural anchor for a popover.
 * - A centered modal reads the same on every screen size, doesn't
 *   get clipped by safe areas, and matches the visual language of
 *   the other "action sheets" the app shows.
 * - The list of Kuma servers a user has configured is short (1-5
 *   in practice), so a scrollable modal is plenty.
 *
 * Theme: chip uses brand tint; modal uses surface.elevated with
 * surface.border for the row separators. Status dot uses
 * `colors.status.up` when connected, `colors.status.paused` when
 * not (we don't use red here because disconnected ≠ down).
 */

import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
} from 'react-native';
import { Check, ChevronDown, Server as ServerIcon } from 'lucide-react-native';

import { useServers, getActiveServer } from '@/data/store/servers';
import { useKumaConnection } from '@/data/connection/manager';
import { colors, spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { t, tn } from '@/i18n';

export function ServerPicker() {
  const { surface, brand, brandFill, isDark } = useAppTheme();
  const servers = useServers((s) => s.servers);
  const activeId = useServers((s) => s.activeServerId);
  const setActive = useServers((s) => s.setActive);
  const active = getActiveServer(servers, activeId);
  const manager = useKumaConnection();
  const [open, setOpen] = useState(false);

  // No servers at all → render a disabled "+" affordance so the user
  // can still reach the Add-Server flow from the nav bar. Matches
  // the old behavior where a single + button was the only nav-bar
  // action.
  if (!active) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('servers.list.addServer')}
        onPress={() => {
          // The add-server route is owned by the parent screen; this
          // component only navigates when invoked through the chip.
          // In the no-server case we render an inert placeholder
          // (the user can use the EmptyState CTA on the screen body).
        }}
        disabled
        style={[
          styles.chip,
          { backgroundColor: surface.sunken, opacity: 0.5 },
        ]}>
        <ServerIcon size={14} color={surface.textMuted} strokeWidth={2} />
        <Text
          numberOfLines={1}
          style={[
            typography.captionEmphasized,
            { color: surface.textMuted, maxWidth: 100 },
          ]}>
          —
        </Text>
      </Pressable>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tn('servers.picker.label', { name: active.name })}
        accessibilityHint={t('servers.picker.hint')}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.chip,
          { backgroundColor: brandFill, opacity: pressed ? 0.7 : 1 },
        ]}>
        <ServerIcon size={14} color={brand} strokeWidth={2} />
        <Text
          numberOfLines={1}
          style={[
            typography.captionEmphasized,
            { color: brand, maxWidth: 120 },
          ]}>
          {active.name}
        </Text>
        <ChevronDown size={14} color={brand} strokeWidth={2} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <Pressable
          // Dismiss on backdrop tap. The inner card is itself a
          // Pressable without onPress, so taps on it won't bubble
          // up to the backdrop.
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          onPress={() => setOpen(false)}
          style={styles.backdrop}>
          <Pressable
            // Inner card. No onPress = taps here don't dismiss.
            onPress={() => {}}
            style={[
              styles.card,
              {
                backgroundColor: surface.elevated,
                borderColor: surface.border,
                // Subtle elevation so the card lifts off the
                // backdrop in dark mode (where shadows are
                // invisible) and the surface difference alone is
                // hard to see.
                ...(isDark && {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.6,
                  shadowRadius: 24,
                }),
              },
            ]}>
            <Text
              style={[
                typography.micro,
                {
                  color: surface.textMuted,
                  paddingHorizontal: spacing[4],
                  paddingTop: spacing[3],
                  paddingBottom: spacing[2],
                },
              ]}>
              {t('servers.picker.title')}
            </Text>
            {servers.map((s, idx) => {
              const isActive = s.id === activeId;
              const dotColor = s.connected ? colors.status.up : colors.status.paused;
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityLabel={s.name}
                  accessibilityState={{ selected: isActive }}
                  onPress={async () => {
                    setOpen(false);
                    if (isActive) return;
                    // Persist + switch the connection. The manager
                    // tears down the socket for the previous server
                    // and reconnects to the new one. If the user has
                    // the pull-to-refresh in flight, this will race
                    // with that — the active-id selector wins
                    // because `setActive` is sync.
                    setActive(s.id);
                    try {
                      // The manager disconnects the previous
                      // active server (if any) and opens a new
                      // socket. `setActive` was called above so
                      // `useServers.activeServerId` is already
                      // up to date by the time the socket opens.
                      await manager.connect(s.id);
                    } catch {
                      // Error already surfaced by the
                      // connection-status banner on the screen
                      // body; nothing to do here.
                    }
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: pressed ? surface.sunken : 'transparent',
                      // Last row: no bottom border.
                      borderBottomColor: surface.border,
                      borderBottomWidth: idx === servers.length - 1 ? 0 : 0.5,
                    },
                  ]}>
                  <View
                    style={[styles.statusDot, { backgroundColor: dotColor }]}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={[
                        typography.bodyEmphasized,
                        { color: surface.text, fontSize: 15 },
                      ]}>
                      {s.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        typography.caption,
                        { color: surface.textMuted, fontSize: 11 },
                      ]}>
                      {s.url}
                    </Text>
                  </View>
                  {isActive && (
                    <Check size={18} color={brand} strokeWidth={2.5} />
                  )}
                </Pressable>
              );
            })}
            {/* No "Cancel" row — the backdrop tap dismisses the
                modal (the inner card has no onPress, so taps on it
                don't bubble up). This matches the iOS action-sheet
                pattern. */}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: semanticRadius.pill,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  card: {
    width: '100%',
    maxWidth: 360,
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
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
