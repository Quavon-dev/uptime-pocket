/**
 * Settings tab - app preferences.
 * Phase 0.2: shows app info, theme switcher, and link to design system.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Sparkles, ChevronRight } from 'lucide-react-native';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { SafeScrollView } from '@/components/ui/SafeScrollView';
import { colors, spacing, typography, semanticRadius } from '@/theme';
import { useSettings, type ThemeMode } from '@/data/store/settings';

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar title="Settings" />

      <SafeScrollView
        contentContainerStyle={{
          padding: spacing[4],
          gap: spacing[5],
        }}>
        {/* App info */}
        <Section title="About">
          <Card>
            <Row label="Version" value="0.2.0" />
            <Row label="Kuma target" value="2.0+" />
            <Row label="License" value="MIT" />
          </Card>
        </Section>

        {/* Theme */}
        <Section title="Appearance">
          <Card>
            <Text
              style={[
                typography.body,
                { paddingHorizontal: spacing[4], paddingTop: spacing[3] },
              ]}>
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
          </Card>
        </Section>

        {/* Developer */}
        <Section title="Developer">
          <Card>
            <Pressable
              onPress={() => router.push('/design-system')}
              style={({ pressed }) => [
                styles.row,
                { opacity: pressed ? 0.6 : 1 },
              ]}>
              <View style={styles.rowLeft}>
                <Sparkles size={18} color={colors.brand[500]} strokeWidth={1.75} />
                <Text style={typography.body}>Design system</Text>
              </View>
              <ChevronRight size={18} color={colors.surface.light.textMuted} strokeWidth={1.5} />
            </Pressable>
          </Card>
        </Section>
      </SafeScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing[2] }}>
      <Text
        style={[
          typography.micro,
          { color: colors.gray[500], paddingHorizontal: spacing[2] },
        ]}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface.light.elevated,
        borderRadius: semanticRadius.card,
        borderWidth: 0.5,
        borderColor: colors.surface.light.border,
        paddingBottom: spacing[3],
      }}>
      {children}
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
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
