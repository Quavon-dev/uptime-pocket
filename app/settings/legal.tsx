/**
 * Legal / privacy policy screen.
 *
 * Renders the in-app privacy policy. Reachable from:
 * - The "Read the full policy" link on the first-launch consent gate
 * - The "Legal" section in Settings
 *
 * The screen shows a short summary at the top (the same text as the
 * gate's body), then three expandable sections. We intentionally keep
 * the full text short and approachable; the long-form canonical policy
 * is at docs/privacy.md in the repo. The on-device view is the
 * authoritative user-facing text — if it ever drifts from the doc, the
 * doc should be updated to match this screen, not the other way around.
 *
 * No legal advice
 * ---------------
 * This text was drafted for transparency, not as legal counsel. Leopold
 * should have a lawyer review it before public submission, especially
 * the "International transfers" and "Children" sections.
 */

import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { t, tn } from '@/i18n';

const PRIVACY_LAST_UPDATED = '2026-06-09';

interface Section {
  key: 'onDevice' | 'offDevice' | 'control';
  titleKey: string;
  bodyKey: string;
}

const SECTIONS: Section[] = [
  {
    key: 'onDevice',
    titleKey: 'legal.privacy.sections.onDevice.title',
    bodyKey: 'legal.privacy.sections.onDevice.body',
  },
  {
    key: 'offDevice',
    titleKey: 'legal.privacy.sections.offDevice.title',
    bodyKey: 'legal.privacy.sections.offDevice.body',
  },
  {
    key: 'control',
    titleKey: 'legal.privacy.sections.control.title',
    bodyKey: 'legal.privacy.sections.control.body',
  },
];

export default function LegalScreen() {
  const { surface } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: surface.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassNavBar title={t('legal.privacy.title')} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { padding: spacing[4], gap: spacing[4], paddingBottom: spacing[10] },
        ]}
        showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.intro,
            { backgroundColor: surface.elevated, borderColor: surface.sunken },
          ]}
          accessibilityLabel={t('legal.privacy.shortVersion')}>
          <Text style={[typography.body, { color: surface.text }]}>
            {t('legal.privacy.shortVersion')}
          </Text>
          <Text
            style={[
              typography.caption,
              styles.lastUpdated,
              { color: surface.textSubtle },
            ]}>
            {tn('legal.privacy.lastUpdated', { date: PRIVACY_LAST_UPDATED })}
          </Text>
        </View>

        {SECTIONS.map((s) => (
          <View
            key={s.key}
            style={[
              styles.section,
              { backgroundColor: surface.elevated, borderColor: surface.sunken },
            ]}
            // a11y: each section is a labeled container so screen
            // readers can navigate them as distinct units.
            accessibilityRole="summary"
            accessibilityLabel={t(s.titleKey)}>
            <Text
              style={[typography.bodyEmphasized, styles.sectionTitle, { color: surface.text }]}
              accessibilityRole="header">
              {t(s.titleKey)}
            </Text>
            <Text style={[typography.body, { color: surface.textMuted, lineHeight: 22 }]}>
              {t(s.bodyKey)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1 },
  intro: {
    borderRadius: semanticRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing[4],
    gap: spacing[2],
  },
  lastUpdated: {
    marginTop: spacing[1],
  },
  section: {
    borderRadius: semanticRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing[4],
    gap: spacing[2],
  },
  sectionTitle: {
    marginBottom: spacing[1],
  },
});
