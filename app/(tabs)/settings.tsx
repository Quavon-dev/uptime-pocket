/**
 * Settings tab - app preferences.
 *
 * Phase A4/A5: theme, accent color picker, biometric lock, quiet hours.
 *
 * Theme: page bg = surface.background. Theme picker is a SegmentedControl
 * bound to the settings store. Accent picker is a horizontal row of
 * swatches. Quiet hours uses a custom two-column TimePicker.
 *
 * Every change writes through to SQLite via the store's persist path.
 */

import { View, Text, Pressable, Switch, StyleSheet, ScrollView, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Sparkles, ChevronRight, Bell, Moon, Globe, Shield, RotateCcw } from 'lucide-react-native';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import {
  SafeScrollView,
  SegmentedControl,
  TimePicker,
  formatMinute,
  quietHoursHint,
} from '@/components/ui';
import { spacing, typography, semanticRadius, useAppTheme, colors } from '@/theme';
import { ACCENT_SWATCHES } from '@/theme/swatches';
import { useSettings, type ThemeMode } from '@/data/store/settings';
import { t } from '@/i18n';
import { SUPPORTED_LOCALES, type LocalePreference, LOCALE_SYSTEM } from '@/i18n';

export default function SettingsScreen() {
  const router = useRouter();
  const { surface, brand, brandFill } = useAppTheme();

  // Read everything via individual selectors so each row only re-renders
  // when its own field changes.
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);

  const locale = useSettings((s) => s.locale);
  const setLocale = useSettings((s) => s.setLocale);

  const accentSwatchId = useSettings((s) => s.accentSwatchId);
  const setAccentSwatchId = useSettings((s) => s.setAccentSwatchId);
  const setAccentColor = useSettings((s) => s.setAccentColor);

  const biometricLock = useSettings((s) => s.biometricLock);
  const setBiometricLock = useSettings((s) => s.setBiometricLock);

  // Destructive: resets ALL settings (theme, accent, language, biometric
  // lock, quiet hours) to defaults. Servers, monitors,
  // and credentials in expo-secure-store are NOT touched. See
  // settings.reset.* in the i18n files.
  const resetAll = useSettings((s) => s.resetAll);

  const quietEnabled = useSettings((s) => s.quietHoursEnabled);
  const quietStart = useSettings((s) => s.quietHoursStartMinute);
  const quietEnd = useSettings((s) => s.quietHoursEndMinute);
  const setQuietHours = useSettings((s) => s.setQuietHours);

  return (
    <View style={[styles.container, { backgroundColor: surface.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar title={t('settings.title')} />

      <SafeScrollView
        contentContainerStyle={{
          padding: spacing[4],
          gap: spacing[5],
          paddingBottom: spacing[10],
        }}>
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

          {/* Language picker. Horizontal chip row so 6 options don't
              crowd the layout. Native names come from t() so the row
              renders in the user's current language — picking a chip
              then flips the whole UI to the picked locale. */}
          <Card>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Globe size={18} color={brand} strokeWidth={1.75} />
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{t('settings.language.title')}</Text>
                  <Text
                    style={[
                      typography.caption,
                      { color: surface.textMuted, marginTop: 2 },
                    ]}>
                    {t('settings.language.description')}
                  </Text>
                </View>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.localeRow}>
              <LocaleChip
                code={LOCALE_SYSTEM}
                label={t('settings.language.system')}
                active={locale === LOCALE_SYSTEM}
                onPress={setLocale}
              />
              {SUPPORTED_LOCALES.map((code) => (
                <LocaleChip
                  key={code}
                  code={code}
                  label={t(`settings.language.${code}` as 'settings.language.en')}
                  active={locale === code}
                  onPress={setLocale}
                />
              ))}
            </ScrollView>
          </Card>
        </Section>

        {/* Accent color picker */}
        <Section title={t('settings.accentSwatch.title')}>
          <Card>
            <View style={styles.swatchRow}>
              {ACCENT_SWATCHES.map((sw) => {
                const active = sw.id === accentSwatchId;
                return (
                  <Pressable
                    key={sw.id}
                    onPress={() => {
                      setAccentSwatchId(sw.id);
                      setAccentColor(sw.hex);
                    }}
                    style={({ pressed }) => [
                      styles.swatchPress,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                    accessibilityRole="radio"
                    accessibilityLabel={sw.name}
                    accessibilityState={{ selected: active }}>
                    <View
                      style={[
                        styles.swatchRing,
                        {
                          borderColor: active ? brand : 'transparent',
                        },
                      ]}>
                      <View
                        style={[
                          styles.swatchFill,
                          { backgroundColor: sw.fill },
                        ]}>
                        <View
                          style={[
                            styles.swatchDot,
                            { backgroundColor: sw.brand },
                          ]}
                        />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <Text
              style={[
                typography.caption,
                {
                  color: surface.textSubtle,
                  paddingHorizontal: spacing[4],
                  paddingTop: spacing[2],
                  paddingBottom: spacing[3],
                },
              ]}>
              {t('settings.accentSwatch.description')}
            </Text>
          </Card>
        </Section>

        {/* Notifications - quiet hours */}
        <Section title={t('settings.notifications')}>
          <Card>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Moon size={18} color={brand} strokeWidth={1.75} />
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{t('settings.quietHours.title')}</Text>
                  <Text
                    style={[
                      typography.caption,
                      { color: surface.textMuted, marginTop: 2 },
                    ]}>
                    {t('settings.quietHours.description')}
                  </Text>
                </View>
              </View>
              <Switch
                value={quietEnabled}
                onValueChange={(v) =>
                  setQuietHours({
                    enabled: v,
                    startMinute: quietStart,
                    endMinute: quietEnd,
                  })
                }
                trackColor={{ false: surface.sunken, true: brand }}
                // a11y: the visible text already explains what the
                // switch does, but screen readers need an explicit
                // label + role on the Switch itself.
                accessibilityRole="switch"
                accessibilityLabel={t('settings.quietHours.title')}
                accessibilityState={{ checked: quietEnabled }}
              />
            </View>

            {quietEnabled && (
              <View style={{ padding: spacing[3], gap: spacing[3] }}>
                <TimePicker
                  label={t('settings.quietHours.start')}
                  value={quietStart}
                  onChange={(v) =>
                    setQuietHours({
                      enabled: true,
                      startMinute: v,
                      endMinute: quietEnd,
                    })
                  }
                />
                <TimePicker
                  label={t('settings.quietHours.end')}
                  value={quietEnd}
                  onChange={(v) =>
                    setQuietHours({
                      enabled: true,
                      startMinute: quietStart,
                      endMinute: v,
                    })
                  }
                />
                <View style={styles.quietSummary}>
                  <Text style={[typography.caption, { color: surface.textMuted }]}>
                    {formatMinute(quietStart)} → {formatMinute(quietEnd)}
                  </Text>
                  {quietHoursHint(quietStart, quietEnd) && (
                    <Text
                      style={[
                        typography.caption,
                        { color: surface.textSubtle, marginTop: 2 },
                      ]}>
                      {quietHoursHint(quietStart, quietEnd)}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </Card>
        </Section>

        {/* Security */}
        <Section title={t('settings.security')}>
          <Card>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Bell size={18} color={brand} strokeWidth={1.75} />
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{t('settings.biometric.title')}</Text>
                  <Text
                    style={[
                      typography.caption,
                      { color: surface.textMuted, marginTop: 2 },
                    ]}>
                    {t('settings.biometric.description')}
                  </Text>
                </View>
              </View>
              <Switch
                value={biometricLock}
                onValueChange={setBiometricLock}
                trackColor={{ false: surface.sunken, true: brand }}
                // a11y: bind the switch to the visible label for screen readers.
                accessibilityRole="switch"
                accessibilityLabel={t('settings.biometric.title')}
                accessibilityState={{ checked: biometricLock }}
              />
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

        {/* Legal — link to the in-app privacy policy screen. We use
            the same Card/Pressable/ChevronRight pattern as the
            Developer section so the entry visually matches its
            neighbors. */}
        <Section title={t('legal.sectionTitle')}>
          <Card>
            <Pressable
              onPress={() => router.push('/settings/legal')}
              style={({ pressed }) => [
                styles.row,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="link"
              accessibilityLabel={t('legal.privacy.title')}>
              <View style={styles.rowLeft}>
                <Shield size={18} color={brand} strokeWidth={1.75} />
                <Text style={typography.body}>{t('legal.privacy.title')}</Text>
              </View>
              <ChevronRight size={18} color={surface.textMuted} strokeWidth={1.5} />
            </Pressable>
          </Card>
        </Section>

        {/* App info */}
        <Section title={t('settings.about')}>
          <Card>
            <Row label="Version" value="0.2.0" />
            <Row label="Kuma target" value="2.0+" />
            <Row label="License" value="MIT" />
          </Card>
        </Section>

        {/* Danger zone — reset all settings. The confirmation
            dialog spells out exactly what's affected and what's
            preserved, so the user can decide with full information. */}
        <Section title={t('settings.reset.sectionTitle')}>
          <Card>
            <Pressable
              onPress={() => {
                Alert.alert(
                  t('settings.reset.confirmTitle'),
                  t('settings.reset.confirmBody'),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('settings.reset.confirmAction'),
                      style: 'destructive',
                      onPress: () => {
                        void resetAll();
                      },
                    },
                  ]
                );
              }}
              style={({ pressed }) => [
                styles.row,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('settings.reset.title')}>
              <View style={styles.rowLeft}>
                <RotateCcw size={18} color={colors.status.down} strokeWidth={1.75} />
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>
                    {t('settings.reset.title')}
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      { color: surface.textMuted, marginTop: 2 },
                    ]}>
                    {t('settings.reset.description')}
                  </Text>
                </View>
              </View>
            </Pressable>
          </Card>
        </Section>

        {/* Hidden reference so TS sees the import even if user later
            removes the dev section. */}
        <View style={{ height: 0, opacity: 0 }} accessible={false}>
          <Text>{brandFill}</Text>
        </View>
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

function LocaleChip({
  code,
  label,
  active,
  onPress,
}: {
  code: LocalePreference;
  label: string;
  active: boolean;
  onPress: (c: LocalePreference) => void;
}) {
  const { surface, brand, brandFill } = useAppTheme();
  return (
    <Pressable
      onPress={() => onPress(code)}
      style={({ pressed }) => [
        styles.localeChip,
        {
          backgroundColor: active ? brandFill : surface.sunken,
          borderColor: active ? brand : surface.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}>
      <Text
        style={[
          typography.bodyEmphasized,
          {
            color: active ? '#FFFFFF' : surface.text,
          },
        ]}>
        {label}
      </Text>
    </Pressable>
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
    gap: spacing[3],
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  swatchPress: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchFill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  quietSummary: {
    paddingTop: spacing[1],
  },
  localeRow: {
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  localeChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: semanticRadius.pill,
    borderWidth: 1,
  },
});
