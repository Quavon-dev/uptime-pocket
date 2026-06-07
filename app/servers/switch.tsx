/**
 * Server switcher screen.
 *
 * Wraps the <ServerSwitcher> component as a modal-style route.
 */

import { Stack } from 'expo-router';
import { ServerSwitcher } from '@/components/server';

export default function ServerSwitcherScreen() {
  return (
    <>
      <Stack.Screen
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      <ServerSwitcher />
    </>
  );
}
