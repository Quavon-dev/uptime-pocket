/**
 * Tab navigation layout.
 *
 * Phase 0 uses the standard `<Tabs>` from expo-router. We will
 * migrate to `<NativeTabs>` from `expo-router/unstable-native-tabs`
 * in Phase 1, which gives us real UITabBar on iOS and Material 3
 * NavigationBar on Android (with iOS 26 Liquid Glass in the chrome).
 *
 * The 4 destinations:
 * - Monitors: home, monitor list, monitor detail
 * - Incidents: history
 * - Servers: server management
 * - Settings: app preferences
 */

import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useColorScheme } from 'react-native';
import { colors } from '@/theme';
import { t } from '@/i18n';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const activeTint = isDark ? colors.brand[400] : colors.brand[600];
  const inactiveTint = isDark ? colors.gray[500] : colors.gray[400];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: inactiveTint,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? colors.surface.dark.elevated : colors.surface.light.elevated,
          borderTopColor: isDark ? colors.surface.dark.border : colors.surface.light.border,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.monitors'),
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{ ios: 'dot.radiowaves.left.and.right', android: 'circle', web: 'circle' }}
              tintColor={color}
              size={size ?? 24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="incidents"
        options={{
          title: t('tabs.incidents'),
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{ ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' }}
              tintColor={color}
              size={size ?? 24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="servers"
        options={{
          title: t('tabs.servers'),
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{ ios: 'server.rack', android: 'storage', web: 'storage' }}
              tintColor={color}
              size={size ?? 24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
              tintColor={color}
              size={size ?? 24}
            />
          ),
        }}
      />
    </Tabs>
  );
}
