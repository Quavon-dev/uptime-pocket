/**
 * 404 / not-found screen.
 *
 * Reached via expo-router when a route doesn't match. The 404 hero
 * is surface.text so it reads as a typographic moment rather than
 * an error state.
 *
 * Theme: page bg = surface.background; the 404 hero is surface.text.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { spacing, typography, useAppTheme } from '@/theme';
import { t } from '@/i18n';

export default function NotFoundScreen() {
  const router = useRouter();
  const { surface, brand } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: surface.background }]}>
      <Text style={[typography.display, { color: surface.text }]}>
        {t('notFound.title')}
      </Text>
      <Text style={[typography.body, { color: surface.textMuted, textAlign: 'center' }]}>
        {t('notFound.body')}
      </Text>
      <Pressable
        onPress={() => router.replace('/')}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: brand, opacity: pressed ? 0.85 : 1 },
        ]}
        accessibilityRole="link"
        accessibilityLabel={t('notFound.action')}>
        <Text style={[typography.bodyEmphasized, { color: 'white' }]}>
          {t('notFound.action')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
    gap: spacing[3],
  },
  btn: {
    marginTop: spacing[4],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderRadius: 16,
  },
});
