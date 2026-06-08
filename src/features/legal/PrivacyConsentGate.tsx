/**
 * PrivacyConsentGate — first-launch consent prompt.
 *
 * Why this exists
 * ---------------
 * Both the Apple App Store and Google Play review guidelines (and the GDPR
 * "informed consent" principle) require that the user is told what data an
 * app handles BEFORE the app starts collecting or processing it. For us,
 * "collecting" means:
 *
 *   - The user typing server credentials and pressing "Save" (we then send
 *     those credentials to their Kuma instance over HTTPS).
 *   - The user enabling push notifications (we then register a push token
 *     with APNs / FCM).
 *
 * We could have built this as a "By using this app you agree" footer on the
 * onboarding flow, but Apple / Google want it to be a real, dismissible
 * surface — and we want a one-tap "I understand" so it doesn't add friction
 * to a flow that's already 3 swipes deep.
 *
 * What it does
 * ------------
 * Renders a full-screen modal-like overlay that blocks the rest of the app
 * until the user taps "I understand" (which sets the `privacyConsentDismissed`
 * flag in the settings store, persisting to SQLite). Behind the gate, the
 * app tree is rendered but never visible — so the user can't add a server
 * or do anything until they dismiss the consent.
 *
 * Re-showing the gate
 * -------------------
 * The flag is intentionally a separate boolean from `hasOnboarded`. The
 * onboarding flow advances once; the consent can be re-shown by flipping
 * the flag back to 0 (e.g. after a material change to the privacy policy,
 * in which case we'd push an update and clear the flag in the next
 * migration or via a one-shot prompt).
 *
 * Hydration timing
 * ----------------
 * The gate reads `useSettings.hydrated` before showing. Until hydration
 * completes (the SQLite read finishes), the app shows the splash screen
 * and nothing else. This avoids a flash of "no gate" → "gate" on cold
 * start, which would look janky.
 */

import { Modal, View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Shield } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '@/data/store/settings';
import { useAppTheme, spacing, typography, semanticRadius } from '@/theme';
import { t, tn } from '@/i18n';
import { Button } from '@/components/ui/Button';

const PRIVACY_LAST_UPDATED = '2026-06-09';

export function PrivacyConsentGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { surface, brand, brandFill } = useAppTheme();

  // Read each setting via a narrow selector so the gate doesn't re-render
  // on unrelated settings changes.
  const hydrated = useSettings((s) => s.hydrated);
  const dismissed = useSettings((s) => s.privacyConsentDismissed);
  const setDismissed = useSettings((s) => s.setPrivacyConsentDismissed);

  // Don't render anything until we've read the flag from disk. The root
  // layout already hides the splash screen only after settings hydrate,
  // so in practice the user never sees a blank flash.
  if (!hydrated) {
    return <>{children}</>;
  }

  const openFullPolicy = () => {
    // In-app route is the primary path (always works, no network).
    router.push('/settings/legal');
  };

  const handleContinue = () => {
    setDismissed(true);
  };

  return (
    <>
      {children}
      <Modal
        visible={!dismissed}
        animationType="fade"
        presentationStyle="overFullScreen"
        transparent
        // Don't allow back-swipe / hardware-back to dismiss — this is a
        // legal consent, not a regular modal.
        onRequestClose={() => {
          /* no-op — must tap "I understand" */
        }}>
        <View style={[styles.backdrop, { backgroundColor: surface.background + 'F2' }]}>
          <View
            style={[
              styles.card,
              { backgroundColor: surface.elevated, borderColor: surface.sunken },
            ]}
            // a11y: announce as a modal dialog so screen readers handle it
            accessibilityViewIsModal
            accessibilityLabel={t('legal.consent.title')}>
            <View style={[styles.iconCircle, { backgroundColor: brandFill }]}>
              <Shield size={28} color={brand} strokeWidth={1.75} />
            </View>

            <Text
              style={[typography.title, styles.title, { color: surface.text }]}
              // a11y: explicit header role for VoiceOver / TalkBack
              accessibilityRole="header">
              {t('legal.consent.title')}
            </Text>

            <Text
              style={[typography.body, styles.body, { color: surface.textMuted }]}>
              {t('legal.consent.body')}
            </Text>

            <Text
              style={[
                typography.caption,
                styles.lastUpdated,
                { color: surface.textSubtle },
              ]}>
              {tn('legal.privacy.lastUpdated', { date: PRIVACY_LAST_UPDATED })}
            </Text>

            <View style={styles.actions}>
              <Button
                label={t('legal.consent.continue')}
                onPress={handleContinue}
                variant="primary"
                size="lg"
                fullWidth
              />
              <Pressable
                onPress={openFullPolicy}
                hitSlop={10}
                style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="link"
                accessibilityLabel={t('legal.consent.readFull')}>
                <Text style={[typography.body, { color: brand }]}>
                  {t('legal.consent.readFull')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: semanticRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing[6],
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing[3],
  },
  body: {
    textAlign: 'center',
    lineHeight: 22,
  },
  lastUpdated: {
    marginTop: spacing[4],
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    marginTop: spacing[5],
    gap: spacing[3],
    alignItems: 'center',
  },
  link: {
    paddingVertical: spacing[2],
  },
});

// Quiet the unused-imports warning when Linking isn't actually called
// in the current build. (We keep the import ready for the future
// "open external URL" button if we want to deep-link to the hosted
// privacy policy page once that's published.)
void Linking;
