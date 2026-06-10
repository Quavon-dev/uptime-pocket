/**
 * ServerPicker - "native" sheet-style dropdown for the active Kuma
 * server.
 *
 * Renders as a brand-tinted chip in the top-right of the nav bar
 * (server icon + name + chevron). Tapping it opens a native iOS
 * form sheet listing all configured servers.
 *
 * Why `formSheet` and not `pageSheet`?
 * - `formSheet` maps to `UIModalPresentationFormSheet` on iOS, which
 *   is a small centered card sized to its content. It has rounded
 *   corners, a dimmed backdrop, and is dismissed by tap-outside or
 *   the standard iOS gestures. It's the right primitive for "pick
 *   from a short list" (Apple's own Mail, Contacts, Reminders use
 *   it for the same UX).
 * - `pageSheet` (which we used previously) maps to
 *   `UIModalPresentationPageSheet`, which on iOS 15+ is wrapped in
 *   a `UISheetPresentationController`. By default pageSheet expands
 *   to the full-screen `.large` detent, which is way too big for
 *   a 1-5 item picker. Constraining it via detents requires
 *   react-native-screens' `Screen` component, not core RN's
 *   `Modal` — an extra dependency for a behavior we don't want
 *   anyway (a bottom-anchored sheet isn't right for a centered
 *   picker in a nav-bar dropdown).
 *
 * Why no custom backdrop, drag handle, or animation?
 * - The system provides all of it. Adding our own `Pressable`
 *   backdrop or `TouchableWithoutFeedback` dismiss would just
 *   interfere with the iOS sheet's gesture recognizer.
 *
 * Theme: chip uses brand tint; sheet body uses surface.elevated
 * with surface.border for the row separators. Status dot uses
 * `colors.status.up` when connected, `colors.status.paused` when
 * not (we don't use red here because disconnected ≠ down).
 *
 * On Android, `formSheet` falls back to a Material fullscreen
 * modal. Not as polished as the iOS sheet, but native.
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
        // `formSheet` → `UIModalPresentationFormSheet` on iOS, a
        // small centered card sized to its content with rounded
        // corners and a dimmed backdrop. This is the right
        // primitive for a "pick from a short list" picker —
        // Apple's own Mail, Contacts, and Reminders apps use
        // formSheet for this same UX.
        //
        // We do NOT use `pageSheet` here. `pageSheet` defaults to
        // the full-screen `.large` detent on iOS 15+ and is way
        // too big for a 1-5 item picker. (Constraining it requires
        // react-native-screens' `Screen` component with explicit
        // `sheetAllowedDetents` props; that's overkill here.)
        //
        // On Android, formSheet isn't supported, so we fall back
        // to fullScreen — a Material 3 modal that slides up from
        // the bottom.
        //
        // `transparent={false}` because formSheet needs the
        // `backgroundColor` on the content view to fill the card
        // — the sheet isn't transparent on iOS.
        {...(Platform.OS === 'ios'
          ? {
              presentationStyle: 'formSheet' as const,
              transparent: false as const,
            }
          : { presentationStyle: 'fullScreen' as const })}
        animationType="slide"
        // Required by RN. Fires when the user does the
        // system-level dismiss gesture (swipe-down on the form
        // sheet on iOS, back button on Android). We mirror that
        // to our local `open` state.
        onRequestClose={() => setOpen(false)}
        // On iOS the form sheet sizes itself to fit the content
        // view's intrinsic content size. We don't enable
        // `statusBarTranslucent` because the form sheet is
        // centered vertically and doesn't reach the top of the
        // screen — the status bar is unaffected.
      >
        {/* The sheet body. CRITICAL: we do NOT use `flex: 1`
            here. `formSheet` on iOS sizes the sheet to its
            content's intrinsic content size; if we set `flex: 1`
            the sheet asks for "all available height" and the
            system can't determine a height (it's circular),
            which causes child rows to render with 0px height for
            their text columns. Letting the sheet be
            intrinsic-sized fixes the "name and URL are invisible
            inside the row" bug. */}
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: surface.elevated,
              // All four corners rounded to match the system
              // formSheet's radius (~10pt on iOS). formSheet
              // centers the card with system-managed padding
              // around it, so we don't add a custom borderTop
              // radius — we round all four corners uniformly.
              borderRadius: 10,
            },
          ]}>
          {/* The sheet's header. Renders the picker title in
              the same micro typography we used in the previous
              modal, so a returning user sees the same
              vocabulary. */}
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
                {/* The text column. `flex: 1` claims the remaining
                    space between the dot and the check. The
                    Texts inside have `width: '100%'` so they
                    fill the column and the `numberOfLines={1}`
                    truncates with an ellipsis if the name or
                    URL is too long. We do NOT use `minWidth: 0`
                    here — inside a `formSheet` Modal the row
                    already has plenty of horizontal space, and
                    `minWidth: 0` on the text column was
                    incorrectly causing the Texts to render at
                    0px width. */}
                <View style={styles.rowText}>
                  <Text
                    numberOfLines={1}
                    style={[
                      typography.bodyEmphasized,
                      { color: surface.text, fontSize: 15, width: '100%' },
                    ]}>
                    {s.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      typography.caption,
                      {
                        color: surface.textMuted,
                        fontSize: 12,
                        marginTop: 2,
                        width: '100%',
                      },
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
          {/* The system formSheet adds its own bottom padding for
              the home indicator safe area, so we don't need a
              custom spacer here. */}
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
  // The sheet body. We intentionally do NOT set `flex: 1` here
  // because `formSheet` on iOS sizes the sheet to the content
  // view's intrinsic content size; `flex: 1` creates a circular
  // "how tall am I?" question and RN resolves it by collapsing
  // child rows to 0px height for their text columns. Letting
  // the sheet be intrinsic-sized fixes that.
  sheet: {
    // Min width: gives the formSheet a sensible starting size on
    // iOS. The system may make it wider to accommodate large
    // content; this is just a floor.
    minWidth: 280,
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
  // The text column inside a server row. `flex: 1` claims the
  // remaining horizontal space between the status dot and the
  // check mark. The Texts inside this column set `width: '100%'`
  // to fill the column and use `numberOfLines={1}` to truncate
  // with an ellipsis if the name or URL is too long.
  //
  // We intentionally do NOT use `flexShrink: 1, minWidth: 0` —
  // those caused the Texts to render at 0px width inside a
  // `formSheet` Modal (the system-managed content view has its
  // own intrinsic sizing that conflicts with the override).
  rowText: {
    flex: 1,
  },
  // The 10x10 status dot at the start of each row.
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
