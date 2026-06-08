/**
 * 404 / not-found screen.
 *
 * Theme: page bg = surface.background; the 404 hero is surface.text.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { spacing, typography, useAppTheme } from '@/theme';

export default function NotFoundScreen() {
  const router = useRouter();
  const { surface, brand } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: surface.background }]}>
      <Text style={[typography.display, { color: surface.text }]}>404</Text>
      <Text style={[typography.body, { color: surface.textMuted, textAlign: 'center' }]}>
        This screen doesn&apos;t exist.
      </Text>
      <Pressable
        onPress={() => router.replace('/')}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: brand, opacity: pressed ? 0.85 : 1 },
        ]}>
        <Text style={[typography.bodyEmphasized, { color: 'white' }]}>
          Go home
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
