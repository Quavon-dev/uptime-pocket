/**
 * EmptyState - illustrated placeholder.
 *
 * Used when a list is empty or a section has no content.
 * - icon: Lucide icon
 * - title: short headline
 * - body: explanation
 * - action: optional CTA button
 */

import { View, Text, StyleSheet } from 'react-native';
import { Button } from './Button';
import { colors, spacing, typography } from '@/theme';
import type { LucideIcon } from 'lucide-react-native';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export function EmptyState({ icon: Icon, title, body, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconBox}>
        <Icon size={32} color={colors.brand[500]} strokeWidth={1.5} />
      </View>
      <Text style={[styles.title, typography.heading]}>{title}</Text>
      {body && (
        <Text style={[styles.body, typography.body, { color: colors.surface.light.textMuted }]}>
          {body}
        </Text>
      )}
      {action && (
        <View style={styles.actionContainer}>
          <Button label={action.label} onPress={action.onPress} />
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
    backgroundColor: `${colors.brand[500]}14`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  title: {
    color: colors.surface.light.text,
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
