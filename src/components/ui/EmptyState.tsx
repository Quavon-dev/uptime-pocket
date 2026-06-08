/**
 * EmptyState - illustrated placeholder.
 *
 * Used when a list is empty or a section has no content.
 * - icon: Lucide icon
 * - title: short headline
 * - body: explanation
 * - action: optional CTA button
 *
 * Theme: title in surface.text, body in surface.textMuted, icon
 * tinted with brand and placed in a brand-tinted box.
 */

import { View, Text, StyleSheet } from 'react-native';
import { Button } from './Button';
import { spacing, typography, useAppTheme } from '@/theme';
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
  const { surface, brand, brandFill } = useAppTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.iconBox, { backgroundColor: brandFill }]}>
        <Icon size={32} color={brand} strokeWidth={1.5} />
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
