/**
 * OptInCard — the in-app card that asks the user to enable
 * notifications the first time it makes sense.
 *
 * This is the iOS-friendly "ask in context" pattern: the user is
 * about to get their first monitor up, so we explain what we'll send
 * and offer an Allow button that triggers the system prompt.
 *
 * If the user taps "Not now", the card is dismissed and won't show
 * again (we set status to 'denied').
 *
 * We do NOT show this card if the user has already granted permission
 * at the OS level — that's the point of the cross-check in optIn.ts.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Bell } from 'lucide-react-native';
import { spacing, typography, useAppTheme } from '@/theme';
import { t } from '@/i18n';
import {
  requestNotificationPermission,
  type OptInStatus,
} from './optIn';

interface Props {
  /** Current opt-in status; the parent owns it. */
  status: OptInStatus;
  /** Called when the user makes a choice (so the parent can persist). */
  onChange: (next: OptInStatus) => void;
}

export function OptInCard({ status, onChange }: Props) {
  const { surface, brand, statusTints } = useAppTheme();

  if (status !== 'ask') return null;

  const handleAllow = async () => {
    const ok = await requestNotificationPermission();
    onChange(ok ? 'granted' : 'denied');
  };
  const handleSkip = () => onChange('denied');

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: surface.elevated, borderColor: surface.border },
      ]}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: brand }]}>
          <Bell size={20} color="white" strokeWidth={1.75} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodyEmphasized, { color: surface.text }]}>
            {t('notifications.permission.title')}
          </Text>
          <Text
            style={[
              typography.callout,
              { color: surface.textMuted, marginTop: 4 },
            ]}>
            {t('notifications.permission.body')}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handleSkip}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { borderColor: statusTints.down.bg, opacity: pressed ? 0.85 : 1 },
          ]}>
          <Text style={[typography.bodyEmphasized, { color: surface.textMuted }]}>
            {t('notifications.permission.skip')}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleAllow}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: brand, opacity: pressed ? 0.85 : 1 },
          ]}>
          <Text style={[typography.bodyEmphasized, { color: 'white' }]}>
            {t('notifications.permission.allow')}
          </Text>
        </Pressable>
      </View>

      <Text
        style={[
          typography.caption,
          { color: surface.textSubtle, marginTop: spacing[2] },
        ]}>
        {t('notifications.permission.laterHint')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 0.5,
    padding: spacing[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[4],
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
  },
});
