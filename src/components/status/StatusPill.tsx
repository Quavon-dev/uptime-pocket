/**
 * Status pill - colored dot + label.
 *
 * Used everywhere to indicate monitor health. This is the most
 * repeated component in the app, so it's worth getting right.
 *
 * - The dot's color is the SEMANTIC status color (never decorative)
 *   for down / pending / maintenance / paused. For "up", the dot
 *   follows the user's accent color when the "Accent affects
 *   status" toggle is on in Settings (default off — `up` stays
 *   on the static emerald).
 * - The label is optional and configurable
 * - The pill itself is rounded-full with a subtle background
 */

import { View, Text } from 'react-native';
import { statusColor, statusLabel } from '@/domain/status';
import { colors, typography, semanticRadius, useAppTheme } from '@/theme';
import { useSettings } from '@/data/store/settings';
import type { MonitorStatus } from '@/domain/models';

interface StatusPillProps {
  status: MonitorStatus;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
}

export function StatusPill({ status, size = 'md', showLabel = true }: StatusPillProps) {
  // The pill's "up" color follows the user's accent only when the
  // "Accent affects status" toggle is on. When the toggle is off
  // (the default), the dot stays on the static emerald from
  // `colors.status.up` — the "up" status is semantically "healthy"
  // and shouldn't change shape based on a user preference. The
  // other four statuses (down/pending/maintenance/paused) always
  // use the static palette regardless of the toggle: "down" must
  // stay red, "pending" must stay amber, etc.
  //
  // We read `accentAffectsStatus` directly from the settings store
  // (in addition to reading `status` from the theme) so the
  // gating is local to this component. The theme's
  // `statusPalette.up` already encodes the toggle, but having the
  // store read here too makes the intent explicit and means a
  // future change to the theme can't accidentally hide the
  // pill from the toggle's effect.
  const { status: statusPalette } = useAppTheme();
  const accentAffectsStatus = useSettings((s) => s.accentAffectsStatus);
  const color =
    status === 'up'
      ? accentAffectsStatus
        ? statusPalette.up
        : colors.status.up
      : statusColor(status);
  // Slightly larger and more padding for the "hero" size so the pill
  // reads as the dominant visual on a MonitorCard. xl: 12px dot,
  // 15px text, comfortable padding.
  const dotSize = size === 'sm' ? 6 : size === 'lg' ? 10 : size === 'xl' ? 12 : 8;
  const fontSize = size === 'sm' ? 11 : size === 'lg' ? 14 : size === 'xl' ? 15 : 12;
  const padX = size === 'sm' ? 8 : size === 'md' ? 10 : 12;
  const padY = size === 'sm' ? 3 : size === 'md' ? 5 : 7;
  const gap = size === 'xl' ? 8 : 6;

  return (
    <View
      // a11y: the pill is a passive display element. We expose the
      // status as the label so the screen reader reads "Up" / "Down"
      // / etc. The dot alone is decorative (it has no text).
      accessible={!showLabel}
      accessibilityLabel={!showLabel ? statusLabel(status) : undefined}
      accessibilityRole="text"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: padX,
        paddingVertical: padY,
        borderRadius: semanticRadius.pill,
        backgroundColor: `${color}1A`, // 10% opacity tint
        gap,
      }}>
      <View
        // a11y: the dot is purely decorative; the text label carries
        // the meaning. Hide it from the a11y tree.
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: color,
        }}
      />
      {showLabel && (
        <Text
          style={{
            ...typography.captionEmphasized,
            fontSize,
            color,
            lineHeight: fontSize + 2,
          }}>
          {statusLabel(status)}
        </Text>
      )}
    </View>
  );
}
