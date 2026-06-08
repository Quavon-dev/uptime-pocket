/**
 * Welcome / Onboarding screen.
 *
 * Shown the very first time the user launches the app (and any time
 * they have zero servers configured). The screen is a one-CTA
 * "Add your Kuma server" flow that routes to /servers/add.
 *
 * Once the user adds their first server, we mark onboarding complete
 * in the settings store and the app routes to the main tabs.
 *
 * This is intentionally *minimal* — no carousel, no 5-step wizard.
 * One screen, one action. The app's value shows up the moment they
 * connect a server.
 *
 * Theme: page bg = surface.background. Feature cards use the thin
 * glass surface. CTA is brand-filled.
 */

import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Activity, ChevronRight, Shield, Zap, Smartphone } from 'lucide-react-native';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { spacing, typography, semanticRadius, useAppTheme } from '@/theme';
import { t } from '@/i18n';
import { useSettings } from '@/data/store/settings';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { surface, brand, brandFill } = useAppTheme();
  const hasOnboarded = useSettings((s) => s.hasOnboarded);
  const setOnboarded = useSettings((s) => s.setOnboarded);

  const handleAddServer = () => {
    // Mark onboarded so the user doesn't see this screen again
    // even if they back out of the add flow.
    if (!hasOnboarded) setOnboarded(true);
    router.push('/servers/add');
  };

  return (
    <View style={[styles.container, { backgroundColor: surface.background }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      <View style={[styles.content, { paddingTop: insets.top + spacing[8], paddingBottom: insets.bottom + spacing[6] }]}>
        {/* Logo / brand mark */}
        <View style={styles.brand}>
          <View style={[styles.logoWrap, { backgroundColor: brandFill }]}>
            <Activity size={36} color={brand} strokeWidth={2.25} />
          </View>
          <Text style={[typography.title, styles.appName, { color: surface.text }]}>
            {t('app.name')}
          </Text>
          <Text style={[typography.callout, styles.tagline, { color: surface.textMuted }]}>
            {t('app.tagline')}
          </Text>
        </View>

        {/* What you get */}
        <View style={styles.features}>
          <Feature
            icon={<Activity size={18} color={brand} strokeWidth={1.75} />}
            title={t('onboarding.feature1.title')}
            body={t('onboarding.feature1.body')}
          />
          <Feature
            icon={<Zap size={18} color={brand} strokeWidth={1.75} />}
            title={t('onboarding.feature2.title')}
            body={t('onboarding.feature2.body')}
          />
          <Feature
            icon={<Shield size={18} color={brand} strokeWidth={1.75} />}
            title={t('onboarding.feature3.title')}
            body={t('onboarding.feature3.body')}
          />
          <Feature
            icon={<Smartphone size={18} color={brand} strokeWidth={1.75} />}
            title={t('onboarding.feature4.title')}
            body={t('onboarding.feature4.body')}
          />
        </View>

        {/* CTA */}
        <View style={styles.cta}>
          <Pressable
            onPress={handleAddServer}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: brand, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Text style={[typography.bodyEmphasized, { color: 'white' }]}>
              {t('onboarding.cta')}
            </Text>
            <ChevronRight size={18} color="white" strokeWidth={2} />
          </Pressable>

          <Text style={[typography.micro, styles.hint, { color: surface.textMuted }]}>
            {t('onboarding.hint')}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const { surface, brandFill } = useAppTheme();
  return (
    <GlassSurface variant="thin" radius={semanticRadius.card} style={styles.featureCard}>
      <View style={[styles.featureIcon, { backgroundColor: brandFill }]}>
        {icon}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.bodyEmphasized, { color: surface.text }]}>
          {title}
        </Text>
        <Text style={[typography.caption, { color: surface.textMuted }]}>
          {body}
        </Text>
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: spacing[6],
    justifyContent: 'space-between',
  },
  brand: {
    alignItems: 'center',
    gap: spacing[2],
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  appName: {
    // color set inline
  },
  tagline: {
    textAlign: 'center',
  },
  features: {
    gap: spacing[2],
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: {
    gap: spacing[2],
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[4],
    borderRadius: semanticRadius.button,
  },
  hint: {
    textAlign: 'center',
    paddingHorizontal: spacing[4],
  },
});
