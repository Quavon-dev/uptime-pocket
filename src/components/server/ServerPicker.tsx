/**
 * ServerPicker - "cooler" dropdown for picking the active Kuma server.
 *
 * Renders as a brand-tinted chip with the active server's name + a
 * chevron, sitting in the top-right of the nav bar. Tapping it opens
 * a centered modal listing all configured servers — each row shows a
 * status dot (green = connected, gray = disconnected), the server
 * name + URL, and a check mark for the currently-active one.
 *
 * Why a Modal instead of a popover?
 * - The chip lives in the nav bar, which doesn't have a natural
 *   anchor for a popover.
 * - A centered modal reads the same on every screen size, doesn't
 *   get clipped by safe areas, and matches the visual language of
 *   the other "action sheets" the app shows.
 * - The list of Kuma servers a user has configured is short (1-5
 *   in practice), so a scrollable modal is plenty.
 *
 * Modal structure (bulletproof against RN touch-system quirks):
 * - Backdrop: a `TouchableWithoutFeedback` that covers the full
 *   screen and dismisses on tap. We use TWF instead of Pressable
 *   because Pressable on a Modal's root sometimes interferes with
 *   child touches in unpredictable ways on iOS — TWF is the
 *   canonical "tap-anywhere-to-dismiss" wrapper in the RN docs.
 * - Card: a plain `View` with explicit width/maxWidth and no
 *   `onPress`, so taps on it don't bubble up to the backdrop and
 *   dismiss the modal by accident.
 * - Rows: a `Pressable` (which supports the `({ pressed }) => style`
 *   callback form). Each row uses a flex row with explicit `flex: 1,
 *   flexShrink: 1` on the text column so a long server name or URL
 *   truncates with an ellipsis rather than pushing the check mark
 *   off the card.
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
  TouchableWithoutFeedback,
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

  // No servers at all → render a disabled placeholder chip. The
  // user can still reach Add-Server from the EmptyState CTA on the
  // screen body.
  if (!active) {
    return (
      <View
        style={[
          styles.chip,
          { backgroundColor: surface.sunken, opacity: 0.5 },
        ]}>
        <View style={styles.chipRow}>
          <ServerIcon size={14} color={surface.textMuted} strokeWidth={2} />
          <Text
            numberOfLines={1}
            style={[styles.chipText, { color: surface.textMuted }]}>
            —
          </Text>
        </View>
      </View>
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
        {/* Inner row — explicit `View` with `flexDirection: 'row'` so
            the chip's three children (icon, name, chevron) are laid
            out horizontally regardless of what the underlying
            Pressable does to its children's default style. */}
        <View style={styles.chipRow}>
          <ServerIcon size={14} color={brand} strokeWidth={2} />
          <Text
            numberOfLines={1}
            style={[styles.chipText, { color: brand }]}>
            {active.name}
          </Text>
          <ChevronDown size={14} color={brand} strokeWidth={2} />
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        // The Modal's onRequestClose fires on iOS when the user does
        // the "swipe down to dismiss" gesture on a sheet, and on
        // Android for the hardware back button. We dismiss from here
        // too for consistency.
        onRequestClose={() => setOpen(false)}
        // Status bar: the iOS default is "light" content over the
        // modal (because the modal background is dark), but since
        // we have a translucent backdrop with the page content
        // visible behind, we leave the status bar as-is. RN's
        // Modal handles this automatically on iOS 26+.
        statusBarTranslucent>
        {/* Backdrop: tap to dismiss. We use TouchableWithoutFeedback
            because the modal content (a card) sits inside this same
            wrapper, and Pressable's onPress would consume taps on
            the card area. TWF is the documented pattern for "tap
            anywhere outside the card to dismiss". The `accessible`
            prop is false so screen readers don't try to announce
            the empty backdrop as a tappable region (the inner card
            is what should be focused). */}
        <TouchableWithoutFeedback
          accessible={false}
          onPress={() => setOpen(false)}>
          <View style={styles.backdrop}>
            {/* The card. A plain View (not Pressable, not
                TouchableOpacity) so it doesn't intercept any taps
                that fall inside it; the user's only options are
                "tap a server row" (handled by the row's own
                TouchableOpacity) or "tap outside the card" (handled
                by the TWF backdrop). */}
            <View
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
                    paddingTop: spacing[4],
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
                      // and reconnects to the new one. `setActive` is
                      // sync, so the active-id selector in the rest
                      // of the UI updates before the socket opens.
                      setActive(s.id);
                      try {
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
                    {/* `flex: 1, flexShrink: 1, minWidth: 0` is the
                        critical combo for the text column: without
                        `minWidth: 0`, RN's default `minWidth: 'auto'`
                        keeps the flex child at its content's natural
                        width, so a long URL pushes the check mark
                        off the right edge. */}
                    <View style={styles.rowText}>
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
                          { color: surface.textMuted, fontSize: 12, marginTop: 2 },
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
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Outer chip: padding + border-radius + background. Children
  // live inside `chipRow` so the press feedback and the row
  // layout are decoupled (RN's Pressable can otherwise confuse
  // the row direction in some configurations).
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: semanticRadius.pill,
  },
  // The horizontal row of icon + name + chevron inside the chip.
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // The name text inside the chip. `flexShrink: 1` so a long name
  // truncates with an ellipsis rather than pushing the chevron
  // off-screen.
  chipText: {
    ...typography.captionEmphasized,
    maxWidth: 120,
    flexShrink: 1,
  },
  // Backdrop: full-screen translucent black, with the card
  // centered via flexbox. `paddingHorizontal: spacing[6]` gives
  // the card a comfortable margin from the screen edges.
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  // The card. `width: '100%'` makes it fill the available
  // horizontal space within the backdrop's padding, capped at
  // 360pt for a comfortable reading width on iPad. `overflow:
  // 'hidden'` is what gives the rows their rounded-corner bottom
  // edge (otherwise the bottom corners would be sharp and the
  // top corners would have the card's radius).
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: semanticRadius.card,
    borderWidth: 0.5,
    overflow: 'hidden',
  },
  // A single server row in the picker modal. `flexDirection: 'row'`
  // puts status dot | text column | check mark in a horizontal
  // line, with a 12pt gap between each.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  // The text column inside a server row. `flex: 1, flexShrink: 1,
  // minWidth: 0` lets the texts shrink to a single ellipsized
  // line rather than pushing the check mark out of the card;
  // without `minWidth: 0` flex children default to
  // `minWidth: auto` and refuse to shrink below their content's
  // natural size.
  rowText: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  // The 10x10 status dot at the start of each row.
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
