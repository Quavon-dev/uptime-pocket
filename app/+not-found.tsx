/**
 * 404 / not-found screen.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, typography } from '@/theme';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={[typography.display, { color: colors.surface.light.text }]}>
        404
      </Text>
      <Text style={[typography.body, { color: colors.gray[500], textAlign: 'center' }]}>
        This screen doesn&apos;t exist.
      </Text>
      <Pressable
        onPress={() => router.replace('/')}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: colors.brand[500], opacity: pressed ? 0.85 : 1 },
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
    backgroundColor: colors.surface.light.background,
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
