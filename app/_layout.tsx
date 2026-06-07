/**
 * Root layout - providers, theme, navigation.
 *
 * This is the entry point for Expo Router. It sets up:
 * - Reanimated 4 (must be imported first)
 * - Safe area provider
 * - Theme context
 * - Native tabs navigation
 *
 * Phase 0: empty native tabs with our 4 destinations wired up
 * but only the "Monitors" tab has a real screen.
 */

import '../global.css'; // NativeWind v5 stylesheet
import 'react-native-reanimated'; // must be first

import { useEffect, useMemo } from 'react';
import { useColorScheme, View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, SplashScreen } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';

import { useSettings } from '@/data/store/settings';
import { useServers } from '@/data/store/servers';
import { SAMPLE_SERVER } from '@/lib/sample-data';
import { colors } from '@/theme';

// Prevent splash from auto-hiding until we're ready
SplashScreen.preventAutoHideAsync().catch(() => {
  // already prevented
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = useSettings((s) => s.theme);
  const servers = useServers((s) => s.servers);
  const addServer = useServers((s) => s.addServer);
  const [loaded, error] = useFonts({
    // We don't load custom fonts in Phase 0; system fonts only.
  });

  // Dev seed: add a sample server if there are none.
  // This makes the app demo-able without a real Kuma connection.
  useEffect(() => {
    if (servers.length === 0) {
      addServer(SAMPLE_SERVER);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded]);

  const effectiveColorScheme = useMemo(() => {
    if (theme === 'system') return colorScheme ?? 'light';
    return theme;
  }, [theme, colorScheme]);

  if (!loaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand[500]} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style={effectiveColorScheme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor:
                effectiveColorScheme === 'dark'
                  ? colors.surface.dark.background
                  : colors.surface.light.background,
            },
          }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.light.background,
  },
});
