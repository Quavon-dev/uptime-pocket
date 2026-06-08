/**
 * ErrorState - shown when something went wrong.
 *
 * Used for connection failures, load errors, etc.
 * - icon: Lucide icon (default = AlertCircle)
 * - title: short headline
 * - body: explanation
 * - onRetry: optional callback to retry
 *
 * Theme: icon in status.down, tinted box uses statusTints.down.bg.
 */

import { View, Text, StyleSheet } from 'react-native';
import { Button } from './Button';
import { colors, spacing, typography, useAppTheme } from '@/theme';
import { AlertCircle, type LucideIcon } from 'lucide-react-native';

interface ErrorStateProps {
  icon?: LucideIcon;
  title: string;
  body?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  icon: Icon = AlertCircle,
  title,
  body,
  onRetry,
  retryLabel = 'Retry',
}: ErrorStateProps) {
  const { surface, statusTints } = useAppTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.iconBox, { backgroundColor: statusTints.down.bg }]}>
        <Icon size={32} color={colors.status.down} strokeWidth={1.5} />
      </View>
      <Text style={[styles.title, typography.heading, { color: surface.text }]}>
        {title}
      </Text>
      {body && (
        <Text
          style={[
            styles.body,
            typography.body,
            { color: surface.textMuted },
          ]}>
          {body}
        </Text>
      )}
      {onRetry && (
        <View style={styles.actionContainer}>
          <Button label={retryLabel} onPress={onRetry} variant="secondary" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[8],
    paddingHorizontal: spacing[6],
    gap: spacing[3],
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    maxWidth: 280,
  },
  actionContainer: {
    marginTop: spacing[3],
  },
});
