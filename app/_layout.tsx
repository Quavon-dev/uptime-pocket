/**
 * Root layout - providers, theme, navigation.
 *
 * Sets up:
 * - Reanimated 4 (must be imported first)
 * - Safe area provider
 * - Theme context
 * - Native tabs navigation
 * - Onboarding gate (redirects to /welcome when no servers exist)
 */

import '../global.css'; // NativeWind v5 stylesheet
import 'react-native-reanimated'; // must be first

import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, SplashScreen, Redirect, usePathname } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';

import { useServers } from '@/data/store/servers';
import { useServersHydrated } from '@/features/servers/useServersHydrated';
import { useKumaConnection } from '@/data/connection/manager';
import { colors, useAppTheme } from '@/theme';

// Prevent splash from auto-hiding until we're ready
SplashScreen.preventAutoHideAsync().catch(() => {
  // already prevented
});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    // We don't load custom fonts in Phase 0; system fonts only.
  });
  const { hydrated: serversHydrated } = useServersHydrated();
  // Start the connection manager (no-op until activeServerId is set).
  useKumaConnection();
  const { surface, isDark } = useAppTheme();

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded && serversHydrated) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded, serversHydrated]);

  if (!loaded) {
    return (
      <View style={[styles.loading, { backgroundColor: surface.background }]}>
        <ActivityIndicator size="large" color={colors.brand[500]} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <OnboardingGate>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: surface.background,
              },
            }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="welcome" />
            <Stack.Screen
              name="servers/add"
              options={{
                presentation: 'modal',
                gestureEnabled: true,
              }}
            />
          </Stack>
        </OnboardingGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * OnboardingGate — the first-launch flow.
 *
 * Logic:
 * - If the user has zero servers configured, send them to /welcome.
 * - If the user has at least one server and is on /welcome, send them
 *   to the main tabs (this happens right after they add their first
 *   server via the welcome CTA).
 * - If the user has at least one server and is on any other route,
 *   leave them alone.
 *
 * We deliberately do NOT look at hasOnboarded alone. The strongest signal
 * is "do you have a working server" — if you don't, we always route you
 * to /welcome regardless of the flag (in case the user deleted their last
 * server, we want them to add another).
 *
 * The /servers/add route is always reachable (so the user can still add
 * a server from the gate, and from the Servers tab at any time).
 */
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const servers = useServers((s) => s.servers);
  const pathname = usePathname();

  const serverCount = servers.length;
  const onWelcome = pathname === '/welcome';
  const onAddServer = pathname === '/servers/add' || pathname.startsWith('/servers/');

  // No servers → always go to /welcome (except when already on add/welcome)
  if (serverCount === 0 && !onWelcome && !onAddServer) {
    return <Redirect href="/welcome" />;
  }

  // Has servers but still on /welcome (e.g. just saved their first server) → tabs
  if (serverCount > 0 && onWelcome) {
    return <Redirect href="/" />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // bg color is set inline via useAppTheme() so the loading splash
    // matches the user's selected theme
  },
});
