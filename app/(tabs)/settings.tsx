/**
 * Settings tab - app preferences.
 * Phase 0: shows app info, theme switcher.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { colors, spacing, typography, semanticRadius } from '@/theme';
import { useSettings, type ThemeMode } from '@/data/store/settings';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar title="Settings" />

      <View style={[styles.content, { paddingBottom: insets.bottom + 80 }]}>
        {/* App info */}
        <View style={styles.section}>
          <Text style={[typography.micro, styles.sectionTitle]}>ABOUT</Text>
          <View style={styles.card}>
            <Row label="Version" value="0.1.0" />
            <Row label="Kuma target" value="2.0+" />
            <Row label="License" value="MIT" />
          </View>
        </View>

        {/* Theme */}
        <View style={styles.section}>
          <Text style={[typography.micro, styles.sectionTitle]}>APPEARANCE</Text>
          <View style={styles.card}>
            <Text style={[typography.body, { paddingHorizontal: spacing[4], paddingTop: spacing[3] }]}>
              Theme
            </Text>
            <View style={styles.themeRow}>
              {(['system', 'light', 'dark'] as ThemeMode[]).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setTheme(m)}
                  style={({ pressed }) => [
                    styles.themeChip,
                    {
                      backgroundColor:
                        theme === m ? colors.brand[500] : colors.surface.light.sunken,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <Text
                    style={[
                      typography.captionEmphasized,
                      { color: theme === m ? 'white' : colors.surface.light.text },
                    ]}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* Spacer for future sections */}
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={typography.body}>{label}</Text>
      <Text style={[typography.callout, { color: colors.gray[500] }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.light.background },
  content: { flex: 1, padding: spacing[4], gap: spacing[5] },
  section: { gap: spacing[2] },
  sectionTitle: {
    color: colors.gray[500],
    paddingHorizontal: spacing[2],
  },
  card: {
    backgroundColor: colors.surface.light.elevated,
    borderRadius: semanticRadius.card,
    borderWidth: 0.5,
    borderColor: colors.surface.light.border,
    paddingBottom: spacing[3],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  themeRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    gap: spacing[2],
  },
  themeChip: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: semanticRadius.pill,
  },
});
