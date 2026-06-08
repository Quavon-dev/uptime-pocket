/**
 * Settings tab - app preferences.
 * Phase 0.2: shows app info, theme switcher, and link to design system.
 *
 * Theme: page bg = surface.background. The Theme picker is a
 * SegmentedControl bound to the settings store. We read the current
 * theme via useAppTheme() so the UI updates instantly when the user
 * picks a new value.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Sparkles, ChevronRight } from 'lucide-react-native';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { SafeScrollView, SegmentedControl } from '@/components/ui';
import { spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { useSettings, type ThemeMode } from '@/data/store/settings';
import { t } from '@/i18n';

export default function SettingsScreen() {
  const router = useRouter();
  const { surface, brand, brandFill } = useAppTheme();
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);

  return (
    <View style={[styles.container, { backgroundColor: surface.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar title={t('settings.title')} />

      <SafeScrollView
        contentContainerStyle={{
          padding: spacing[4],
          gap: spacing[5],
        }}>
        {/* App info */}
        <Section title={t('settings.about')}>
          <Card>
            <Row label="Version" value="0.2.0" />
            <Row label="Kuma target" value="2.0+" />
            <Row label="License" value="MIT" />
          </Card>
        </Section>

        {/* Theme */}
        <Section title={t('settings.appearance')}>
          <Card>
            <Text
              style={[
                typography.callout,
                {
                  color: surface.textMuted,
                  paddingHorizontal: spacing[4],
                  paddingTop: spacing[3],
                  paddingBottom: spacing[2],
                },
              ]}>
              {t('settings.theme.title')}
            </Text>
            <View style={{ paddingHorizontal: spacing[4], paddingBottom: spacing[3] }}>
              <SegmentedControl<ThemeMode>
                options={[
                  { value: 'system', label: t('settings.theme.system') },
                  { value: 'light', label: t('settings.theme.light') },
                  { value: 'dark', label: t('settings.theme.dark') },
                ]}
                value={theme}
                onChange={setTheme}
              />
            </View>
            <Text
              style={[
                typography.caption,
                {
                  color: surface.textSubtle,
                  paddingHorizontal: spacing[4],
                  paddingBottom: spacing[3],
                },
              ]}>
              {theme === 'system'
                ? t('settings.theme.descriptionSystem')
                : theme === 'light'
                ? t('settings.theme.descriptionLight')
                : t('settings.theme.descriptionDark')}
            </Text>
          </Card>
        </Section>

        {/* Accent color preview (read-only, parked) */}
        <Section title={t('settings.accent')}>
          <Card>
            <View style={styles.accentRow}>
              <View style={[styles.accentSwatch, { backgroundColor: brandFill }]}>
                <View style={[styles.accentDot, { backgroundColor: brand }]} />
              </View>
              <Text style={[typography.body, { flex: 1 }]}>
                {t('settings.accent')}
              </Text>
              <Text style={[typography.callout, { color: surface.textMuted }]}>
                emerald-500
              </Text>
            </View>
          </Card>
        </Section>

        {/* Developer */}
        <Section title={t('settings.developer')}>
          <Card>
            <Pressable
              onPress={() => router.push('/design-system')}
              style={({ pressed }) => [
                styles.row,
                { opacity: pressed ? 0.6 : 1 },
              ]}>
              <View style={styles.rowLeft}>
                <Sparkles size={18} color={brand} strokeWidth={1.75} />
                <Text style={typography.body}>{t('settings.designSystem')}</Text>
              </View>
              <ChevronRight size={18} color={surface.textMuted} strokeWidth={1.5} />
            </Pressable>
          </Card>
        </Section>
      </SafeScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { surface } = useAppTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      <Text
        style={[
          typography.micro,
          { color: surface.textMuted, paddingHorizontal: spacing[2] },
        ]}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const { surface } = useAppTheme();
  return (
    <View
      style={{
        backgroundColor: surface.elevated,
        borderRadius: semanticRadius.card,
        borderWidth: 0.5,
        borderColor: surface.border,
        paddingBottom: spacing[2],
      }}>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { surface } = useAppTheme();
  return (
    <View style={styles.row}>
      <Text style={typography.body}>{label}</Text>
      <Text style={[typography.callout, { color: surface.textMuted }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  accentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  accentSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
});
