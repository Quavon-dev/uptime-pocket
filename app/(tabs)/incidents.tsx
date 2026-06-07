/**
 * Incidents tab - history of monitor down/recovery events.
 * Phase 0: placeholder. Phase 4+ will populate from local DB.
 */

import { View, Text, StyleSheet } from 'react-native';
import { GlassNavBar } from '@/components/glass/GlassNavBar';
import { colors, spacing, typography } from '@/theme';

export default function IncidentsScreen() {
  return (
    <View style={styles.container}>
      <GlassNavBar title="Incidents" />
      <View style={styles.placeholder}>
        <Text style={[typography.body, { color: colors.gray[500] }]}>
          Incidents will appear here once you add a Kuma server.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.light.background },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
});
