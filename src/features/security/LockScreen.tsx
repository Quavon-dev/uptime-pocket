/**
 * LockScreen — full-screen overlay shown when biometric lock is enabled
 * and the user hasn't authenticated this session.
 *
 * We render this as a child of the root layout's providers so it
 * covers the whole UI but still sits inside the safe-area provider
 * and theme context.
 *
 * Three states map to the status returned by useBiometricLock:
 *   - 'locked'        : the prompt auto-shows; this screen shows a
 *                       "Try again" button as a fallback
 *   - 'authenticating': prompt is up; we show a spinner + a "Cancel"
 *                       button (which is mostly a no-op since the
 *                       system prompt has its own cancel)
 *   - 'unavailable'   : device has no biometric; show a message that
 *                       explains and link to Settings
 *   - 'unlocked'      : never rendered (parent hides us)
 *   - 'disabled'      : never rendered (parent hides us)
 */

import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Fingerprint, ShieldAlert, Lock } from 'lucide-react-native';
import { spacing, typography, useAppTheme } from '@/theme';
import { t, tn } from '@/i18n';
import type { LockStatus } from './useBiometricLock';

interface Props {
  status: LockStatus;
  biometryName: string | null;
  onUnlock: () => void;
  onCancel: () => void;
}

export function LockScreen({ status, biometryName, onUnlock, onCancel }: Props) {
  const { surface, brand } = useAppTheme();
  const router = useRouter();

  if (status === 'unlocked' || status === 'disabled') return null;

  const title = (() => {
    if (status === 'unavailable') return t('lock.unavailableTitle');
    return t('lock.title');
  })();
  const body = (() => {
    if (status === 'unavailable') return t('lock.unavailableBody');
    return biometryName
      ? tn('lock.bodyWithBiometry', { biometry: biometryName })
      : t('lock.body');
  })();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: surface.background },
      ]}>
      <View style={styles.content}>
        {status === 'unavailable' ? (
          <ShieldAlert size={56} color={brand} strokeWidth={1.5} />
        ) : status === 'authenticating' ? (
          <ActivityIndicator size="large" color={brand} />
        ) : (
          <Lock size={56} color={brand} strokeWidth={1.5} />
        )}

        <Text
          style={[
            typography.title,
            { color: surface.text, marginTop: spacing[5], textAlign: 'center' },
          ]}>
          {title}
        </Text>
        <Text
          style={[
            typography.callout,
            {
              color: surface.textMuted,
              marginTop: spacing[2],
              textAlign: 'center',
              paddingHorizontal: spacing[6],
            },
          ]}>
          {body}
        </Text>
      </View>

      <View style={styles.actions}>
        {status === 'unavailable' ? (
          <Pressable
            onPress={() => router.push('/(tabs)/settings')}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: brand, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Text style={[typography.bodyEmphasized, { color: 'white' }]}>
              {t('lock.openSettings')}
            </Text>
          </Pressable>
        ) : status === 'authenticating' ? (
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [
              styles.button,
              styles.secondaryButton,
              { borderColor: brand, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Text style={[typography.bodyEmphasized, { color: brand }]}>
              {t('common.cancel')}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onUnlock}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: brand, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Fingerprint
              size={18}
              color="white"
              strokeWidth={1.75}
              style={{ marginRight: spacing[2] }}
            />
            <Text style={[typography.bodyEmphasized, { color: 'white' }]}>
              {t('lock.unlock')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing[6],
    zIndex: 9999, // sit above everything else
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    width: '100%',
    paddingBottom: spacing[4],
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: 14,
    width: '100%',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 0.5,
  },
});
