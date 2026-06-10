/**
 * ServerPicker - "native" bottom-sheet style dropdown for the active
 * Kuma server.
 *
 * Renders as a brand-tinted chip in the top-right of the nav bar
 * (server icon + name + chevron). Tapping it opens a native iOS
 * half-sheet listing all configured servers.
 *
 * Why a native half-sheet?
 * - It's how iOS itself presents this kind of "pick from a short
 *   list" UX (Apple Music share sheet, Maps place picker, Notes
 *   folder picker). The system handles the rounded top corners,
 *   drag handle, swipe-down-to-dismiss, and the slide-up entrance
 *   animation.
 * - The list of configured Kuma servers is short (1-5 in practice),
 *   so a half-sheet sized to its content is plenty — no scrolling,
 *   no pagination.
 * - Truly native on iOS via `Modal.presentationStyle="pageSheet"`,
 *   which maps to `UIModalPresentationStyle.pageSheet` and is wrapped
 *   in a `UISheetPresentationController` on iOS 15+. We get the
 *   system chrome for free (drag indicator, dimmed backdrop,
 *   keyboard avoidance, dynamic detent sizing).
 * - Android falls back to a fullscreen modal (Material 3). It's not
 *   as nice as the iOS sheet, but it's a native system surface and
 *   it works.
 *
 * What this component does NOT do:
 * - Render its own backdrop, drag handle, swipe-to-dismiss gesture,
 *   or slide animation. The system handles all of that.
 * - Wrap the modal contents in `Pressable` for "tap backdrop to
 *   dismiss" — the system already does that, and adding our own
 *   `onPress` on a wrapping element can interfere with the iOS
 *   sheet's gesture recognizer.
 *
 * Theme: chip uses brand tint; sheet content uses surface.elevated
 * with surface.border for the row separators. Status dot uses
 * `colors.status.up` when connected, `colors.status.paused` when
 * not (we don't use red here because disconnected ≠ down).
 */

import { useState } from 'react';
import { View, Text, Pressable, Modal, Platform, StyleSheet } from 'react-native';
import { Check, ChevronDown, Server as ServerIcon } from 'lucide-react-native';

import { useServers, getActiveServer } from '@/data/store/servers';
import { useKumaConnection } from '@/data/connection/manager';
import { colors, spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { t, tn } from '@/i18n';

export function ServerPicker() {
  const { surface, brand, brandFill } = useAppTheme();
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

  // The system-provided pageSheet on iOS gives us:
  // - Rounded top corners (system-rendered, match other iOS sheets)
  // - A drag indicator at the top (system-rendered)
  // - Swipe-down to dismiss (gesture recognizer built in)
  // - Automatic detent sizing (the sheet grows to fit its content;
  //   the user can also drag it up/down between the .medium and
  //   .large detents if the content is long enough)
  // - Dimmed backdrop (the system dims the underlying content)
  //
  // We pass `animationType="slide"` so iOS uses the system slide-up
  // animation. On Android, fullScreen modals animate from the
  // bottom by default — we don't need to do anything special.
  //
  // `onRequestClose` is the iOS contract for the "modal needs to
  // close" gesture (swipe-down on a sheet, hardware back on
  // Android). It MUST be set; iOS will warn at runtime if it isn't.
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
        // `pageSheet` → UISheetPresentationController on iOS 15+.
        // This is the iOS-native half-sheet (rounded top corners,
        // drag handle, swipe-to-dismiss, automatic detents).
        // On Android, pageSheet isn't supported, so we fall back
        // to fullScreen — a Material 3 modal that slides up from
        // the bottom.
        {...(Platform.OS === 'ios'
          ? { presentationStyle: 'pageSheet' as const }
          : { presentationStyle: 'fullScreen' as const })}
        animationType="slide"
        // Required by RN. Fires when the user does the
        // system-level dismiss gesture (swipe-down on iOS,
        // back button on Android). We mirror that to our local
        // `open` state.
        onRequestClose={() => setOpen(false)}
        // iOS 26+: let the system draw a Material-style
        // translucent status bar over the sheet's rounded top
        // corners. Has no effect on Android.
        statusBarTranslucent={Platform.OS === 'ios'}>
        {/* The sheet body. The system provides the rounded top
            corners, drag handle, and backdrop, so we just need
            to render the content. No `Pressable` wrapper for
            "tap backdrop to dismiss" — the system handles that
            natively. No `paddingTop` for a drag handle — the
            system draws one for us. */}
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: surface.elevated,
              // Top corners match the system sheet's radius
              // (pageSheet uses ~10pt on iOS). We only round
              // the top because the sheet is bottom-anchored
              // and the bottom edge sits flush with the screen
              // edge when fully expanded.
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
            },
          ]}>
          {/* The sheet's title bar. This is the closest thing
              to a "header" that the user sees at the top of the
              sheet — we render the picker title in the same
              micro typography we used in the modal version, so
              a returning user sees the same vocabulary. */}
          <Text
            style={[
              typography.micro,
              {
                color: surface.textMuted,
                paddingHorizontal: spacing[4],
                paddingTop: spacing[5],
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
                  // Close the sheet first so the user sees the
                  // selection feedback (status pill updates
                  // on the screen below) immediately, then kick
                  // off the connection swap. The sheet's exit
                  // animation runs in parallel with the
                  // connection handshake so the user perceives
                  // a single fluid transition.
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
          {/* Bottom safe-area + breathing room. On iOS the
              sheet respects the home-indicator area automatically
              for some content, but the rows don't have a hard
              bottom edge — we add a bit of padding so the last
              row's press highlight doesn't sit flush against the
              screen edge. */}
          <View style={{ height: spacing[6] + (Platform.OS === 'ios' ? 12 : 24) }} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // The chip in the nav bar: padding + border-radius + background.
  // Children live inside `chipRow` so the press feedback and the
  // row layout are decoupled (RN's Pressable can otherwise confuse
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
  // The sheet body. We give it `flex: 1` so it fills the entire
  // sheet (the system draws the rounded top corners and drag
  // indicator BEHIND/ON TOP of our content). The system handles
  // the bottom safe-area inset for the home indicator.
  sheet: {
    flex: 1,
  },
  // A single server row in the sheet. `flexDirection: 'row'`
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
