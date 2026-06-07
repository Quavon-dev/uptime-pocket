/**
 * Monitors tab - the main screen of the app.
 *
 * Phase 0: Shows a styled empty state with a CTA to add a Kuma server.
 * Phase 3: Will show the actual monitor list with live socket.io updates.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { colors, spacing, typography, semanticRadius } from '@/theme';
import { t } from '@/i18n';

export default function MonitorsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface.light.background }]}>
      <GlassNavBar title="Monitors" large subtitle={t('app.tagline')} />

      <View style={[styles.content, { paddingBottom: insets.bottom + 80 }]}>
        <View style={styles.emptyState}>
          <View
            style={[
              styles.emptyIcon,
              { backgroundColor: `${colors.brand[500]}1A` },
            ]}>
            <SymbolView
              name={{ ios: 'dot.radiowaves.left.and.right', android: 'circle', web: 'circle' }}
              tintColor={colors.brand[500]}
              size={48}
            />
          </View>

          <Text style={[styles.emptyTitle, typography.heading]}>
            {t('monitors.empty.title')}
          </Text>
          <Text style={[styles.emptyBody, typography.body, { color: colors.gray[500] }]}>
            {t('monitors.empty.body')}
          </Text>

          <Pressable
            onPress={() => router.push('/servers/add')}
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: colors.brand[500],
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}>
            <SymbolView
              name={{ ios: 'plus', android: 'add', web: 'add' }}
              tintColor="white"
              size={18}
            />
            <Text style={[styles.ctaText, typography.bodyEmphasized]}>
              {t('monitors.empty.action')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing[3],
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  emptyTitle: {
    color: colors.surface.light.text,
    textAlign: 'center',
  },
  emptyBody: {
    textAlign: 'center',
    maxWidth: 280,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderRadius: semanticRadius.button,
    marginTop: spacing[4],
  },
  ctaText: {
    color: 'white',
  },
});
