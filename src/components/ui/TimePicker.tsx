/**
 * TimePicker — two-step hour/minute scroller for picking a wall-clock
 * time of day (0:00 .. 23:59). We roll our own instead of pulling in
 * `@react-native-community/datetimepicker` because the modal API there
 * is platform-specific and doesn't play well with our dark surfaces
 * out of the box.
 *
 * The UI is two horizontal FlatLists of hours and minutes. The active
 * value is centered vertically. Tapping a value (or letting the list
 * snap) fires `onChange(newMinuteOfDay)`.
 *
 * Why not a wheel picker? A wheel feels more native, but the wheel
 * library we'd want (e.g. @react-native-community/picker) is a UIKit
 * spinner on iOS and a Material dropdown on Android - neither matches
 * our flat design. Two columns of tappable rows is enough.
 */

import { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, ListRenderItem } from 'react-native';
import { spacing, typography, useAppTheme } from '@/theme';
import { t } from '@/i18n';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

interface TimePickerProps {
  /** Minute-of-day (0..1439). */
  value: number;
  onChange: (minuteOfDay: number) => void;
  /** Minute increments (default 5). 1, 5, 15, 30 are common. */
  minuteStep?: number;
  /** Label shown above the picker. */
  label?: string;
}

function minuteToHM(min: number): { h: number; m: number } {
  return { h: Math.floor(min / 60), m: min % 60 };
}

function hmToMinute(h: number, m: number): number {
  return h * 60 + m;
}

export function TimePicker({ value, onChange, minuteStep = 5, label }: TimePickerProps) {
  const { surface, brand, isDark } = useAppTheme();
  const { h, m } = minuteToHM(value);
  const minutes = MINUTES.filter((x) => x % minuteStep === 0);

  const pickHour = useCallback(
    (newH: number) => onChange(hmToMinute(newH, m)),
    [m, onChange],
  );
  const pickMinute = useCallback(
    (newM: number) => onChange(hmToMinute(h, newM)),
    [h, onChange],
  );

  const renderHour: ListRenderItem<number> = ({ item }) => {
    const active = item === h;
    return (
      <Pressable
        onPress={() => pickHour(item)}
        style={({ pressed }) => [
          styles.cell,
          {
            backgroundColor: active ? brand : pressed ? surface.sunken : 'transparent',
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Hour ${item}`}
        accessibilityState={{ selected: active }}>
        <Text
          style={[
            typography.bodyEmphasized,
            { color: active ? 'white' : surface.text, fontVariant: ['tabular-nums'] },
          ]}>
          {String(item).padStart(2, '0')}
        </Text>
      </Pressable>
    );
  };

  const renderMinute: ListRenderItem<number> = ({ item }) => {
    const active = item === m;
    return (
      <Pressable
        onPress={() => pickMinute(item)}
        style={({ pressed }) => [
          styles.cell,
          {
            backgroundColor: active ? brand : pressed ? surface.sunken : 'transparent',
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Minute ${item}`}
        accessibilityState={{ selected: active }}>
        <Text
          style={[
            typography.bodyEmphasized,
            { color: active ? 'white' : surface.text, fontVariant: ['tabular-nums'] },
          ]}>
          {String(item).padStart(2, '0')}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap}>
      {label && (
        <Text
          style={[
            typography.captionEmphasized,
            { color: surface.textMuted, marginBottom: spacing[1] },
          ]}>
          {label}
        </Text>
      )}
      <View
        style={[
          styles.row,
          {
            backgroundColor: isDark ? surface.sunken : '#FFFFFF',
            borderColor: surface.border,
          },
        ]}>
        <FlatList
          data={HOURS}
          renderItem={renderHour}
          keyExtractor={(x) => `h-${x}`}
          numColumns={6}
          scrollEnabled={false}
          contentContainerStyle={styles.grid}
          style={styles.col}
        />
        <View style={[styles.colon, { backgroundColor: surface.border }]} />
        <FlatList
          data={minutes}
          renderItem={renderMinute}
          keyExtractor={(x) => `m-${x}`}
          numColumns={4}
          scrollEnabled={false}
          contentContainerStyle={styles.grid}
          style={styles.col}
        />
      </View>
    </View>
  );
}

/** Display helper: "22:00" given a minute-of-day. Zero-padded. */
export function formatMinute(min: number): string {
  const { h, m } = minuteToHM(min);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Returns a friendly hint about what the range covers, or null if it's
 *  a normal same-day range (no hint needed). */
export function quietHoursHint(startMin: number, endMin: number): string | null {
  if (startMin === endMin) return t('settings.quietHours.allDayHint');
  if (startMin > endMin) return t('settings.quietHours.overnightHint');
  return null;
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 0.5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  col: {
    flex: 1,
  },
  grid: {
    padding: 4,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    margin: 2,
  },
  colon: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 6,
  },
});
